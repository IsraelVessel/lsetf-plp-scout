-- Create status history tracking table (status stays as text in applications)
CREATE TABLE public.application_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_by UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on status history
ALTER TABLE public.application_status_history ENABLE ROW LEVEL SECURITY;

-- Staff can view status history
CREATE POLICY "Staff can view status history"
ON public.application_status_history FOR SELECT
USING (is_staff(auth.uid()));

-- Staff can insert status history
CREATE POLICY "Staff can insert status history"
ON public.application_status_history FOR INSERT
WITH CHECK (is_staff(auth.uid()) AND changed_by = auth.uid());

-- Create index for better query performance
CREATE INDEX idx_status_history_application_id 
ON public.application_status_history(application_id);

CREATE INDEX idx_status_history_created_at 
ON public.application_status_history(created_at DESC);

-- Create function to automatically track status changes
CREATE OR REPLACE FUNCTION public.track_application_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO public.application_status_history (
      application_id,
      old_status,
      new_status,
      changed_by
    ) VALUES (
      NEW.id,
      OLD.status,
      NEW.status,
      auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger to track status changes
CREATE TRIGGER track_status_changes
AFTER UPDATE ON public.applications
FOR EACH ROW
EXECUTE FUNCTION public.track_application_status_change();