-- Create table for job requirements
CREATE TABLE public.job_requirements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_role TEXT NOT NULL UNIQUE,
  requirements JSONB NOT NULL DEFAULT '{}',
  min_experience_years INTEGER DEFAULT 0,
  required_skills TEXT[] DEFAULT '{}',
  preferred_skills TEXT[] DEFAULT '{}',
  education_level TEXT,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Create table for candidate-job match scores
CREATE TABLE public.candidate_job_matches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  job_requirement_id UUID NOT NULL REFERENCES public.job_requirements(id) ON DELETE CASCADE,
  match_score INTEGER NOT NULL DEFAULT 0,
  skills_match INTEGER DEFAULT 0,
  experience_match INTEGER DEFAULT 0,
  education_match INTEGER DEFAULT 0,
  match_details JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(application_id, job_requirement_id)
);

-- Enable RLS
ALTER TABLE public.job_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_job_matches ENABLE ROW LEVEL SECURITY;

-- RLS policies for job_requirements
CREATE POLICY "Staff can view job requirements" ON public.job_requirements
  FOR SELECT USING (is_staff(auth.uid()));

CREATE POLICY "Staff can insert job requirements" ON public.job_requirements
  FOR INSERT WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "Staff can update job requirements" ON public.job_requirements
  FOR UPDATE USING (is_staff(auth.uid()));

CREATE POLICY "Admins can delete job requirements" ON public.job_requirements
  FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for candidate_job_matches
CREATE POLICY "Staff can view matches" ON public.candidate_job_matches
  FOR SELECT USING (is_staff(auth.uid()));

CREATE POLICY "System can insert matches" ON public.candidate_job_matches
  FOR INSERT WITH CHECK (true);

CREATE POLICY "System can update matches" ON public.candidate_job_matches
  FOR UPDATE USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_job_requirements_updated_at
  BEFORE UPDATE ON public.job_requirements
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();