import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Upload, Loader2, CheckCircle, XCircle, FileText, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";

interface UploadStatus {
  file: File;
  status: 'pending' | 'uploading' | 'analyzing' | 'success' | 'error' | 'rate-limited';
  error?: string;
  candidateName?: string;
}

// Delay helper
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Retry with exponential backoff
const retryWithBackoff = async <T,>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 2000
): Promise<T> => {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Check if it's a rate limit error
      if (errorMessage.includes('429') || errorMessage.includes('rate')) {
        const waitTime = baseDelay * Math.pow(2, attempt);
        console.log(`Rate limited, waiting ${waitTime}ms before retry ${attempt + 1}/${maxRetries}`);
        await delay(waitTime);
      } else {
        throw error; // Non-rate-limit errors should fail immediately
      }
    }
  }
  
  throw lastError;
};

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
    
    // For PDF/DOCX, send to edge function with retry
    const arrayBuffer = await file.arrayBuffer();
    const base64 = btoa(
      new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
    );
    
    const result = await retryWithBackoff(async () => {
      const { data, error } = await supabase.functions.invoke('extract-document-text', {
        body: {
          fileContent: base64,
          fileName: file.name,
          mimeType: file.type
        }
      });
      
      if (error) {
        throw new Error(error.message || 'Text extraction failed');
      }
      
      return data;
    });
    
    if (!result?.text) {
      console.warn('Could not extract text from file:', file.name);
      return `Resume file: ${file.name}\n\nNote: This is a binary document (PDF/DOCX). The file has been uploaded for reference.`;
    }
    
    return result.text;
  };

  const analyzeResume = async (applicationId: string, text: string) => {
    return retryWithBackoff(async () => {
      const { data, error } = await supabase.functions.invoke('analyze-resume', {
        body: {
          applicationId,
          resumeText: text,
          coverLetter: ''
        }
      });
      
      if (error) {
        throw new Error(error.message || 'Analysis failed');
      }
      
      // Check for rate limit error in response
      if (data?.error?.includes('429')) {
        throw new Error('Rate limit: 429');
      }
      
      return data;
    }, 3, 1500); // 3 retries, 1.5 second base delay for faster processing
  };

  const processFile = async (file: File, index: number) => {
    try {
      updateStatus(index, { status: 'uploading' });

      // Extract text from file
      let text: string;
      try {
        text = await extractTextFromFile(file);
      } catch (extractError) {
        const errorMsg = extractError instanceof Error ? extractError.message : 'Unknown error';
        if (errorMsg.includes('429') || errorMsg.includes('rate')) {
          updateStatus(index, { status: 'rate-limited', error: 'Rate limited - will retry' });
          throw extractError;
        }
        console.warn('Text extraction failed, using fallback:', extractError);
        text = `Resume file: ${file.name}\n\nNote: Could not extract text content. File uploaded for reference.`;
      }
      
      // Extract basic info from filename
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

      // Call AI analysis with retry
      await analyzeResume(application.id, text);

      updateStatus(index, { status: 'success' });
      
    } catch (error) {
      console.error('Error processing file:', error);
      const errorMsg = error instanceof Error ? error.message : 'Upload failed';
      const isRateLimited = errorMsg.includes('429') || errorMsg.includes('rate');
      
      updateStatus(index, { 
        status: isRateLimited ? 'rate-limited' : 'error',
        error: isRateLimited ? 'Rate limited - try again later' : errorMsg
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

    // Process files ONE AT A TIME with delays to avoid rate limits
    for (let i = 0; i < files.length; i++) {
      await processFile(files[i], i);
      setProgress(Math.round(((i + 1) / files.length) * 100));
      
      // Add shorter delay between files (1.5 seconds) - flash-lite is faster
      if (i < files.length - 1) {
        await delay(1500);
      }
    }

    setIsProcessing(false);
    
    // Get final status counts
    const finalStatuses = uploadStatuses;
    const successCount = finalStatuses.filter(s => s.status === 'success').length;
    const errorCount = finalStatuses.filter(s => s.status === 'error').length;
    const rateLimitedCount = finalStatuses.filter(s => s.status === 'rate-limited').length;

    if (rateLimitedCount > 0) {
      toast({
        title: "Some files were rate limited",
        description: `${successCount} successful, ${rateLimitedCount} rate limited, ${errorCount} failed. Try again in a minute.`,
        variant: "destructive",
        duration: 8000
      });
    } else {
      toast({
        title: "Batch upload complete",
        description: `${successCount} successful, ${errorCount} failed`,
        duration: 5000
      });
    }

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
      case 'rate-limited':
        return <AlertCircle className="w-5 h-5 text-yellow-500" />;
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
      case 'rate-limited':
        return 'Rate limited - retry later';
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
                Upload multiple resumes at once for AI-powered analysis. Files are processed sequentially to ensure quality.
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
                  Select multiple PDF, Word, or text files. Fast processing with comprehensive AI analysis.
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
                        <span>Processing (1 file at a time)...</span>
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
