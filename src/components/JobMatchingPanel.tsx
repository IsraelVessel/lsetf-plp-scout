import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Target, Loader2, CheckCircle, XCircle, AlertCircle } from "lucide-react";

interface JobMatchingPanelProps {
  applicationIds?: string[];
  jobRole?: string;
}

export function JobMatchingPanel({ applicationIds, jobRole }: JobMatchingPanelProps) {
  const queryClient = useQueryClient();
  const [selectedJobReq, setSelectedJobReq] = useState<string>("");

  const { data: jobRequirements } = useQuery({
    queryKey: ['job-requirements'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('job_requirements')
        .select('id, job_role')
        .order('job_role');
      if (error) throw error;
      return data;
    }
  });

  const { data: existingMatches } = useQuery({
    queryKey: ['candidate-matches', selectedJobReq, applicationIds],
    queryFn: async () => {
      if (!selectedJobReq) return [];
      let query = supabase
        .from('candidate_job_matches')
        .select(`
          *,
          applications (
            id,
            candidates (name)
          )
        `)
        .eq('job_requirement_id', selectedJobReq)
        .order('match_score', { ascending: false });

      if (applicationIds && applicationIds.length > 0) {
        query = query.in('application_id', applicationIds);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!selectedJobReq
  });

  const matchMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('match-candidates', {
        body: { 
          jobRequirementId: selectedJobReq,
          applicationIds: applicationIds || []
        }
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Matching failed');
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['candidate-matches'] });
      toast.success(`Matched ${data.matches?.length || 0} candidates`);
    },
    onError: (error: any) => {
      toast.error(error.message);
    }
  });

  const getRecommendationColor = (rec: string) => {
    switch (rec) {
      case 'strong_match': return 'bg-green-500';
      case 'good_match': return 'bg-blue-500';
      case 'partial_match': return 'bg-yellow-500';
      case 'weak_match': return 'bg-red-500';
      default: return 'bg-muted';
    }
  };

  const getRecommendationLabel = (rec: string) => {
    switch (rec) {
      case 'strong_match': return 'Strong Match';
      case 'good_match': return 'Good Match';
      case 'partial_match': return 'Partial Match';
      case 'weak_match': return 'Weak Match';
      default: return 'Unknown';
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Target className="h-5 w-5" />
          AI Job Matching
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Select value={selectedJobReq} onValueChange={setSelectedJobReq}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Select job requirements" />
            </SelectTrigger>
            <SelectContent>
              {jobRequirements?.map(req => (
                <SelectItem key={req.id} value={req.id}>{req.job_role}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button 
            onClick={() => matchMutation.mutate()} 
            disabled={!selectedJobReq || matchMutation.isPending}
          >
            {matchMutation.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Matching...</>
            ) : (
              <>Match</>
            )}
          </Button>
        </div>

        {!jobRequirements?.length && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No job requirements defined. Create some first to match candidates.
          </p>
        )}

        {existingMatches && existingMatches.length > 0 && (
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {existingMatches.map((match: any) => (
              <div key={match.id} className="border rounded-lg p-3 space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium">{match.applications?.candidates?.name || 'Unknown'}</p>
                    <Badge className={`${getRecommendationColor(match.match_details?.recommendation)} text-white text-xs`}>
                      {getRecommendationLabel(match.match_details?.recommendation)}
                    </Badge>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">{match.match_score}%</p>
                    <p className="text-xs text-muted-foreground">Match Score</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs">Skills</p>
                    <Progress value={match.skills_match} className="h-1.5 mt-1" />
                    <p className="text-xs mt-0.5">{match.skills_match}%</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Experience</p>
                    <Progress value={match.experience_match} className="h-1.5 mt-1" />
                    <p className="text-xs mt-0.5">{match.experience_match}%</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Education</p>
                    <Progress value={match.education_match} className="h-1.5 mt-1" />
                    <p className="text-xs mt-0.5">{match.education_match}%</p>
                  </div>
                </div>

                {match.match_details?.strengths?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {match.match_details.strengths.slice(0, 3).map((s: string, i: number) => (
                      <Badge key={i} variant="outline" className="text-xs gap-1">
                        <CheckCircle className="h-3 w-3 text-green-500" />{s}
                      </Badge>
                    ))}
                  </div>
                )}

                {match.match_details?.missing_skills?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {match.match_details.missing_skills.slice(0, 2).map((s: string, i: number) => (
                      <Badge key={i} variant="outline" className="text-xs gap-1 text-destructive">
                        <XCircle className="h-3 w-3" />{s}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
