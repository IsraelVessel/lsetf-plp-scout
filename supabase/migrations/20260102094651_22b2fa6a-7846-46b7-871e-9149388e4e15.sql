-- Create notification_history table to track all sent emails
CREATE TABLE public.notification_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  notification_type text NOT NULL, -- 'candidate_match', 'recruiter_alert'
  recipient_email text NOT NULL,
  recipient_name text,
  subject text NOT NULL,
  status text NOT NULL DEFAULT 'sent', -- 'sent', 'failed'
  error_message text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create email_templates table for customizable templates
CREATE TABLE public.email_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_key text NOT NULL UNIQUE, -- 'candidate_high_score', 'recruiter_alert'
  template_name text NOT NULL,
  subject_template text NOT NULL,
  html_template text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on both tables
ALTER TABLE public.notification_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

-- Notification history policies (staff can view, system inserts)
CREATE POLICY "Staff can view notification history" ON public.notification_history
FOR SELECT USING (is_staff(auth.uid()));

CREATE POLICY "System can insert notification history" ON public.notification_history
FOR INSERT WITH CHECK (true);

-- Email templates policies (staff can view, admin can manage)
CREATE POLICY "Staff can view email templates" ON public.email_templates
FOR SELECT USING (is_staff(auth.uid()));

CREATE POLICY "Admins can insert email templates" ON public.email_templates
FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update email templates" ON public.email_templates
FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));

-- Add updated_at trigger for email_templates
CREATE TRIGGER update_email_templates_updated_at
BEFORE UPDATE ON public.email_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default email templates
INSERT INTO public.email_templates (template_key, template_name, subject_template, html_template, description)
VALUES 
(
  'candidate_high_score',
  'High-Score Candidate Notification',
  'Great News! You''re a Strong Match for {{job_role}}',
  '<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
    .score-card { background: white; border-radius: 8px; padding: 20px; margin: 15px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); text-align: center; }
    .score { font-size: 64px; font-weight: bold; color: #10b981; margin: 10px 0; }
    .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎉 Congratulations, {{candidate_name}}!</h1>
      <p>You''re an excellent match for the {{job_role}} position!</p>
    </div>
    <div class="content">
      <div class="score-card">
        <h2 style="color: #333; margin-bottom: 5px;">Your Match Score</h2>
        <div class="score">{{match_score}}%</div>
        <p style="color: #10b981; font-weight: 600;">{{score_message}}</p>
      </div>
      <p style="text-align: center; margin: 25px 0;">
        Based on our AI-powered analysis, your skills and experience align exceptionally well with this role. Our recruitment team will be in touch with you shortly to discuss the next steps.
      </p>
      <div class="footer">
        <p>Thank you for your interest in joining our team!</p>
        <p style="margin-top: 20px; font-size: 12px;">This is an automated notification from Escoger''s AI-powered recruitment system.</p>
      </div>
    </div>
  </div>
</body>
</html>',
  'Email sent to candidates when they achieve a high match score'
),
(
  'recruiter_alert',
  'Recruiter High-Score Alert',
  '🎯 {{count}} High-Scoring Candidate{{plural}} Found!',
  '<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
    .candidate-list { background: white; border-radius: 8px; padding: 20px; margin: 15px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .candidate-item { padding: 12px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; }
    .candidate-item:last-child { border-bottom: none; }
    .score-badge { background: #10b981; color: white; padding: 4px 12px; border-radius: 20px; font-weight: 600; }
    .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎯 New High-Scoring Candidates!</h1>
      <p>We found {{count}} candidate{{plural}} matching ≥{{threshold}}%</p>
    </div>
    <div class="content">
      <p>Hi{{recruiter_greeting}},</p>
      <p>Great news! Our AI matching system has identified the following high-scoring candidates:</p>
      <div class="candidate-list">
        {{candidates_list}}
      </div>
      <p style="text-align: center; margin: 25px 0;">
        Log in to Escoger to review these candidates and take the next steps in the hiring process.
      </p>
      <div class="footer">
        <p style="margin-top: 20px; font-size: 12px;">This is an automated notification from Escoger''s AI-powered recruitment system.</p>
      </div>
    </div>
  </div>
</body>
</html>',
  'Email sent to recruiters when high-scoring candidates are found'
);