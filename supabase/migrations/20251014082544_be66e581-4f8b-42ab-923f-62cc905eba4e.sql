-- Add job_role column to applications table
ALTER TABLE public.applications
ADD COLUMN job_role TEXT;

-- Create an index for faster filtering by job role
CREATE INDEX idx_applications_job_role ON public.applications(job_role);