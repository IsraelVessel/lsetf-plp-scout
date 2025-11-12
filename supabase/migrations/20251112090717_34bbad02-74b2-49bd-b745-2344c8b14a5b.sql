-- Create reminders table for automated follow-ups
CREATE TABLE public.reminders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  reminder_type TEXT NOT NULL,
  reminder_status TEXT NOT NULL DEFAULT 'pending',
  scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

-- Policies for reminders
CREATE POLICY "Staff can view reminders"
ON public.reminders
FOR SELECT
TO authenticated
USING (is_staff(auth.uid()));

CREATE POLICY "System can insert reminders"
ON public.reminders
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "System can update reminders"
ON public.reminders
FOR UPDATE
TO authenticated
USING (true);

-- Create index for efficient queries
CREATE INDEX idx_reminders_scheduled_for ON public.reminders(scheduled_for);
CREATE INDEX idx_reminders_status ON public.reminders(reminder_status);
CREATE INDEX idx_reminders_application_id ON public.reminders(application_id);

-- Add trigger for updated_at
CREATE TRIGGER update_reminders_updated_at
BEFORE UPDATE ON public.reminders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();