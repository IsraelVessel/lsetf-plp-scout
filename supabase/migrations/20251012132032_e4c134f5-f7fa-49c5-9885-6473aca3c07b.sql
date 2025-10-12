-- Create candidates table
CREATE TABLE public.candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create applications table
CREATE TABLE public.applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID REFERENCES public.candidates(id) ON DELETE CASCADE NOT NULL,
  resume_url TEXT,
  cover_letter TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'analyzing', 'analyzed', 'shortlisted', 'rejected')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create AI analysis table
CREATE TABLE public.ai_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID REFERENCES public.applications(id) ON DELETE CASCADE NOT NULL UNIQUE,
  skills_score INTEGER CHECK (skills_score >= 0 AND skills_score <= 100),
  experience_score INTEGER CHECK (experience_score >= 0 AND experience_score <= 100),
  education_score INTEGER CHECK (education_score >= 0 AND education_score <= 100),
  overall_score INTEGER CHECK (overall_score >= 0 AND overall_score <= 100),
  recommendations TEXT,
  analysis_summary JSONB,
  analyzed_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create skills table
CREATE TABLE public.skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID REFERENCES public.applications(id) ON DELETE CASCADE NOT NULL,
  skill_name TEXT NOT NULL,
  proficiency_level TEXT CHECK (proficiency_level IN ('beginner', 'intermediate', 'advanced', 'expert')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create storage bucket for resumes
INSERT INTO storage.buckets (id, name, public) VALUES ('resumes', 'resumes', false);

-- Enable RLS on all tables
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (for demo purposes - adjust for production)
CREATE POLICY "Enable read access for all users" ON public.candidates FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON public.candidates FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON public.candidates FOR UPDATE USING (true);

CREATE POLICY "Enable read access for all users" ON public.applications FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON public.applications FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON public.applications FOR UPDATE USING (true);

CREATE POLICY "Enable read access for all users" ON public.ai_analysis FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON public.ai_analysis FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON public.ai_analysis FOR UPDATE USING (true);

CREATE POLICY "Enable read access for all users" ON public.skills FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON public.skills FOR INSERT WITH CHECK (true);

-- Create storage policies for resumes
CREATE POLICY "Enable upload access for all users" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'resumes');
CREATE POLICY "Enable read access for all users" ON storage.objects FOR SELECT USING (bucket_id = 'resumes');

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_candidates_updated_at BEFORE UPDATE ON public.candidates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_applications_updated_at BEFORE UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();