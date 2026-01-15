import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CommentsSection } from "@/components/CommentsSection";
import { 
  FileText, 
  Mail, 
  Phone, 
  Briefcase, 
  GraduationCap, 
  Star, 
  ExternalLink,
  Download,
  User,
  Brain,
  MessageCircle,
  Sparkles
} from "lucide-react";

interface CandidateDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  application: any;
}

export const CandidateDetailModal = ({ open, onOpenChange, application }: CandidateDetailModalProps) => {
  if (!application) return null;

  const candidate = application.candidates;
  const analysis = application.ai_analysis?.[0];
  const skills = application.skills || [];

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  const getProgressColor = (score: number) => {
    if (score >= 80) return "bg-green-500";
    if (score >= 60) return "bg-yellow-500";
    return "bg-red-500";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-primary text-primary-foreground">
                {candidate?.name?.charAt(0) || '?'}
              </AvatarFallback>
            </Avatar>
            <div>
              <h2 className="text-xl font-bold">{candidate?.name || 'Unknown Candidate'}</h2>
              {application.job_role && (
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Briefcase className="h-3 w-3" />
                  {application.job_role}
                </p>
              )}
            </div>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="overview" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-4 flex-shrink-0">
            <TabsTrigger value="overview" className="gap-1">
              <User className="h-4 w-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="resume" className="gap-1">
              <FileText className="h-4 w-4" />
              Resume
            </TabsTrigger>
            <TabsTrigger value="analysis" className="gap-1">
              <Brain className="h-4 w-4" />
              AI Analysis
            </TabsTrigger>
            <TabsTrigger value="comments" className="gap-1">
              <MessageCircle className="h-4 w-4" />
              Comments
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 mt-4">
            <TabsContent value="overview" className="m-0 space-y-4">
              {/* Contact Information */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Contact Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {candidate?.email && (
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <a href={`mailto:${candidate.email}`} className="text-primary hover:underline">
                        {candidate.email}
                      </a>
                    </div>
                  )}
                  {candidate?.phone && (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <a href={`tel:${candidate.phone}`} className="text-primary hover:underline">
                        {candidate.phone}
                      </a>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Skills */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    Skills ({skills.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {skills.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {skills.map((skill: any) => (
                        <Badge 
                          key={skill.id} 
                          variant={skill.proficiency_level === 'expert' ? 'default' : 'secondary'}
                          className="text-xs"
                        >
                          {skill.skill_name}
                          {skill.proficiency_level && (
                            <span className="ml-1 opacity-70">({skill.proficiency_level})</span>
                          )}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No skills extracted yet</p>
                  )}
                </CardContent>
              </Card>

              {/* Quick Score Summary */}
              {analysis && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Star className="h-4 w-4" />
                      AI Score Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center p-3 rounded-lg bg-muted/50">
                        <p className={`text-2xl font-bold ${getScoreColor(analysis.overall_score || 0)}`}>
                          {analysis.overall_score || 0}
                        </p>
                        <p className="text-xs text-muted-foreground">Overall</p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-muted/50">
                        <p className={`text-2xl font-bold ${getScoreColor(analysis.skills_score || 0)}`}>
                          {analysis.skills_score || 0}
                        </p>
                        <p className="text-xs text-muted-foreground">Skills</p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-muted/50">
                        <p className={`text-2xl font-bold ${getScoreColor(analysis.experience_score || 0)}`}>
                          {analysis.experience_score || 0}
                        </p>
                        <p className="text-xs text-muted-foreground">Experience</p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-muted/50">
                        <p className={`text-2xl font-bold ${getScoreColor(analysis.education_score || 0)}`}>
                          {analysis.education_score || 0}
                        </p>
                        <p className="text-xs text-muted-foreground">Education</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Application Status */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Application Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Status</span>
                    <Badge variant="outline" className="capitalize">{application.status}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Applied</span>
                    <span className="text-sm">{new Date(application.created_at).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Last Updated</span>
                    <span className="text-sm">{new Date(application.updated_at).toLocaleDateString()}</span>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="resume" className="m-0 space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Resume / CV
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {application.resume_url ? (
                    <div className="space-y-4">
                      <div className="flex gap-2">
                        <Button 
                          onClick={() => window.open(application.resume_url, '_blank')}
                          className="gap-2"
                        >
                          <ExternalLink className="h-4 w-4" />
                          Open Resume
                        </Button>
                        <Button 
                          variant="outline"
                          onClick={() => {
                            const link = document.createElement('a');
                            link.href = application.resume_url;
                            link.download = `${candidate?.name || 'resume'}.pdf`;
                            link.click();
                          }}
                          className="gap-2"
                        >
                          <Download className="h-4 w-4" />
                          Download
                        </Button>
                      </div>
                      
                      {/* Embedded Resume Viewer */}
                      <div className="border rounded-lg overflow-hidden">
                        <iframe 
                          src={`https://docs.google.com/viewer?url=${encodeURIComponent(application.resume_url)}&embedded=true`}
                          className="w-full h-[500px]"
                          title="Resume Viewer"
                        />
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No resume uploaded</p>
                  )}
                </CardContent>
              </Card>

              {/* Cover Letter */}
              {application.cover_letter && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Cover Letter</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm whitespace-pre-wrap">{application.cover_letter}</p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="analysis" className="m-0 space-y-4">
              {analysis ? (
                <>
                  {/* Score Breakdown */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Brain className="h-4 w-4" />
                        Detailed Score Breakdown
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span>Overall Score</span>
                          <span className={`font-medium ${getScoreColor(analysis.overall_score || 0)}`}>
                            {analysis.overall_score}%
                          </span>
                        </div>
                        <Progress value={analysis.overall_score || 0} className={getProgressColor(analysis.overall_score || 0)} />
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-1">
                            <Sparkles className="h-3 w-3" /> Skills Match
                          </span>
                          <span className={`font-medium ${getScoreColor(analysis.skills_score || 0)}`}>
                            {analysis.skills_score}%
                          </span>
                        </div>
                        <Progress value={analysis.skills_score || 0} />
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-1">
                            <Briefcase className="h-3 w-3" /> Experience Match
                          </span>
                          <span className={`font-medium ${getScoreColor(analysis.experience_score || 0)}`}>
                            {analysis.experience_score}%
                          </span>
                        </div>
                        <Progress value={analysis.experience_score || 0} />
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-1">
                            <GraduationCap className="h-3 w-3" /> Education Match
                          </span>
                          <span className={`font-medium ${getScoreColor(analysis.education_score || 0)}`}>
                            {analysis.education_score}%
                          </span>
                        </div>
                        <Progress value={analysis.education_score || 0} />
                      </div>
                    </CardContent>
                  </Card>

                  {/* Recommendations */}
                  {analysis.recommendations && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">AI Recommendations</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm whitespace-pre-wrap">{analysis.recommendations}</p>
                      </CardContent>
                    </Card>
                  )}

                  {/* Analysis Summary */}
                  {analysis.analysis_summary && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Analysis Summary</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-60">
                          {JSON.stringify(analysis.analysis_summary, null, 2)}
                        </pre>
                      </CardContent>
                    </Card>
                  )}

                  <p className="text-xs text-muted-foreground text-center">
                    Analyzed on {new Date(analysis.analyzed_at).toLocaleString()}
                  </p>
                </>
              ) : (
                <Card>
                  <CardContent className="py-8 text-center">
                    <Brain className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                    <p className="text-muted-foreground">No AI analysis available yet</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Analysis is performed automatically when a resume is uploaded
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="comments" className="m-0">
              <CommentsSection applicationId={application.id} />
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
