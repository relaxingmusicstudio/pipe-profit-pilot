-- Add is_demo column to tables
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false;
ALTER TABLE public.deal_pipeline ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false;
ALTER TABLE public.action_queue ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false;