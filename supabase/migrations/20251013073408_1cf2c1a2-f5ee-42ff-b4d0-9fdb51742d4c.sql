-- Create role enum for admin access
CREATE TYPE public.app_role AS ENUM ('admin', 'recruiter');

-- Create user_roles table to manage access
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles (prevents infinite recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Security definer function to check if user is staff (admin or recruiter)
CREATE OR REPLACE FUNCTION public.is_staff(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin', 'recruiter')
  )
$$;

-- Drop existing overly permissive policies on candidates
DROP POLICY IF EXISTS "Enable insert access for all users" ON public.candidates;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.candidates;
DROP POLICY IF EXISTS "Enable update access for all users" ON public.candidates;

-- Secure policies for candidates table
CREATE POLICY "Allow public to submit candidates"
  ON public.candidates
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Only staff can view candidates"
  ON public.candidates
  FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Only staff can update candidates"
  ON public.candidates
  FOR UPDATE
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Only admins can delete candidates"
  ON public.candidates
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Drop existing policies on applications
DROP POLICY IF EXISTS "Enable insert access for all users" ON public.applications;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.applications;
DROP POLICY IF EXISTS "Enable update access for all users" ON public.applications;

-- Secure policies for applications table
CREATE POLICY "Allow public to submit applications"
  ON public.applications
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Only staff can view applications"
  ON public.applications
  FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Only staff can update applications"
  ON public.applications
  FOR UPDATE
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Only admins can delete applications"
  ON public.applications
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Drop existing policies on ai_analysis
DROP POLICY IF EXISTS "Enable insert access for all users" ON public.ai_analysis;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.ai_analysis;
DROP POLICY IF EXISTS "Enable update access for all users" ON public.ai_analysis;

-- Secure policies for ai_analysis table
CREATE POLICY "Only staff can view ai_analysis"
  ON public.ai_analysis
  FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "System can insert ai_analysis"
  ON public.ai_analysis
  FOR INSERT
  TO authenticated, service_role
  WITH CHECK (true);

CREATE POLICY "Only staff can update ai_analysis"
  ON public.ai_analysis
  FOR UPDATE
  TO authenticated
  USING (public.is_staff(auth.uid()));

-- Drop existing policies on skills
DROP POLICY IF EXISTS "Enable insert access for all users" ON public.skills;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.skills;

-- Secure policies for skills table
CREATE POLICY "Only staff can view skills"
  ON public.skills
  FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "System can insert skills"
  ON public.skills
  FOR INSERT
  TO authenticated, service_role
  WITH CHECK (true);

-- Allow staff to view their own role
CREATE POLICY "Users can view their own roles"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Create profiles table for user information
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Trigger to create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name');
  RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated timestamp trigger for profiles
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Profiles RLS policies
CREATE POLICY "Users can view their own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Users can update their own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid());