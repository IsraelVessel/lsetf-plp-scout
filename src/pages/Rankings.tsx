import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Trophy, Medal, Award, TrendingUp, Mail, Phone, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const Rankings = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data: applications, isLoading } = useQuery({
    queryKey: ['rankedApplications'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('applications')
        .select(`
          *,
          candidates(*),
          ai_analysis(*),
          skills(*)
        `)
        .in('status', ['analyzed', 'analyzing', 'pending'])
        .order('created_at', { ascending: false });
      
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
          <h1 className="text-4xl font-bold mb-2 flex items-center gap-3">
            <TrendingUp className="w-10 h-10 text-primary" />
            Candidate Rankings
          </h1>
          <p className="text-muted-foreground">
            AI-analyzed candidates ranked by overall score for LSETF & PLP programs
          </p>
        </div>

        {!applications || applications.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">No candidates yet. Upload candidates to get started.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {applications.map((app, index) => {
              const analysis = app.ai_analysis?.[0];
              const candidate = app.candidates;
              const isAnalyzing = app.status === 'analyzing';
              const isPending = app.status === 'pending';
              
              if (!candidate) return null;

              return (
                <Card key={app.id} className="transition-all duration-300 hover:shadow-[var(--shadow-elegant)]">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-4 flex-1">
                        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-muted">
                          {!isAnalyzing && !isPending && getRankIcon(index) || (
                            <span className="text-lg font-bold">#{index + 1}</span>
                          )}
                        </div>
                        <div className="flex-1">
                          <CardTitle className="text-2xl mb-1">{candidate.name}</CardTitle>
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
                      <div className="text-right">
                        {isAnalyzing || isPending ? (
                          <div className="flex flex-col items-end gap-2">
                            <Badge variant="secondary" className="gap-2">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              {isAnalyzing ? 'Analyzing...' : 'Pending'}
                            </Badge>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => retryAnalysis(app.id)}
                            >
                              Reset Status
                            </Button>
                          </div>
                        ) : (
                          <>
                            <div className={`text-4xl font-bold ${getScoreColor(analysis?.overall_score || 0)}`}>
                              {analysis?.overall_score || 0}
                            </div>
                            <div className="text-sm text-muted-foreground">Overall Score</div>
                          </>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {isAnalyzing || isPending ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                        <p>Analysis in progress... Refresh to check status.</p>
                      </div>
                    ) : analysis ? (
                      <>
                        {/* Score Breakdown */}
                        <div className="grid md:grid-cols-3 gap-4">
                          <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span>Skills</span>
                              <span className="font-semibold">{analysis.skills_score}%</span>
                            </div>
                            <Progress value={analysis.skills_score} className="h-2" />
                          </div>
                          <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span>Experience</span>
                              <span className="font-semibold">{analysis.experience_score}%</span>
                            </div>
                            <Progress value={analysis.experience_score} className="h-2" />
                          </div>
                          <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span>Education</span>
                              <span className="font-semibold">{analysis.education_score}%</span>
                            </div>
                            <Progress value={analysis.education_score} className="h-2" />
                          </div>
                        </div>

                        {/* Skills */}
                        {app.skills && app.skills.length > 0 && (
                          <div>
                            <h4 className="font-semibold mb-2">Key Skills</h4>
                            <div className="flex flex-wrap gap-2">
                              {app.skills.map((skill) => (
                                <Badge key={skill.id} variant="secondary">
                                  {skill.skill_name} - {skill.proficiency_level}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Recommendations */}
                        <div>
                          <h4 className="font-semibold mb-2">AI Recommendations</h4>
                          <p className="text-sm text-muted-foreground leading-relaxed">
                            {analysis.recommendations}
                          </p>
                        </div>

                        {/* Summary */}
                        {analysis.analysis_summary?.summary && (
                          <div>
                            <h4 className="font-semibold mb-2">Summary</h4>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                              {analysis.analysis_summary.summary}
                            </p>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <p>No analysis data available yet.</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Rankings;