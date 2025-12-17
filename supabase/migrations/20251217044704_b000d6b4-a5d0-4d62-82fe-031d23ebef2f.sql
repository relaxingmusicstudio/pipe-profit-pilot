-- Drop existing activate_tenant function to recreate with updated logic
DROP FUNCTION IF EXISTS public.activate_tenant(uuid);

-- Recreate activate_tenant to also provision and activate instances
CREATE OR REPLACE FUNCTION public.activate_tenant(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- First provision instances if not already done
  PERFORM provision_tenant_instances(p_tenant_id);
  
  -- Activate the instances
  PERFORM activate_tenant_instances(p_tenant_id);
  
  -- Update tenant status
  UPDATE tenants
  SET 
    status = 'active',
    initialized_at = now()
  WHERE id = p_tenant_id
    AND status = 'draft';
END;
$$;