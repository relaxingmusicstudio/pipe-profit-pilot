-- Create work_queue table for all agent work items
CREATE TABLE public.work_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_type TEXT NOT NULL, -- 'youtube', 'content', 'funnels', 'sequences', 'ads', 'inbox', 'social', 'analytics'
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL DEFAULT 'task', -- 'task', 'alert', 'opportunity', 'review'
  priority TEXT NOT NULL DEFAULT 'medium', -- 'low', 'medium', 'high', 'urgent'
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'denied', 'in_progress', 'completed'
  metadata JSONB DEFAULT '{}'::jsonb,
  source TEXT, -- 'automation', 'manual', 'ai_generated'
  deny_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Create automation_logs table to track script runs
CREATE TABLE public.automation_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  function_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running', -- 'running', 'success', 'failed'
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  items_processed INTEGER DEFAULT 0,
  items_created INTEGER DEFAULT 0,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Enable RLS
ALTER TABLE public.work_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for work_queue
CREATE POLICY "Admins can manage work queue" ON public.work_queue
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can view work queue" ON public.work_queue
  FOR SELECT USING (true);

CREATE POLICY "Anyone can insert work items" ON public.work_queue
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update work items" ON public.work_queue
  FOR UPDATE USING (true);

-- RLS policies for automation_logs
CREATE POLICY "Admins can manage automation logs" ON public.automation_logs
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can view automation logs" ON public.automation_logs
  FOR SELECT USING (true);

CREATE POLICY "Anyone can insert automation logs" ON public.automation_logs
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update automation logs" ON public.automation_logs
  FOR UPDATE USING (true);

-- Add trigger for updated_at on work_queue
CREATE TRIGGER update_work_queue_updated_at
  BEFORE UPDATE ON public.work_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for work_queue
ALTER PUBLICATION supabase_realtime ADD TABLE public.work_queue;