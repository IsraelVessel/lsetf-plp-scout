-- Create comments table for collaborative hiring
CREATE TABLE public.comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on comments
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- Staff can view all comments
CREATE POLICY "Staff can view comments"
ON public.comments
FOR SELECT
USING (is_staff(auth.uid()));

-- Staff can insert comments
CREATE POLICY "Staff can insert comments"
ON public.comments
FOR INSERT
WITH CHECK (is_staff(auth.uid()) AND auth.uid() = user_id);

-- Users can update their own comments
CREATE POLICY "Users can update own comments"
ON public.comments
FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own comments
CREATE POLICY "Users can delete own comments"
ON public.comments
FOR DELETE
USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_comments_updated_at
BEFORE UPDATE ON public.comments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create interview questions table
CREATE TABLE public.interview_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  questions JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on interview_questions
ALTER TABLE public.interview_questions ENABLE ROW LEVEL SECURITY;

-- Staff can view interview questions
CREATE POLICY "Staff can view interview questions"
ON public.interview_questions
FOR SELECT
USING (is_staff(auth.uid()));

-- System can insert interview questions
CREATE POLICY "System can insert interview questions"
ON public.interview_questions
FOR INSERT
WITH CHECK (true);

-- Add indexes for performance
CREATE INDEX idx_comments_application_id ON public.comments(application_id);
CREATE INDEX idx_comments_created_at ON public.comments(created_at DESC);
CREATE INDEX idx_interview_questions_application_id ON public.interview_questions(application_id);

-- Enable realtime for real-time updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.applications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_analysis;
ALTER PUBLICATION supabase_realtime ADD TABLE public.comments;