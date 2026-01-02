-- Create app_settings table for configurable settings
CREATE TABLE public.app_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  setting_key text NOT NULL UNIQUE,
  setting_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Only staff can view settings
CREATE POLICY "Staff can view settings" ON public.app_settings
FOR SELECT USING (is_staff(auth.uid()));

-- Only admins can update settings  
CREATE POLICY "Admins can update settings" ON public.app_settings
FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can insert settings
CREATE POLICY "Admins can insert settings" ON public.app_settings
FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for updated_at
CREATE TRIGGER update_app_settings_updated_at
BEFORE UPDATE ON public.app_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default notification threshold setting
INSERT INTO public.app_settings (setting_key, setting_value, description)
VALUES ('notification_threshold', '{"candidate_threshold": 80, "recruiter_notification_enabled": true}'::jsonb, 'Email notification settings for high-scoring candidate matches');