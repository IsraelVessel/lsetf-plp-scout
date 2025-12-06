import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { X, TrendingUp, Award, BookOpen, Target, Briefcase, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface CandidateData {
  id: string;
  job_role: string;
  candidates: {
    name: string;
    email: string;
  };
  ai_analysis: {
    overall_score: number;
    experience_score: number;
    skills_score: number;
    education_score: number;
  }[];
  skills: {
    skill_name: string;
    proficiency_level: string;
  }[];
}

interface JobMatch {
  id: string;
  application_id: string;
  match_score: number;
  skills_match: number;
  experience_match: number;
  education_match: number;
  job_requirements: {
    id: string;
    job_role: string;
    description: string;
  };
}

interface CandidateComparisonProps {
  candidates: CandidateData[];
  onClose: () => void;
  onRemove: (id: string) => void;
}

export const CandidateComparison = ({ candidates, onClose, onRemove }: CandidateComparisonProps) => {
  const applicationIds = candidates.map(c => c.id);

  // Fetch job matches for all selected candidates
  const { data: jobMatches, isLoading } = useQuery({
    queryKey: ['candidateJobMatches', applicationIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('candidate_job_matches')
        .select(`
          *,
          job_requirements(id, job_role, description)
        `)
        .in('application_id', applicationIds);
      
      if (error) throw error;
      return data as unknown as JobMatch[];
    },
    enabled: applicationIds.length > 0,
  });

  // Group matches by job requirement
  const matchesByJob = jobMatches?.reduce((acc, match) => {
    const jobId = match.job_requirements?.id;
    if (!jobId) return acc;
    if (!acc[jobId]) {
      acc[jobId] = {
        jobRole: match.job_requirements.job_role,
        description: match.job_requirements.description,
        candidates: {}
      };
    }
    acc[jobId].candidates[match.application_id] = match;
    return acc;
  }, {} as Record<string, { jobRole: string; description: string; candidates: Record<string, JobMatch> }>);

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600 dark:text-green-400";
    if (score >= 60) return "text-blue-600 dark:text-blue-400";
    if (score >= 40) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  };

  const getProgressColor = (score: number) => {
    if (score >= 80) return "bg-green-500";
    if (score >= 60) return "bg-blue-500";
    if (score >= 40) return "bg-yellow-500";
    return "bg-red-500";
  };

  const jobRequirements = Object.entries(matchesByJob || {});

  return (
    <Card className="p-6 mb-6 bg-gradient-to-br from-primary/5 to-accent/5 border-2">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-2xl font-bold flex items-center gap-2">
          <Target className="h-6 w-6 text-primary" />
          Candidate Comparison
        </h3>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="overview">AI Analysis</TabsTrigger>
          <TabsTrigger value="job-matches" className="gap-2">
            <Briefcase className="h-4 w-4" />
            Job Matches
            {jobRequirements.length > 0 && (
              <Badge variant="secondary" className="ml-1">{jobRequirements.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {candidates.map((candidate) => {
              const analysis = candidate.ai_analysis[0];
              return (
                <Card key={candidate.id} className="p-4 relative">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute top-2 right-2"
                    onClick={() => onRemove(candidate.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>

                  <div className="mb-3">
                    <h4 className="font-semibold text-lg">{candidate.candidates.name}</h4>
                    <p className="text-sm text-muted-foreground">{candidate.job_role}</p>
                  </div>

                  <div className="space-y-2 mb-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Overall</span>
                      <Badge variant={analysis?.overall_score >= 80 ? "default" : "secondary"}>
                        {analysis?.overall_score || 0}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-primary" />
                      <span className="text-sm">Experience: {analysis?.experience_score || 0}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Award className="h-4 w-4 text-primary" />
                      <span className="text-sm">Skills: {analysis?.skills_score || 0}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-primary" />
                      <span className="text-sm">Education: {analysis?.education_score || 0}</span>
                    </div>
                  </div>

                  <div className="border-t pt-3">
                    <p className="text-xs font-medium mb-2">Top Skills:</p>
                    <div className="flex flex-wrap gap-1">
                      {candidate.skills.slice(0, 3).map((skill, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs">
                          {skill.skill_name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="job-matches">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="ml-2">Loading job matches...</span>
            </div>
          ) : jobRequirements.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Target className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="font-medium">No job matches found</p>
              <p className="text-sm">Run job matching from the Job Requirements page to see match scores here.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {jobRequirements.map(([jobId, data]) => (
                <Card key={jobId} className="p-4">
                  <div className="mb-4">
                    <h4 className="font-semibold text-lg flex items-center gap-2">
                      <Briefcase className="h-5 w-5 text-primary" />
                      {data.jobRole}
                    </h4>
                    {data.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{data.description}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {candidates.map((candidate) => {
                      const match = data.candidates[candidate.id];
                      
                      return (
                        <div key={candidate.id} className="border rounded-lg p-3 bg-background">
                          <div className="flex items-center justify-between mb-3">
                            <span className="font-medium text-sm">{candidate.candidates.name}</span>
                            {match ? (
                              <span className={`text-lg font-bold ${getScoreColor(match.match_score)}`}>
                                {match.match_score}%
                              </span>
                            ) : (
                              <Badge variant="outline">Not Matched</Badge>
                            )}
                          </div>

                          {match ? (
                            <div className="space-y-2">
                              <div className="space-y-1">
                                <div className="flex justify-between text-xs">
                                  <span>Skills</span>
                                  <span className={getScoreColor(match.skills_match || 0)}>
                                    {match.skills_match || 0}%
                                  </span>
                                </div>
                                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                  <div 
                                    className={`h-full transition-all ${getProgressColor(match.skills_match || 0)}`}
                                    style={{ width: `${match.skills_match || 0}%` }}
                                  />
                                </div>
                              </div>

                              <div className="space-y-1">
                                <div className="flex justify-between text-xs">
                                  <span>Experience</span>
                                  <span className={getScoreColor(match.experience_match || 0)}>
                                    {match.experience_match || 0}%
                                  </span>
                                </div>
                                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                  <div 
                                    className={`h-full transition-all ${getProgressColor(match.experience_match || 0)}`}
                                    style={{ width: `${match.experience_match || 0}%` }}
                                  />
                                </div>
                              </div>

                              <div className="space-y-1">
                                <div className="flex justify-between text-xs">
                                  <span>Education</span>
                                  <span className={getScoreColor(match.education_match || 0)}>
                                    {match.education_match || 0}%
                                  </span>
                                </div>
                                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                  <div 
                                    className={`h-full transition-all ${getProgressColor(match.education_match || 0)}`}
                                    style={{ width: `${match.education_match || 0}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              No match data available for this job.
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </Card>
  );
};
