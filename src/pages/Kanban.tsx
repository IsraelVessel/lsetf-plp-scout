import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Mail, Phone, Briefcase, Loader2, FileDown, FileText, ExternalLink, GripVertical, Eye } from "lucide-react";
import { exportCandidateToPDF } from "@/utils/pdfExport";
import { CandidateDetailModal } from "@/components/CandidateDetailModal";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";

const statusColumns = [
  { id: "pending", label: "Pending", color: "bg-slate-500" },
  { id: "analyzed", label: "Analyzed", color: "bg-blue-500" },
  { id: "reviewed", label: "Reviewed", color: "bg-purple-500" },
  { id: "interview", label: "Interview", color: "bg-yellow-500" },
  { id: "offer", label: "Offer", color: "bg-green-500" },
  { id: "hired", label: "Hired", color: "bg-emerald-500" },
  { id: "rejected", label: "Rejected", color: "bg-red-500" },
];

const Kanban = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedApplication, setSelectedApplication] = useState<any>(null);
  const [modalOpen, setModalOpen] = useState(false);

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
        description: "Candidate moved successfully",
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

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;

    const sourceStatus = result.source.droppableId;
    const destinationStatus = result.destination.droppableId;

    if (sourceStatus === destinationStatus) return;

    const applicationId = result.draggableId;
    
    updateStatusMutation.mutate({
      applicationId,
      newStatus: destinationStatus,
      oldStatus: sourceStatus,
    });
  };

  const handleOpenModal = (application: any) => {
    setSelectedApplication(application);
    setModalOpen(true);
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
      <div className="container py-4 sm:py-8 px-2 sm:px-4">
        <div className="mb-4 sm:mb-8">
          <h1 className="text-2xl sm:text-4xl font-bold text-foreground mb-1 sm:mb-2">Kanban Board</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Drag and drop candidates between columns to update their status</p>
        </div>

        <DragDropContext onDragEnd={handleDragEnd}>
          {/* Mobile: Horizontal scroll view */}
          <div className="overflow-x-auto pb-4 -mx-2 px-2 sm:mx-0 sm:px-0">
            <div className="flex gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 sm:gap-4 min-w-max sm:min-w-0">
              {statusColumns.map((column) => {
                const columnApps = getApplicationsByStatus(column.id);
                return (
                  <div key={column.id} className="flex flex-col w-[280px] sm:w-auto flex-shrink-0 sm:flex-shrink">
                    <div className={`${column.color} text-white rounded-t-lg p-2 sm:p-3 mb-2 shadow-md`}>
                      <h3 className="font-semibold text-xs sm:text-sm">{column.label}</h3>
                      <p className="text-xs opacity-90">{columnApps.length} candidate{columnApps.length !== 1 ? 's' : ''}</p>
                    </div>
                    <Droppable droppableId={column.id}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={`space-y-2 sm:space-y-3 flex-1 min-h-[300px] sm:min-h-[400px] rounded-b-lg p-2 transition-colors ${
                            snapshot.isDraggingOver ? 'bg-primary/10 ring-2 ring-primary/30' : 'bg-muted/20'
                          }`}
                        >
                          {columnApps.map((app: any, index: number) => (
                            <Draggable key={app.id} draggableId={app.id} index={index}>
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  className={snapshot.isDragging ? 'opacity-90' : ''}
                                >
                                  <CandidateCard
                                    application={app}
                                    dragHandleProps={provided.dragHandleProps}
                                    onViewDetails={() => handleOpenModal(app)}
                                  />
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </div>
                );
              })}
            </div>
          </div>
        </DragDropContext>
      </div>

      <CandidateDetailModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        application={selectedApplication}
      />
    </div>
  );
};

interface CandidateCardProps {
  application: any;
  dragHandleProps: any;
  onViewDetails: () => void;
}

const CandidateCard = ({ application, dragHandleProps, onViewDetails }: CandidateCardProps) => {
  const candidate = application.candidates;
  const analysis = application.ai_analysis?.[0];

  const handleViewResume = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (application.resume_url) {
      window.open(application.resume_url, '_blank');
    }
  };

  return (
    <Card className="hover:shadow-lg transition-shadow cursor-pointer group">
      <CardHeader className="p-3 pb-2">
        <div className="flex items-start gap-2">
          <div
            {...dragHandleProps}
            className="cursor-grab active:cursor-grabbing p-1 -ml-1 opacity-50 group-hover:opacity-100 transition-opacity"
          >
            <GripVertical className="w-4 h-4 text-muted-foreground" />
          </div>
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
        
        <div className="pt-2 grid grid-cols-2 gap-1">
          <Button
            size="sm"
            variant="default"
            className="h-7 text-xs gap-1"
            onClick={(e) => {
              e.stopPropagation();
              onViewDetails();
            }}
          >
            <Eye className="h-3 w-3" />
            Details
          </Button>
          
          {application.resume_url && (
            <Button
              size="sm"
              variant="secondary"
              className="h-7 text-xs gap-1"
              onClick={handleViewResume}
            >
              <FileText className="h-3 w-3" />
              CV
            </Button>
          )}
          
          {!application.resume_url && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1"
              onClick={(e) => {
                e.stopPropagation();
                exportCandidateToPDF(application);
              }}
            >
              <FileDown className="h-3 w-3" />
              PDF
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default Kanban;
