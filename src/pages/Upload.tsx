import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Upload, Loader2, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const UploadPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    resumeText: "",
    coverLetter: ""
  });
  
  const [file, setFile] = useState<File | null>(null);

  const uploadMutation = useMutation({
    mutationFn: async () => {
      // Create candidate
      const { data: candidate, error: candidateError } = await supabase
        .from('candidates')
        .insert({
          name: formData.name,
          email: formData.email,
          phone: formData.phone
        })
        .select()
        .single();

      if (candidateError) throw candidateError;

      // Upload resume file if provided
      let resumeUrl = null;
      if (file) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${candidate.id}-${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('resumes')
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('resumes')
          .getPublicUrl(fileName);
        
        resumeUrl = publicUrl;
      }

      // Create application
      const { data: application, error: appError } = await supabase
        .from('applications')
        .insert({
          candidate_id: candidate.id,
          resume_url: resumeUrl,
          cover_letter: formData.coverLetter,
          status: 'pending'
        })
        .select()
        .single();

      if (appError) throw appError;

      // Call AI analysis function
      const { error: analysisError } = await supabase.functions.invoke('analyze-resume', {
        body: {
          applicationId: application.id,
          resumeText: formData.resumeText,
          coverLetter: formData.coverLetter
        }
      });

      if (analysisError) throw analysisError;

      return application;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      
      toast({
        title: "Success!",
        description: "Candidate uploaded and AI analysis started.",
        duration: 3000,
      });

      // Reset form
      setFormData({
        name: "",
        email: "",
        phone: "",
        resumeText: "",
        coverLetter: ""
      });
      setFile(null);

      // Navigate to rankings after a short delay
      setTimeout(() => navigate("/rankings"), 1500);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to upload candidate",
        variant: "destructive",
      });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    uploadMutation.mutate();
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <div className="container py-12">
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="text-3xl flex items-center gap-2">
                <Upload className="w-8 h-8 text-primary" />
                Upload Candidate
              </CardTitle>
              <CardDescription>
                Submit candidate information for AI-powered analysis and ranking
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    placeholder="John Doe"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email Address *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                    placeholder="john@example.com"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+234 800 000 0000"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="resume">Resume/CV File</Label>
                  <Input
                    id="resume"
                    type="file"
                    accept=".pdf,.doc,.docx"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Optional: Upload PDF or Word document
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="resumeText">Resume Content *</Label>
                  <Textarea
                    id="resumeText"
                    value={formData.resumeText}
                    onChange={(e) => setFormData({ ...formData, resumeText: e.target.value })}
                    required
                    placeholder="Paste resume text here for AI analysis..."
                    rows={8}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Paste the text content of the resume for AI analysis
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="coverLetter">Cover Letter (Optional)</Label>
                  <Textarea
                    id="coverLetter"
                    value={formData.coverLetter}
                    onChange={(e) => setFormData({ ...formData, coverLetter: e.target.value })}
                    placeholder="Cover letter content..."
                    rows={6}
                  />
                </div>

                <Button 
                  type="submit" 
                  size="lg" 
                  className="w-full gap-2"
                  disabled={uploadMutation.isPending}
                >
                  {uploadMutation.isPending ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Analyzing with AI...
                    </>
                  ) : uploadMutation.isSuccess ? (
                    <>
                      <CheckCircle className="w-5 h-5" />
                      Success!
                    </>
                  ) : (
                    <>
                      <Upload className="w-5 h-5" />
                      Upload & Analyze
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default UploadPage;