import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Mail, Phone, Briefcase, Loader2, FileDown, FileText, ExternalLink } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { exportCandidateToPDF } from "@/utils/pdfExport";

const statusColumns = [
  { id: "pending", label: "Pending", color: "bg-slate-500" },
  { id: "analyzed", label: "Analyzed", color: "bg-blue-500" },
  { id: "reviewed", label: "Reviewed", color: "bg-purple-500" },
  { id: "interview", label: "Interview", color: "bg-yellow-500" },
  { id: "offer", label: "Offer", color: "bg-green-500" },
  { id: "hired", label: "Hired", color: "bg-emerald-500" },
  { id: "rejected", label: "Rejected", color: "bg-red-500" },
];

const allStatuses = statusColumns.map(s => s.id);

const Kanban = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: applications, isLoading } = useQuery({
    queryKey: ['kanbanApplications'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('applications')
        .select(`
          *,
          candidates(*),
          ai_analysis(*),
          skills(*)
        `)
        .order('updated_at', { ascending: false });
      
      if (error) throw error;
      return data;
    }
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ applicationId, newStatus, oldStatus }: { applicationId: string; newStatus: string; oldStatus: string }) => {
      const { error } = await supabase
        .from('applications')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
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
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kanbanApplications'] });
      toast({
        title: "Status Updated",
        description: "Candidate status updated successfully",
      });
    },
    onError: (error) => {
      console.error("Status update error:", error);
      toast({
        title: "Error",
        description: "Failed to update status. Please try again.",
        variant: "destructive",
      });
    }
  });

  const getApplicationsByStatus = (status: string) => {
    return applications?.filter(app => app.status === status) || [];
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
      <div className="container py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-2">Kanban Board</h1>
          <p className="text-muted-foreground">Organize candidates by status columns</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
          {statusColumns.map((column) => {
            const columnApps = getApplicationsByStatus(column.id);
            return (
              <div key={column.id} className="flex flex-col">
                <div className={`${column.color} text-white rounded-t-lg p-3 mb-2 shadow-md`}>
                  <h3 className="font-semibold text-sm">{column.label}</h3>
                  <p className="text-xs opacity-90">{columnApps.length} candidate{columnApps.length !== 1 ? 's' : ''}</p>
                </div>
                <div className="space-y-3 flex-1 min-h-[400px] bg-muted/20 rounded-b-lg p-2">
                  {columnApps.map((app: any) => (
                    <CandidateCard
                      key={app.id}
                      application={app}
                      isUpdating={updateStatusMutation.isPending}
                      onStatusChange={(newStatus) => {
                        updateStatusMutation.mutate({
                          applicationId: app.id,
                          newStatus,
                          oldStatus: app.status || 'pending',
                        });
                      }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

interface CandidateCardProps {
  application: any;
  isUpdating: boolean;
  onStatusChange: (newStatus: string) => void;
}

const CandidateCard = ({ application, isUpdating, onStatusChange }: CandidateCardProps) => {
  const candidate = application.candidates;
  const analysis = application.ai_analysis?.[0];

  const handleViewResume = () => {
    if (application.resume_url) {
      window.open(application.resume_url, '_blank');
    }
  };

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader className="p-3 pb-2">
        <div className="flex items-start gap-2">
          <Avatar className="w-8 h-8">
            <AvatarFallback className="bg-primary text-primary-foreground text-xs">
              {candidate?.name?.charAt(0) || '?'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-sm truncate">{candidate?.name}</CardTitle>
            {application.job_role && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                <Briefcase className="w-3 h-3" />
                <span className="truncate">{application.job_role}</span>
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-0 space-y-2">
        {analysis && (
          <div className="flex gap-1 flex-wrap">
            <Badge variant="outline" className="text-xs px-1.5 py-0">
              Overall: {analysis.overall_score}
            </Badge>
            <Badge variant="outline" className="text-xs px-1.5 py-0">
              Skills: {analysis.skills_score}
            </Badge>
          </div>
        )}
        <div className="space-y-1 text-xs text-muted-foreground">
          {candidate?.email && (
            <div className="flex items-center gap-1 truncate">
              <Mail className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{candidate.email}</span>
            </div>
          )}
          {candidate?.phone && (
            <div className="flex items-center gap-1">
              <Phone className="w-3 h-3 flex-shrink-0" />
              <span>{candidate.phone}</span>
            </div>
          )}
        </div>
        
        {/* Resume/CV View Button */}
        {application.resume_url && (
          <Button
            size="sm"
            variant="secondary"
            className="w-full h-7 text-xs gap-1"
            onClick={handleViewResume}
          >
            <FileText className="h-3 w-3" />
            View CV
            <ExternalLink className="h-3 w-3" />
          </Button>
        )}
        
        <div className="pt-2 space-y-2">
          <Select 
            value={application.status || 'pending'} 
            onValueChange={onStatusChange}
            disabled={isUpdating}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="analyzed">Analyzed</SelectItem>
              <SelectItem value="reviewed">Reviewed</SelectItem>
              <SelectItem value="interview">Interview</SelectItem>
              <SelectItem value="offer">Offer</SelectItem>
              <SelectItem value="hired">Hired</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
          
          <Button
            size="sm"
            variant="outline"
            className="w-full h-7 text-xs gap-1"
            onClick={() => exportCandidateToPDF(application)}
          >
            <FileDown className="h-3 w-3" />
            Export PDF
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default Kanban;