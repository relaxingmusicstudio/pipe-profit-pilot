-- Add TCPA consent tracking and expanded fields to leads table
ALTER TABLE leads ADD COLUMN IF NOT EXISTS consent_to_call BOOLEAN DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS consent_to_sms BOOLEAN DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS consent_to_email BOOLEAN DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS consent_source TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS consent_date TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS tcpa_consent_text TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS form_submitted_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS form_name TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ip_address TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS do_not_call BOOLEAN DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS dnc_date TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS dnc_reason TEXT;

-- Business Intelligence Fields
ALTER TABLE leads ADD COLUMN IF NOT EXISTS company_website TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS service_type TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS annual_revenue TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS number_of_employees INTEGER;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS years_in_business INTEGER;

-- Source Tracking
ALTER TABLE leads ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS source_detail TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS landing_page TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_source TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_medium TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_campaign TEXT;

-- Call Intelligence
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_call_date TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_call_outcome TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_call_notes TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS total_call_attempts INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS best_time_to_call TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS timezone TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS preferred_contact_method TEXT;

-- Decision Making
ALTER TABLE leads ADD COLUMN IF NOT EXISTS decision_maker BOOLEAN;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS decision_maker_name TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS decision_timeline TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS budget_range TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS competitor_mentioned TEXT;

-- Rep Fields
ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_to UUID;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_action TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_action_date TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS pain_points TEXT[];
ALTER TABLE leads ADD COLUMN IF NOT EXISTS follow_up_notes TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}'::jsonb;

-- Add consent fields to dialer_queue
ALTER TABLE dialer_queue ADD COLUMN IF NOT EXISTS consent_verified BOOLEAN DEFAULT false;
ALTER TABLE dialer_queue ADD COLUMN IF NOT EXISTS consent_source TEXT;
ALTER TABLE dialer_queue ADD COLUMN IF NOT EXISTS requires_human BOOLEAN DEFAULT true;

-- Create consent audit log table
CREATE TABLE IF NOT EXISTS consent_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  channel TEXT,
  source TEXT,
  consent_text TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create lead activities table for timeline
CREATE TABLE IF NOT EXISTS lead_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  description TEXT,
  outcome TEXT,
  performed_by UUID,
  duration_seconds INTEGER,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on new tables
ALTER TABLE consent_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;

-- RLS policies for consent_audit_log
CREATE POLICY "Admins can manage consent_audit_log" ON consent_audit_log FOR ALL USING (true);
CREATE POLICY "Anyone can insert consent_audit_log" ON consent_audit_log FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can view consent_audit_log" ON consent_audit_log FOR SELECT USING (true);

-- RLS policies for lead_activities
CREATE POLICY "Admins can manage lead_activities" ON lead_activities FOR ALL USING (true);
CREATE POLICY "Anyone can insert lead_activities" ON lead_activities FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can view lead_activities" ON lead_activities FOR SELECT USING (true);
CREATE POLICY "Anyone can update lead_activities" ON lead_activities FOR UPDATE USING (true);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_lead_activities_lead_id ON lead_activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_activities_created_at ON lead_activities(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_consent_audit_log_lead_id ON consent_audit_log(lead_id);
CREATE INDEX IF NOT EXISTS idx_leads_consent ON leads(consent_to_call, do_not_call);
CREATE INDEX IF NOT EXISTS idx_leads_assigned ON leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_next_action ON leads(next_action_date);