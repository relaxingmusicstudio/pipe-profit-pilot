-- ============================================================================
-- BATCH 2.1: Lead Normalization Layer
-- Creates lead_profiles table, enums, helper functions, RLS, and audit triggers
-- ============================================================================

-- 1) Create enums (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lead_segment') THEN
    CREATE TYPE public.lead_segment AS ENUM ('b2b', 'b2c', 'unknown');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lead_temperature_type') THEN
    CREATE TYPE public.lead_temperature_type AS ENUM ('ice_cold', 'cold', 'warm', 'hot', 'booked', 'closed');
  END IF;
END$$;

-- 2) Create helper functions (IMMUTABLE for fingerprinting)
CREATE OR REPLACE FUNCTION public.normalize_email(raw_email text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF raw_email IS NULL OR raw_email = '' THEN
    RETURN NULL;
  END IF;
  -- Lowercase, trim whitespace
  RETURN LOWER(TRIM(raw_email));
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_phone(raw_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  digits_only text;
BEGIN
  IF raw_phone IS NULL OR raw_phone = '' THEN
    RETURN NULL;
  END IF;
  -- Keep only digits
  digits_only := regexp_replace(raw_phone, '[^0-9]', '', 'g');
  -- Take last 10 digits (US number normalization)
  IF length(digits_only) >= 10 THEN
    RETURN RIGHT(digits_only, 10);
  END IF;
  RETURN digits_only;
END;
$$;

CREATE OR REPLACE FUNCTION public.compute_lead_fingerprint(
  p_email text,
  p_phone text,
  p_company_name text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  norm_email text;
  norm_phone text;
  norm_company text;
  fingerprint_raw text;
BEGIN
  norm_email := public.normalize_email(p_email);
  norm_phone := public.normalize_phone(p_phone);
  norm_company := LOWER(TRIM(COALESCE(p_company_name, '')));
  
  -- Build deterministic fingerprint: email|phone|company
  fingerprint_raw := COALESCE(norm_email, '') || '|' || COALESCE(norm_phone, '') || '|' || norm_company;
  
  -- Return SHA256 hash (truncated to 32 chars for readability)
  RETURN LEFT(encode(sha256(fingerprint_raw::bytea), 'hex'), 32);
END;
$$;

-- 3) Create lead_profiles table
CREATE TABLE IF NOT EXISTS public.lead_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  segment public.lead_segment DEFAULT 'unknown',
  temperature public.lead_temperature_type DEFAULT 'ice_cold',
  company_name text,
  industry text,
  job_title text,
  decision_maker boolean DEFAULT false,
  consumer_profile jsonb DEFAULT '{}'::jsonb,
  enrichment_data jsonb DEFAULT '{}'::jsonb,
  enriched_at timestamptz,
  fingerprint text NOT NULL,
  is_primary boolean DEFAULT true,
  merged_from uuid[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 4) Create constraints and indexes (idempotent)
DO $$
BEGIN
  -- Unique constraint on (tenant_id, fingerprint) WHERE is_primary = true
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'lead_profiles_tenant_fingerprint_primary_unique'
  ) THEN
    CREATE UNIQUE INDEX lead_profiles_tenant_fingerprint_primary_unique 
      ON public.lead_profiles(tenant_id, fingerprint) 
      WHERE is_primary = true;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_lead_profiles_tenant_id ON public.lead_profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lead_profiles_fingerprint ON public.lead_profiles(fingerprint);
CREATE INDEX IF NOT EXISTS idx_lead_profiles_segment_temp ON public.lead_profiles(segment, temperature);
CREATE INDEX IF NOT EXISTS idx_lead_profiles_lead_id ON public.lead_profiles(lead_id);

-- 5) Trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_lead_profiles_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_lead_profiles_updated_at ON public.lead_profiles;
CREATE TRIGGER trigger_lead_profiles_updated_at
  BEFORE UPDATE ON public.lead_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_lead_profiles_updated_at();

-- 6) Enable RLS
ALTER TABLE public.lead_profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies before creating (idempotent)
DROP POLICY IF EXISTS "Tenant isolation for lead_profiles" ON public.lead_profiles;
DROP POLICY IF EXISTS "Service role full access lead_profiles" ON public.lead_profiles;

-- Tenant isolation policy
CREATE POLICY "Tenant isolation for lead_profiles"
  ON public.lead_profiles
  FOR ALL
  USING (tenant_id = get_user_tenant_id() OR tenant_id IS NULL);

-- Service role full access
CREATE POLICY "Service role full access lead_profiles"
  ON public.lead_profiles
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 7) Audit trigger function for lead_profiles
CREATE OR REPLACE FUNCTION public.audit_lead_profile_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  action_type_val text;
  metadata_val jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    action_type_val := 'lead_profile_created';
    metadata_val := jsonb_build_object(
      'tenant_id', NEW.tenant_id,
      'lead_id', NEW.lead_id,
      'fingerprint', NEW.fingerprint,
      'segment', NEW.segment,
      'is_primary', NEW.is_primary
    );
  ELSIF TG_OP = 'UPDATE' THEN
    -- Check if this is a merge operation (merged_from changed)
    IF array_length(NEW.merged_from, 1) > COALESCE(array_length(OLD.merged_from, 1), 0) THEN
      action_type_val := 'lead_profile_merged';
      metadata_val := jsonb_build_object(
        'tenant_id', NEW.tenant_id,
        'lead_id', NEW.lead_id,
        'fingerprint', NEW.fingerprint,
        'merged_from', NEW.merged_from,
        'previous_merged_from', OLD.merged_from
      );
    ELSE
      action_type_val := 'lead_profile_updated';
      metadata_val := jsonb_build_object(
        'tenant_id', NEW.tenant_id,
        'lead_id', NEW.lead_id,
        'fingerprint', NEW.fingerprint,
        'changed_fields', (
          SELECT jsonb_object_agg(key, value)
          FROM jsonb_each(to_jsonb(NEW)) new_vals
          WHERE new_vals.value IS DISTINCT FROM (to_jsonb(OLD) -> new_vals.key)
            AND new_vals.key NOT IN ('updated_at')
        )
      );
    END IF;
  END IF;
  
  -- Insert audit log
  INSERT INTO public.platform_audit_log (
    tenant_id,
    timestamp,
    agent_name,
    action_type,
    entity_type,
    entity_id,
    description,
    request_snapshot,
    success
  ) VALUES (
    COALESCE(NEW.tenant_id, OLD.tenant_id),
    clock_timestamp(),
    'lead-normalizer',
    action_type_val,
    'lead_profile',
    COALESCE(NEW.id, OLD.id)::text,
    action_type_val || ' for fingerprint: ' || COALESCE(NEW.fingerprint, OLD.fingerprint),
    metadata_val,
    true
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Drop and recreate trigger
DROP TRIGGER IF EXISTS trigger_audit_lead_profiles ON public.lead_profiles;
CREATE TRIGGER trigger_audit_lead_profiles
  AFTER INSERT OR UPDATE ON public.lead_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_lead_profile_changes();

-- Grant permissions
GRANT ALL ON public.lead_profiles TO authenticated;
GRANT ALL ON public.lead_profiles TO service_role;