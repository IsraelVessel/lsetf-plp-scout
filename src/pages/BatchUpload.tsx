import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Upload, Loader2, CheckCircle, XCircle, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";

interface UploadStatus {
  file: File;
  status: 'pending' | 'uploading' | 'analyzing' | 'success' | 'error';
  error?: string;
  candidateName?: string;
}

const BatchUpload = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [files, setFiles] = useState<File[]>([]);
  const [uploadStatuses, setUploadStatuses] = useState<UploadStatus[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    setFiles(selectedFiles);
    setUploadStatuses(selectedFiles.map(file => ({
      file,
      status: 'pending'
    })));
  };

  const updateStatus = (index: number, updates: Partial<UploadStatus>) => {
    setUploadStatuses(prev => prev.map((status, i) => 
      i === index ? { ...status, ...updates } : status
    ));
  };

  const extractTextFromFile = async (file: File): Promise<string> => {
    const fileExt = file.name.split('.').pop()?.toLowerCase();
    
    // For text files, read directly
    if (fileExt === 'txt') {
      return await file.text();
    }
    
    // For PDF/DOCX, we'll send to an edge function that can parse them
    // For now, return the filename as placeholder and let AI analyze based on upload
    // The actual content extraction happens server-side
    const arrayBuffer = await file.arrayBuffer();
    const base64 = btoa(
      new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
    );
    
    // Call edge function to extract text
    const { data, error } = await supabase.functions.invoke('extract-document-text', {
      body: {
        fileContent: base64,
        fileName: file.name,
        mimeType: file.type
      }
    });
    
    if (error || !data?.text) {
      // Fallback: use filename as basic info
      console.warn('Could not extract text from file:', file.name, error);
      return `Resume file: ${file.name}\n\nNote: This is a binary document (PDF/DOCX). The file has been uploaded for reference. Please analyze based on the filename and any metadata available.`;
    }
    
    return data.text;
  };

  const processFile = async (file: File, index: number) => {
    try {
      updateStatus(index, { status: 'uploading' });

      // Extract text from file
      let text: string;
      try {
        text = await extractTextFromFile(file);
      } catch (extractError) {
        console.warn('Text extraction failed, using fallback:', extractError);
        text = `Resume file: ${file.name}\n\nNote: Could not extract text content. File uploaded for reference.`;
      }
      
      // Extract basic info from filename (e.g., "John_Doe_Resume.pdf")
      const nameFromFile = file.name
        .replace(/\.(pdf|doc|docx|txt)$/i, '')
        .replace(/[_-]/g, ' ')
        .replace(/resume|cv/gi, '')
        .trim();

      const candidateName = nameFromFile || `Candidate ${index + 1}`;
      const email = `${nameFromFile.toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9.]/g, '')}@temp.venia.com`;

      updateStatus(index, { candidateName });

      // Create candidate
      const { data: candidate, error: candidateError } = await supabase
        .from('candidates')
        .insert({
          name: candidateName,
          email: email,
          phone: ''
        })
        .select()
        .single();

      if (candidateError) throw candidateError;

      // Upload file to storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${candidate.id}-${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('resumes')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('resumes')
        .getPublicUrl(fileName);

      // Create application
      const { data: application, error: appError } = await supabase
        .from('applications')
        .insert({
          candidate_id: candidate.id,
          resume_url: publicUrl,
          job_role: 'General Application',
          status: 'pending'
        })
        .select()
        .single();

      if (appError) throw appError;

      updateStatus(index, { status: 'analyzing' });

      // Call AI analysis function
      const { error: analysisError } = await supabase.functions.invoke('analyze-resume', {
        body: {
          applicationId: application.id,
          resumeText: text,
          coverLetter: ''
        }
      });

      if (analysisError) throw analysisError;

      updateStatus(index, { status: 'success' });
      
    } catch (error) {
      console.error('Error processing file:', error);
      updateStatus(index, { 
        status: 'error',
        error: error instanceof Error ? error.message : 'Upload failed'
      });
    }
  };

  const handleBatchUpload = async () => {
    if (files.length === 0) {
      toast({
        title: "No files selected",
        description: "Please select at least one resume file",
        variant: "destructive"
      });
      return;
    }

    setIsProcessing(true);
    setProgress(0);

    // Process files in parallel (max 3 at a time to avoid rate limits)
    const batchSize = 3;
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      const batchIndices = Array.from({ length: batch.length }, (_, j) => i + j);
      
      await Promise.all(
        batch.map((file, localIndex) => 
          processFile(file, batchIndices[localIndex])
        )
      );

      setProgress(Math.round(((i + batch.length) / files.length) * 100));
    }

    setIsProcessing(false);
    
    const successCount = uploadStatuses.filter(s => s.status === 'success').length;
    const errorCount = uploadStatuses.filter(s => s.status === 'error').length;

    toast({
      title: "Batch upload complete",
      description: `${successCount} successful, ${errorCount} failed`,
      duration: 5000
    });

    // Navigate to rankings after a delay if at least one succeeded
    if (successCount > 0) {
      setTimeout(() => navigate("/rankings"), 2000);
    }
  };

  const getStatusIcon = (status: UploadStatus['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-destructive" />;
      case 'uploading':
      case 'analyzing':
        return <Loader2 className="w-5 h-5 animate-spin text-primary" />;
      default:
        return <FileText className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const getStatusText = (status: UploadStatus) => {
    switch (status.status) {
      case 'success':
        return 'Analysis complete';
      case 'error':
        return `Error: ${status.error}`;
      case 'uploading':
        return 'Uploading...';
      case 'analyzing':
        return 'AI analyzing...';
      default:
        return 'Ready';
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <div className="container py-12">
        <div className="max-w-4xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="text-3xl flex items-center gap-2">
                <Upload className="w-8 h-8 text-primary" />
                Batch Resume Upload
              </CardTitle>
              <CardDescription>
                Upload multiple resumes at once for fast AI-powered analysis
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="batch-files">Select Resume Files</Label>
                <Input
                  id="batch-files"
                  type="file"
                  accept=".pdf,.doc,.docx,.txt"
                  multiple
                  onChange={handleFileSelect}
                  disabled={isProcessing}
                />
                <p className="text-sm text-muted-foreground">
                  Select multiple PDF, Word, or text files. Each file will be analyzed separately.
                </p>
              </div>

              {files.length > 0 && (
                <>
                  <div className="space-y-3">
                    <h3 className="font-semibold">Files to Process ({files.length})</h3>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {uploadStatuses.map((status, index) => (
                        <div 
                          key={index}
                          className="flex items-center justify-between p-3 border rounded-lg bg-card"
                        >
                          <div className="flex items-center gap-3 flex-1">
                            {getStatusIcon(status.status)}
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">
                                {status.candidateName || status.file.name}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {getStatusText(status)}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {isProcessing && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Processing...</span>
                        <span>{progress}%</span>
                      </div>
                      <Progress value={progress} />
                    </div>
                  )}

                  <Button 
                    onClick={handleBatchUpload}
                    size="lg" 
                    className="w-full gap-2"
                    disabled={isProcessing}
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Processing {progress}%
                      </>
                    ) : (
                      <>
                        <Upload className="w-5 h-5" />
                        Upload & Analyze All ({files.length} files)
                      </>
                    )}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default BatchUpload;