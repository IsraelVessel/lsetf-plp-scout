-- Make resumes bucket public for AI analysis
UPDATE storage.buckets 
SET public = true 
WHERE id = 'resumes';

-- Allow public access to view resumes (needed for AI analysis)
CREATE POLICY "Public can view resumes"
ON storage.objects FOR SELECT
USING (bucket_id = 'resumes');

-- Staff can upload resumes
CREATE POLICY "Staff can upload resumes"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'resumes' 
  AND (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'recruiter')
  ))
);

-- Staff can update resumes
CREATE POLICY "Staff can update resumes"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'resumes' 
  AND (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'recruiter')
  ))
);

-- Staff can delete resumes
CREATE POLICY "Staff can delete resumes"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'resumes' 
  AND (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'recruiter')
  ))
);