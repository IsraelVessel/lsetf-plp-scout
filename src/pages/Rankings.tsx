import { useState, useEffect } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Trophy, Medal, Award, TrendingUp, Mail, Phone, Loader2, Briefcase, PlayCircle, CheckCircle2, Trash2, GitCompare, Search, FileText, Download, ExternalLink, Filter, ArrowRightLeft, History, Clock, FileDown, Target } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
import { exportCandidateToPDF, exportMultipleCandidatesToPDF } from "@/utils/pdfExport";

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
  const [viewingStatusHistory, setViewingStatusHistory] = useState<string | null>(null);
  
  // Advanced filters
  const [scoreRange, setScoreRange] = useState<[number, number]>([0, 100]);
  const [skillFilter, setSkillFilter] = useState<string>("");
  const [experienceFilter, setExperienceFilter] = useState<string>("all");
  const [educationFilter, setEducationFilter] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [isMatching, setIsMatching] = useState(false);
  const [matchProgress, setMatchProgress] = useState({ current: 0, total: 0 });

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

  // Fetch job matches for all applications
  const { data: jobMatches } = useQuery({
    queryKey: ['jobMatchesForRankings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('candidate_job_matches')
        .select(`
          *,
          job_requirements(job_role)
        `)
        .order('match_score', { ascending: false });
      
      if (error) throw error;
      return data;
    }
  });

  // Fetch job requirements for matching
  const { data: jobRequirements } = useQuery({
    queryKey: ['jobRequirementsForMatching'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('job_requirements')
        .select('id, job_role');
      
      if (error) throw error;
      return data;
    }
  });

  // Get best match for an application
  const getBestMatch = (applicationId: string) => {
    if (!jobMatches) return null;
    const matches = jobMatches.filter(m => m.application_id === applicationId);
    if (matches.length === 0) return null;
    return matches[0]; // Already sorted by match_score desc
  };

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

  // Filter applications by search term and advanced filters
  const filteredApplications = applications?.filter(app => {
    // Search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = 
        app.candidates?.name.toLowerCase().includes(searchLower) ||
        app.candidates?.email.toLowerCase().includes(searchLower) ||
        app.job_role?.toLowerCase().includes(searchLower) ||
        app.skills?.some((s: any) => s.skill_name.toLowerCase().includes(searchLower));
      if (!matchesSearch) return false;
    }

    const analysis = app.ai_analysis?.[0];
    
    // Score range filter
    if (analysis?.overall_score) {
      if (analysis.overall_score < scoreRange[0] || analysis.overall_score > scoreRange[1]) {
        return false;
      }
    }

    // Skill filter
    if (skillFilter) {
      const hasSkill = app.skills?.some((s: any) => 
        s.skill_name.toLowerCase().includes(skillFilter.toLowerCase())
      );
      if (!hasSkill) return false;
    }

    // Experience filter
    if (experienceFilter && experienceFilter !== "all") {
      if (!analysis?.experience_score) return false;
      const expScore = analysis.experience_score;
      if (experienceFilter === "entry" && expScore > 40) return false;
      if (experienceFilter === "mid" && (expScore <= 40 || expScore > 70)) return false;
      if (experienceFilter === "senior" && expScore <= 70) return false;
    }

    // Education filter
    if (educationFilter && educationFilter !== "all") {
      if (!analysis?.education_score) return false;
      const eduScore = analysis.education_score;
      if (educationFilter === "basic" && eduScore > 40) return false;
      if (educationFilter === "intermediate" && (eduScore <= 40 || eduScore > 70)) return false;
      if (educationFilter === "advanced" && eduScore <= 70) return false;
    }

    return true;
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

  const exportToCSV = () => {
    if (!filteredApplications || filteredApplications.length === 0) {
      toast({
        title: "No data to export",
        description: "No candidates match your filters",
        variant: "destructive",
      });
      return;
    }

    const headers = ["Name", "Email", "Phone", "Job Role", "Overall Score", "Skills Score", "Experience Score", "Education Score", "Skills", "Recommendations", "Status"];
    
    const rows = filteredApplications.map(app => {
      const candidate = app.candidates;
      const analysis = app.ai_analysis?.[0];
      const skills = app.skills?.map((s: any) => `${s.skill_name} (${s.proficiency_level})`).join("; ") || "";
      
      return [
        candidate?.name || "",
        candidate?.email || "",
        candidate?.phone || "",
        app.job_role || "",
        analysis?.overall_score || 0,
        analysis?.skills_score || 0,
        analysis?.experience_score || 0,
        analysis?.education_score || 0,
        skills,
        (analysis?.recommendations || "").replace(/"/g, '""'),
        app.status
      ];
    });

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `candidates_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Export Successful",
      description: `Exported ${filteredApplications.length} candidates to CSV`,
    });
  };

  const clearFilters = () => {
    setScoreRange([0, 100]);
    setSkillFilter("");
    setExperienceFilter("all");
    setEducationFilter("all");
  };

  // Match selected candidates to all job requirements
  const matchToJobs = async () => {
    if (!jobRequirements || jobRequirements.length === 0) {
      toast({
        title: "No Job Requirements",
        description: "Please create job requirements first",
        variant: "destructive",
      });
      return;
    }

    const appsToMatch = selectedIds.size > 0
      ? filteredApplications?.filter(app => selectedIds.has(app.id) && app.status === 'analyzed')
      : filteredApplications?.filter(app => app.status === 'analyzed');

    if (!appsToMatch || appsToMatch.length === 0) {
      toast({
        title: "No Analyzed Candidates",
        description: "Select analyzed candidates to match to jobs",
        variant: "destructive",
      });
      return;
    }

    setIsMatching(true);
    setMatchProgress({ current: 0, total: jobRequirements.length });
    let completed = 0;
    let errors = 0;

    for (const jobReq of jobRequirements) {
      try {
        await supabase.functions.invoke('match-candidates', {
          body: {
            jobRequirementId: jobReq.id,
            applicationIds: appsToMatch.map(a => a.id),
          }
        });
        completed++;
      } catch (error) {
        console.error(`Failed to match to job ${jobReq.job_role}:`, error);
        errors++;
      }
      setMatchProgress({ current: completed + errors, total: jobRequirements.length });
    }

    setIsMatching(false);
    queryClient.invalidateQueries({ queryKey: ['jobMatchesForRankings'] });

    toast({
      title: "Job Matching Complete",
      description: `Matched ${appsToMatch.length} candidates to ${completed} jobs${errors > 0 ? `, ${errors} failed` : ''}`,
    });
  };

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

  const updateStatusMutation = useMutation({
    mutationFn: async ({ applicationId, newStatus, oldStatus }: { applicationId: string; newStatus: string; oldStatus: string }) => {
      const { error } = await supabase
        .from('applications')
        .update({ status: newStatus })
        .eq('id', applicationId);
      
      if (error) throw error;

      // Trigger notification for key stages
      const keyStages = ["interview", "offer", "hired"];
      if (keyStages.includes(newStatus)) {
        try {
          await supabase.functions.invoke('notify-status-change', {
            body: {
              applicationId,
              oldStatus,
              newStatus,
            }
          });
        } catch (notifError) {
          console.error("Failed to send notification:", notifError);
          // Don't fail the status update if notification fails
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rankedApplications'] });
      queryClient.invalidateQueries({ queryKey: ['statusHistory'] });
      toast({
        title: "Status Updated",
        description: "Candidate status updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update status",
        variant: "destructive",
      });
    }
  });

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

  // Fetch status history for a specific application
  const { data: statusHistory } = useQuery({
    queryKey: ['statusHistory', viewingStatusHistory],
    queryFn: async () => {
      if (!viewingStatusHistory) return null;
      
      const { data, error } = await supabase
        .from('application_status_history')
        .select(`
          *,
          profiles:changed_by(full_name, email)
        `)
        .eq('application_id', viewingStatusHistory)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!viewingStatusHistory,
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
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={exportToCSV}
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  if (selectedIds.size > 0) {
                    const selectedApps = filteredApplications?.filter(app => selectedIds.has(app.id)) || [];
                    exportMultipleCandidatesToPDF(selectedApps as any);
                  } else if (filteredApplications && filteredApplications.length > 0) {
                    exportMultipleCandidatesToPDF(filteredApplications as any);
                  }
                }}
                className="gap-2"
              >
                <FileDown className="h-4 w-4" />
                Export PDF
              </Button>
              <Button
                variant={compareMode ? "default" : "outline"}
                onClick={() => setCompareMode(!compareMode)}
                className="gap-2"
              >
                <GitCompare className="h-4 w-4" />
                {compareMode ? "Exit Compare" : "Compare Candidates"}
              </Button>
            </div>
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

            <Popover open={showFilters} onOpenChange={setShowFilters}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Filter className="h-4 w-4" />
                  Advanced Filters
                  {(scoreRange[0] > 0 || scoreRange[1] < 100 || skillFilter || experienceFilter || educationFilter) && (
                    <Badge variant="secondary" className="ml-1 px-1.5 py-0">!</Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80" align="end">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold">Advanced Filters</h4>
                    <Button variant="ghost" size="sm" onClick={clearFilters}>
                      Clear All
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <Label>Score Range: {scoreRange[0]} - {scoreRange[1]}</Label>
                    <Slider
                      value={scoreRange}
                      onValueChange={(value) => setScoreRange(value as [number, number])}
                      min={0}
                      max={100}
                      step={5}
                      className="w-full"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Skill</Label>
                    <Input
                      placeholder="e.g., JavaScript, Python"
                      value={skillFilter}
                      onChange={(e) => setSkillFilter(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Experience Level</Label>
                    <Select value={experienceFilter} onValueChange={setExperienceFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="All levels" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All levels</SelectItem>
                        <SelectItem value="entry">Entry (0-40)</SelectItem>
                        <SelectItem value="mid">Mid (41-70)</SelectItem>
                        <SelectItem value="senior">Senior (71+)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Education Level</Label>
                    <Select value={educationFilter} onValueChange={setEducationFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="All levels" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All levels</SelectItem>
                        <SelectItem value="basic">Basic (0-40)</SelectItem>
                        <SelectItem value="intermediate">Intermediate (41-70)</SelectItem>
                        <SelectItem value="advanced">Advanced (71+)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
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
                  <Button
                    onClick={matchToJobs}
                    disabled={isMatching || !jobRequirements?.length}
                    size="sm"
                    variant="outline"
                    className="gap-2"
                  >
                    {isMatching ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Matching {matchProgress.current}/{matchProgress.total}
                      </>
                    ) : (
                      <>
                        <Target className="w-4 h-4" />
                        Match to Jobs
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
                         <div className="flex flex-col items-center justify-center w-16">
                           <div className="flex items-center justify-center w-12 h-12 rounded-full bg-muted mb-1">
                             {!isAnalyzingStatus && !isPending && getRankIcon(index) || (
                               <span className="text-lg font-bold">#{index + 1}</span>
                             )}
                           </div>
                           {!isAnalyzingStatus && !isPending && analysis && (
                             <div className="text-center">
                               <div className={`text-sm font-bold ${getScoreColor(analysis.overall_score || 0)}`}>
                                 {analysis.overall_score || 0}
                               </div>
                              <div className="text-xs text-muted-foreground">score</div>
                            </div>
                          )}
                          {(() => {
                            const bestMatch = getBestMatch(app.id);
                            if (bestMatch) {
                              return (
                                <div className="mt-1 text-center">
                                  <div className={`text-xs font-semibold ${bestMatch.match_score >= 80 ? 'text-green-600' : bestMatch.match_score >= 60 ? 'text-blue-600' : 'text-yellow-600'}`}>
                                    {bestMatch.match_score}%
                                  </div>
                                  <div className="text-[10px] text-muted-foreground truncate max-w-[60px]" title={bestMatch.job_requirements?.job_role}>
                                    {bestMatch.job_requirements?.job_role}
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          })()}
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
                          {/* Status Workflow Selector */}
                          <div className="w-48 mb-2">
                            <Select
                              value={app.status || 'new'}
                              onValueChange={(newStatus) =>
                                updateStatusMutation.mutate({
                                  applicationId: app.id,
                                  newStatus,
                                  oldStatus: app.status || 'new',
                                })
                              }
                            >
                              <SelectTrigger className="text-sm bg-background">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="bg-background z-50">
                                <SelectItem value="new">🆕 New</SelectItem>
                                <SelectItem value="reviewed">👁️ Reviewed</SelectItem>
                                <SelectItem value="interview">💬 Interview</SelectItem>
                                <SelectItem value="offer">🎁 Offer</SelectItem>
                                <SelectItem value="hired">✅ Hired</SelectItem>
                                <SelectItem value="rejected">❌ Rejected</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-2 text-xs"
                              onClick={() => setViewingStatusHistory(app.id)}
                            >
                              <History className="w-3 h-3" />
                              View History
                            </Button>
                            {!isAnalyzingStatus && !isPending && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="gap-2 text-xs"
                                onClick={() => exportCandidateToPDF(app as any)}
                              >
                                <FileDown className="w-3 h-3" />
                                Export PDF
                              </Button>
                            )}
                          </div>
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

        {/* Status History Dialog */}
        {viewingStatusHistory && (
          <AlertDialog open={!!viewingStatusHistory} onOpenChange={() => setViewingStatusHistory(null)}>
            <AlertDialogContent className="max-w-2xl">
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <History className="w-5 h-5" />
                  Status Change History
                </AlertDialogTitle>
              </AlertDialogHeader>
              <div className="max-h-96 overflow-y-auto">
                {statusHistory && statusHistory.length > 0 ? (
                  <div className="space-y-3">
                    {statusHistory.map((history: any) => (
                      <div key={history.id} className="border rounded-lg p-4 bg-muted/30">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <ArrowRightLeft className="w-4 h-4 text-primary" />
                            <span className="text-sm font-medium">
                              {history.old_status ? (
                                <>
                                  <Badge variant="outline" className="mr-2">{history.old_status}</Badge>
                                  →
                                  <Badge variant="default" className="ml-2">{history.new_status}</Badge>
                                </>
                              ) : (
                                <Badge variant="default">{history.new_status}</Badge>
                              )}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="w-3 h-3" />
                            {new Date(history.created_at).toLocaleString()}
                          </div>
                        </div>
                        {history.profiles && (
                          <div className="text-xs text-muted-foreground">
                            Changed by: {history.profiles.full_name || history.profiles.email}
                          </div>
                        )}
                        {history.notes && (
                          <div className="text-sm mt-2 p-2 bg-background rounded">
                            {history.notes}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <History className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>No status changes recorded yet</p>
                  </div>
                )}
              </div>
              <AlertDialogFooter>
                <AlertDialogAction onClick={() => setViewingStatusHistory(null)}>
                  Close
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
};

export default Rankings;