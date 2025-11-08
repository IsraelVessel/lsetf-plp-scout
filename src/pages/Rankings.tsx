import { useState, useEffect } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Trophy, Medal, Award, TrendingUp, Mail, Phone, Loader2, Briefcase, PlayCircle, CheckCircle2, Trash2, GitCompare, Search, FileText, Download, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { CandidateComparison } from "@/components/CandidateComparison";
import { InterviewQuestions } from "@/components/InterviewQuestions";
import { CommentsSection } from "@/components/CommentsSection";

const Rankings = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedRole, setSelectedRole] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedQuestions, setExpandedQuestions] = useState<string | null>(null);
  const [expandedComments, setExpandedComments] = useState<string | null>(null);
  const [viewingResume, setViewingResume] = useState<{ url: string; name: string } | null>(null);

  // Check if user is admin
  const { data: isAdmin } = useQuery({
    queryKey: ['isAdmin'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;
      
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .single();
      
      return !error && !!data;
    }
  });
  
  const { data: applications, isLoading } = useQuery({
    queryKey: ['rankedApplications', selectedRole],
    queryFn: async () => {
      let query = supabase
        .from('applications')
        .select(`
          *,
          candidates(*),
          ai_analysis(*),
          skills(*)
        `)
        .in('status', ['analyzed', 'analyzing', 'pending'])
        .order('created_at', { ascending: false });
      
      if (selectedRole !== "all") {
        query = query.eq('job_role', selectedRole);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;

      // Sort: analyzed first (by score), then analyzing, then pending
      return data.sort((a, b) => {
        const statusOrder = { analyzed: 0, analyzing: 1, pending: 2 };
        const statusA = statusOrder[a.status as keyof typeof statusOrder] ?? 3;
        const statusB = statusOrder[b.status as keyof typeof statusOrder] ?? 3;
        
        if (statusA !== statusB) return statusA - statusB;
        
        const scoreA = a.ai_analysis?.[0]?.overall_score || 0;
        const scoreB = b.ai_analysis?.[0]?.overall_score || 0;
        return scoreB - scoreA;
      });
    }
  });

  // Setup realtime subscriptions
  useEffect(() => {
    const channel = supabase
      .channel('applications-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'applications'
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['rankedApplications'] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ai_analysis'
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['rankedApplications'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Get unique job roles for filter
  const jobRoles = [...new Set(applications?.map(app => app.job_role).filter(Boolean))] as string[];

  // Filter applications by search term
  const filteredApplications = applications?.filter(app => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      app.candidates?.name.toLowerCase().includes(searchLower) ||
      app.candidates?.email.toLowerCase().includes(searchLower) ||
      app.job_role?.toLowerCase().includes(searchLower) ||
      app.skills?.some((s: any) => s.skill_name.toLowerCase().includes(searchLower))
    );
  });

  const bulkAnalyze = async () => {
    if (selectedIds.size === 0) {
      toast({
        title: "No candidates selected",
        description: "Please select candidates to analyze",
        variant: "destructive",
      });
      return;
    }

    setIsAnalyzing(true);
    setProgress({ current: 0, total: selectedIds.size });
    
    const selectedApps = applications?.filter(app => selectedIds.has(app.id)) || [];
    let completed = 0;
    let errors = 0;

    // Process in batches of 5 to avoid overwhelming the system
    const batchSize = 5;
    for (let i = 0; i < selectedApps.length; i += batchSize) {
      const batch = selectedApps.slice(i, i + batchSize);
      
      await Promise.all(
        batch.map(async (app) => {
          try {
            // Get resume text from storage or use empty string
            let resumeText = "";
            if (app.resume_url) {
              try {
                const response = await fetch(app.resume_url);
                resumeText = await response.text();
              } catch (e) {
                console.error("Failed to fetch resume:", e);
              }
            }

            await supabase.functions.invoke('analyze-resume', {
              body: {
                applicationId: app.id,
                resumeText: resumeText || "Resume content not available",
                coverLetter: app.cover_letter || ""
              }
            });
            
            completed++;
          } catch (error) {
            console.error(`Failed to analyze ${app.id}:`, error);
            errors++;
          } finally {
            setProgress(prev => ({ ...prev, current: prev.current + 1 }));
          }
        })
      );
    }

    setIsAnalyzing(false);
    setSelectedIds(new Set());
    queryClient.invalidateQueries({ queryKey: ['rankedApplications'] });

    toast({
      title: "Batch Analysis Complete",
      description: `Successfully analyzed ${completed} candidates${errors > 0 ? `, ${errors} failed` : ''}`,
    });
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const selectAll = () => {
    if (selectedIds.size === filteredApplications?.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredApplications?.map(app => app.id) || []));
    }
  };

  const toggleCompare = (id: string) => {
    setCompareIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(i => i !== id);
      }
      if (prev.length >= 3) {
        toast({
          title: "Maximum Reached",
          description: "You can compare up to 3 candidates at once",
          variant: "destructive",
        });
        return prev;
      }
      return [...prev, id];
    });
  };

  const compareData = applications?.filter(app => compareIds.includes(app.id)) as any;

  const retryAnalysis = async (applicationId: string) => {
    try {
      await supabase
        .from('applications')
        .update({ status: 'pending' })
        .eq('id', applicationId);
      
      queryClient.invalidateQueries({ queryKey: ['rankedApplications'] });
      
      toast({
        title: "Retrying Analysis",
        description: "Application reset to pending. Please re-upload to trigger analysis.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to retry analysis",
        variant: "destructive",
      });
    }
  };

  const deleteMutation = useMutation({
    mutationFn: async (applicationId: string) => {
      const { error } = await supabase
        .from('applications')
        .delete()
        .eq('id', applicationId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rankedApplications'] });
      toast({
        title: "Success",
        description: "Candidate deleted successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete candidate",
        variant: "destructive",
      });
    }
  });

  const getRankIcon = (index: number) => {
    if (index === 0) return <Trophy className="w-6 h-6 text-yellow-500" />;
    if (index === 1) return <Medal className="w-6 h-6 text-gray-400" />;
    if (index === 2) return <Award className="w-6 h-6 text-orange-600" />;
    return null;
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600 dark:text-green-400";
    if (score >= 60) return "text-blue-600 dark:text-blue-400";
    if (score >= 40) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container py-20 flex items-center justify-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <div className="container py-12">
        <div className="mb-8">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-4xl font-bold mb-2 flex items-center gap-3">
                <TrendingUp className="w-10 h-10 text-primary" />
                Candidate Rankings
              </h1>
              <p className="text-muted-foreground">
                AI-analyzed candidates ranked by overall score with real-time updates
              </p>
            </div>
            <Button
              variant={compareMode ? "default" : "outline"}
              onClick={() => setCompareMode(!compareMode)}
              className="gap-2"
            >
              <GitCompare className="h-4 w-4" />
              {compareMode ? "Exit Compare" : "Compare Candidates"}
            </Button>
          </div>

          <div className="flex gap-4 mb-6 items-center flex-wrap">
            {jobRoles.length > 0 && (
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Filter by role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  {jobRoles.map((role) => (
                    <SelectItem key={role} value={role}>
                      {role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search candidates, skills..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {compareMode && compareIds.length > 0 && compareData && (
            <CandidateComparison
              candidates={compareData}
              onClose={() => {
                setCompareMode(false);
                setCompareIds([]);
              }}
              onRemove={(id) => setCompareIds(prev => prev.filter(i => i !== id))}
            />
          )}

          {filteredApplications && filteredApplications.length > 0 && (
            <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
              <Checkbox
                checked={selectedIds.size === filteredApplications.length && filteredApplications.length > 0}
                onCheckedChange={selectAll}
                id="select-all"
              />
              <Label htmlFor="select-all" className="cursor-pointer">
                Select All ({filteredApplications.length})
              </Label>
              
              {selectedIds.size > 0 && (
                <div className="flex-1 flex items-center justify-end gap-3">
                  <span className="text-sm text-muted-foreground">
                    {selectedIds.size} selected
                  </span>
                  <Button
                    onClick={bulkAnalyze}
                    disabled={isAnalyzing}
                    size="sm"
                    className="gap-2"
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Analyzing {progress.current}/{progress.total}
                      </>
                    ) : (
                      <>
                        <PlayCircle className="w-4 h-4" />
                        Analyze Selected
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {!filteredApplications || filteredApplications.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                {searchTerm ? "No candidates match your search" : "No candidates yet. Upload candidates to get started."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredApplications.map((app, index) => {
              const analysis = app.ai_analysis?.[0];
              const candidate = app.candidates;
              const isAnalyzingStatus = app.status === 'analyzing';
              const isPending = app.status === 'pending';
              
              if (!candidate) return null;

              return (
                <Card key={app.id} className="transition-all duration-300 hover:shadow-[var(--shadow-elegant)]">
                  <CardHeader>
                    <div className="flex items-start gap-4">
                      <div className="pt-1">
                        {compareMode ? (
                          <Checkbox
                            checked={compareIds.includes(app.id)}
                            onCheckedChange={() => toggleCompare(app.id)}
                          />
                        ) : (
                          <Checkbox
                            checked={selectedIds.has(app.id)}
                            onCheckedChange={() => toggleSelect(app.id)}
                          />
                        )}
                      </div>
                      <div className="flex items-start justify-between flex-1">
                        <div className="flex items-center gap-4 flex-1">
                        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-muted">
                          {!isAnalyzingStatus && !isPending && getRankIcon(index) || (
                            <span className="text-lg font-bold">#{index + 1}</span>
                          )}
                        </div>
                        <div className="flex-1">
                          <CardTitle className="text-2xl mb-1">{candidate.name}</CardTitle>
                          {app.job_role && (
                            <div className="mb-2">
                              <Badge variant="outline" className="gap-1">
                                <Briefcase className="w-3 h-3" />
                                {app.job_role}
                              </Badge>
                            </div>
                          )}
                          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Mail className="w-4 h-4" />
                              {candidate.email}
                            </span>
                            {candidate.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="w-4 h-4" />
                                {candidate.phone}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right flex flex-col items-end gap-2">
                        {isAnalyzingStatus || isPending ? (
                          <>
                            <Badge variant="secondary" className="gap-2">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              {isAnalyzingStatus ? 'Analyzing...' : 'Pending'}
                            </Badge>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => retryAnalysis(app.id)}
                            >
                              Reset Status
                            </Button>
                          </>
                        ) : (
                          <>
                            <Badge variant="default" className="gap-2 mb-2">
                              <CheckCircle2 className="w-3 h-3" />
                              AI Analyzed
                            </Badge>
                            <div className={`text-4xl font-bold ${getScoreColor(analysis?.overall_score || 0)}`}>
                              {analysis?.overall_score || 0}
                            </div>
                            <div className="text-sm text-muted-foreground">Overall Score</div>
                          </>
                        )}
                        {isAdmin && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button 
                                size="sm" 
                                variant="destructive"
                                className="gap-2 mt-2"
                              >
                                <Trash2 className="w-3 h-3" />
                                Delete
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Candidate?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently delete {candidate.name} and all their application data. This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteMutation.mutate(app.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {isAnalyzingStatus || isPending ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                        <p>Analysis in progress... Updates in real-time.</p>
                      </div>
                    ) : analysis ? (
                      <>
                        {/* Resume/CV Access */}
                        {app.resume_url && (
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-2"
                              onClick={() => setViewingResume({ url: app.resume_url!, name: candidate.name })}
                            >
                              <FileText className="w-4 h-4" />
                              View Resume/CV
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-2"
                              onClick={() => window.open(app.resume_url, '_blank')}
                            >
                              <Download className="w-4 h-4" />
                              Download
                            </Button>
                          </div>
                        )}

                        {/* Score Breakdown */}
                        <div className="grid md:grid-cols-3 gap-4">
                          <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span>Skills</span>
                              <span className="font-semibold">{analysis.skills_score || 0}/100</span>
                            </div>
                            <Progress value={analysis.skills_score || 0} className="h-2" />
                          </div>
                          <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span>Experience</span>
                              <span className="font-semibold">{analysis.experience_score || 0}/100</span>
                            </div>
                            <Progress value={analysis.experience_score || 0} className="h-2" />
                          </div>
                          <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span>Education</span>
                              <span className="font-semibold">{analysis.education_score || 0}/100</span>
                            </div>
                            <Progress value={analysis.education_score || 0} className="h-2" />
                          </div>
                        </div>

                        {/* Skills */}
                        {app.skills && app.skills.length > 0 && (
                          <div>
                            <h4 className="text-sm font-semibold mb-2">Skills</h4>
                            <div className="flex flex-wrap gap-2">
                              {app.skills.map((skill: any, idx: number) => (
                                <Badge key={idx} variant="secondary">
                                  {skill.skill_name} • {skill.proficiency_level}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Recommendations */}
                        {analysis.recommendations && (
                          <div>
                            <h4 className="text-sm font-semibold mb-2">Recommendations</h4>
                            <p className="text-sm text-muted-foreground">{analysis.recommendations}</p>
                          </div>
                        )}

                        {/* Interview Questions & Comments */}
                        <div className="grid md:grid-cols-2 gap-4 pt-4 border-t">
                          <div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full mb-3"
                              onClick={() => setExpandedQuestions(
                                expandedQuestions === app.id ? null : app.id
                              )}
                            >
                              {expandedQuestions === app.id ? "Hide" : "Show"} AI Interview Questions
                            </Button>
                            {expandedQuestions === app.id && (
                              <InterviewQuestions applicationId={app.id} />
                            )}
                          </div>

                          <div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full mb-3"
                              onClick={() => setExpandedComments(
                                expandedComments === app.id ? null : app.id
                              )}
                            >
                              {expandedComments === app.id ? "Hide" : "Show"} Team Comments
                            </Button>
                            {expandedComments === app.id && (
                              <CommentsSection applicationId={app.id} />
                            )}
                          </div>
                        </div>
                      </>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Resume Viewer Dialog */}
        {viewingResume && (
          <AlertDialog open={!!viewingResume} onOpenChange={() => setViewingResume(null)}>
            <AlertDialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Resume/CV - {viewingResume.name}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Viewing candidate's resume document
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="flex-1 overflow-auto">
                <iframe
                  src={viewingResume.url}
                  className="w-full h-[60vh] border rounded"
                  title={`Resume - ${viewingResume.name}`}
                />
              </div>
              <AlertDialogFooter>
                <Button
                  variant="outline"
                  onClick={() => window.open(viewingResume.url, '_blank')}
                  className="gap-2"
                >
                  <ExternalLink className="w-4 h-4" />
                  Open in New Tab
                </Button>
                <AlertDialogCancel>Close</AlertDialogCancel>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
};

export default Rankings;