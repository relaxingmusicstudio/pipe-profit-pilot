-- Voice/AI usage tracking (per-minute billing)
CREATE TABLE public.usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  usage_type TEXT NOT NULL, -- 'voice_minutes', 'ai_agent_minutes', 'sms', 'email'
  quantity DECIMAL NOT NULL DEFAULT 0, -- minutes or count
  unit_price DECIMAL NOT NULL DEFAULT 0.10, -- price per unit in dollars
  total_cost DECIMAL GENERATED ALWAYS AS (quantity * unit_price) STORED,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  billing_period_start DATE,
  billing_period_end DATE,
  stripe_usage_record_id TEXT,
  source TEXT, -- 'vapi', 'elevenlabs', 'twilio', 'lovable_ai'
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.usage_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage usage_records" ON public.usage_records
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can insert usage_records" ON public.usage_records
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can view usage_records" ON public.usage_records
  FOR SELECT USING (true);

-- Stripe products/prices sync table (AI can manage this)
CREATE TABLE public.stripe_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_product_id TEXT UNIQUE,
  stripe_price_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  pricing_type TEXT DEFAULT 'recurring', -- 'recurring', 'metered', 'one_time'
  unit_amount INTEGER, -- in cents
  currency TEXT DEFAULT 'usd',
  billing_interval TEXT, -- 'month', 'year'
  metered_usage_type TEXT, -- 'sum', 'max', 'last_during_period'
  is_active BOOLEAN DEFAULT true,
  created_by TEXT DEFAULT 'admin', -- 'admin', 'ai_agent', 'system'
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.stripe_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage stripe_products" ON public.stripe_products
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can view stripe_products" ON public.stripe_products
  FOR SELECT USING (true);

CREATE POLICY "Service can manage stripe_products" ON public.stripe_products
  FOR ALL USING (true) WITH CHECK (true);

-- AI billing agent actions log (audit trail)
CREATE TABLE public.billing_agent_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type TEXT NOT NULL, -- 'create_price', 'refund', 'pause_subscription', 'dispute_resolve', 'dunning', 'usage_sync'
  target_type TEXT, -- 'invoice', 'subscription', 'customer', 'product', 'usage'
  target_id TEXT, -- Stripe ID or internal ID
  client_id UUID REFERENCES public.clients(id),
  reason TEXT NOT NULL,
  amount DECIMAL, -- Amount involved (for refunds, charges)
  ai_confidence DECIMAL CHECK (ai_confidence >= 0 AND ai_confidence <= 1), -- 0-1 confidence
  requires_human_review BOOLEAN DEFAULT false,
  human_approved BOOLEAN,
  approved_by TEXT,
  executed_at TIMESTAMPTZ,
  result JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.billing_agent_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage billing_agent_actions" ON public.billing_agent_actions
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can insert billing_agent_actions" ON public.billing_agent_actions
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can view billing_agent_actions" ON public.billing_agent_actions
  FOR SELECT USING (true);

CREATE POLICY "Anyone can update billing_agent_actions" ON public.billing_agent_actions
  FOR UPDATE USING (true);

-- Add Stripe columns to clients table
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'none';
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS subscription_id TEXT;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS included_minutes INTEGER DEFAULT 500;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS overage_rate DECIMAL DEFAULT 0.10;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS current_period_start DATE;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS current_period_end DATE;

-- Create indexes for performance
CREATE INDEX idx_usage_records_client_id ON public.usage_records(client_id);
CREATE INDEX idx_usage_records_recorded_at ON public.usage_records(recorded_at);
CREATE INDEX idx_usage_records_usage_type ON public.usage_records(usage_type);
CREATE INDEX idx_billing_agent_actions_client_id ON public.billing_agent_actions(client_id);
CREATE INDEX idx_billing_agent_actions_created_at ON public.billing_agent_actions(created_at);
CREATE INDEX idx_billing_agent_actions_requires_review ON public.billing_agent_actions(requires_human_review) WHERE requires_human_review = true;

-- Update trigger for stripe_products
CREATE TRIGGER update_stripe_products_updated_at
  BEFORE UPDATE ON public.stripe_products
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();