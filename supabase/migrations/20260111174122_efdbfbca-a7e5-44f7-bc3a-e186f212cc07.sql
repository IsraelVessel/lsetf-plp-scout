-- Create activity_log table to track user actions
CREATE TABLE public.activity_log (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL,
    action_type text NOT NULL,
    description text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

-- Users can view their own activity
CREATE POLICY "Users can view their own activity"
ON public.activity_log
FOR SELECT
USING (user_id = auth.uid());

-- System can insert activity logs
CREATE POLICY "System can insert activity logs"
ON public.activity_log
FOR INSERT
WITH CHECK (true);

-- Create index for faster queries
CREATE INDEX idx_activity_log_user_id ON public.activity_log(user_id);
CREATE INDEX idx_activity_log_created_at ON public.activity_log(created_at DESC);

-- Create function to auto-assign recruiter role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Automatically assign 'recruiter' role to all new users
  INSERT INTO public.user_roles (user_id, role)
  VALUES (new.id, 'recruiter');
  
  -- Log the signup activity
  INSERT INTO public.activity_log (user_id, action_type, description)
  VALUES (new.id, 'signup', 'Account created and staff access granted');
  
  RETURN new;
END;
$$;

-- Create trigger for auto role assignment
CREATE TRIGGER on_auth_user_created_role
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role();