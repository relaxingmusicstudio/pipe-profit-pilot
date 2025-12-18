-- Fix remaining search_path warning on audit function
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
        'fingerprint', NEW.fingerprint
      );
    END IF;
  END IF;
  
  INSERT INTO public.platform_audit_log (
    tenant_id, timestamp, agent_name, action_type, entity_type, entity_id,
    description, request_snapshot, success
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