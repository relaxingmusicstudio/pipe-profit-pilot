-- Create human ratings table for vault functionality
CREATE TABLE IF NOT EXISTS public.human_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL, -- 'content', 'sequence', 'lead', 'ai_response', 'action'
  entity_id UUID NOT NULL,
  rating TEXT CHECK (rating IN ('good', 'bad')),
  saved_to_vault BOOLEAN DEFAULT false,
  notes TEXT,
  rated_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for efficient lookups
CREATE INDEX idx_human_ratings_entity ON public.human_ratings(entity_type, entity_id);
CREATE INDEX idx_human_ratings_vault ON public.human_ratings(saved_to_vault) WHERE saved_to_vault = true;

-- Enable RLS
ALTER TABLE public.human_ratings ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to manage ratings
CREATE POLICY "Users can view all ratings" ON public.human_ratings
  FOR SELECT USING (true);

CREATE POLICY "Users can create ratings" ON public.human_ratings
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update own ratings" ON public.human_ratings
  FOR UPDATE USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_human_ratings_updated_at
  BEFORE UPDATE ON public.human_ratings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();