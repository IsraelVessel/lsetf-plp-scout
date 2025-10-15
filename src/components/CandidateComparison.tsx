import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { X, TrendingUp, Award, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

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

interface CandidateComparisonProps {
  candidates: CandidateData[];
  onClose: () => void;
  onRemove: (id: string) => void;
}

export const CandidateComparison = ({ candidates, onClose, onRemove }: CandidateComparisonProps) => {
  return (
    <Card className="p-6 mb-6 bg-gradient-to-br from-primary/5 to-accent/5 border-2">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-2xl font-bold">Candidate Comparison</h3>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

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
    </Card>
  );
};