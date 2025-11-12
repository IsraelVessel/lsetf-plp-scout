import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { Mail, Phone, Briefcase, Loader2 } from "lucide-react";

const statusColumns = [
  { id: "new", label: "New", color: "bg-blue-100 dark:bg-blue-900" },
  { id: "reviewed", label: "Reviewed", color: "bg-purple-100 dark:bg-purple-900" },
  { id: "interview", label: "Interview", color: "bg-yellow-100 dark:bg-yellow-900" },
  { id: "offer", label: "Offer", color: "bg-green-100 dark:bg-green-900" },
  { id: "hired", label: "Hired", color: "bg-emerald-100 dark:bg-emerald-900" },
  { id: "rejected", label: "Rejected", color: "bg-red-100 dark:bg-red-900" },
];

const Kanban = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const { data: applications, isLoading } = useQuery({
    queryKey: ['kanbanApplications'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('applications')
        .select(`
          *,
          candidates(*),
          ai_analysis(*)
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
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update status",
        variant: "destructive",
      });
    }
  });

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over) {
      setActiveId(null);
      return;
    }

    const applicationId = active.id as string;
    const newStatus = over.id as string;

    const application = applications?.find(app => app.id === applicationId);
    if (!application) {
      setActiveId(null);
      return;
    }

    const oldStatus = application.status;

    if (oldStatus !== newStatus) {
      updateStatusMutation.mutate({ applicationId, newStatus, oldStatus });
    }

    setActiveId(null);
  };

  const getApplicationsByStatus = (status: string) => {
    return applications?.filter(app => app.status === status) || [];
  };

  const activeApplication = applications?.find(app => app.id === activeId);

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
          <p className="text-muted-foreground">Drag and drop candidates between status columns</p>
        </div>

        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            {statusColumns.map((column) => (
              <KanbanColumn
                key={column.id}
                id={column.id}
                label={column.label}
                color={column.color}
                applications={getApplicationsByStatus(column.id)}
              />
            ))}
          </div>

          <DragOverlay>
            {activeId && activeApplication ? (
              <CandidateCard application={activeApplication} isDragging />
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
};

const KanbanColumn = ({ id, label, color, applications }: any) => {
  const { setNodeRef } = useDroppable({ id });

  return (
    <div ref={setNodeRef} className="flex flex-col h-full">
      <div className={`${color} rounded-t-lg p-3 mb-2`}>
        <h3 className="font-semibold text-sm">{label}</h3>
        <p className="text-xs opacity-70">{applications.length} candidate{applications.length !== 1 ? 's' : ''}</p>
      </div>
      <div className="flex-1 space-y-2 min-h-[200px]">
        {applications.map((app: any) => (
          <DraggableCard key={app.id} id={app.id} application={app} />
        ))}
      </div>
    </div>
  );
};

const DraggableCard = ({ id, application }: any) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        opacity: isDragging ? 0.5 : 1,
      }
    : undefined;

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <CandidateCard application={application} />
    </div>
  );
};

const CandidateCard = ({ application, isDragging = false }: any) => {
  const candidate = application.candidates;
  const analysis = application.ai_analysis?.[0];

  return (
    <Card className={`cursor-move hover:shadow-lg transition-shadow ${isDragging ? 'rotate-2' : ''}`}>
      <CardHeader className="p-4 pb-2">
        <div className="flex items-start gap-2">
          <Avatar className="w-10 h-10">
            <AvatarFallback className="bg-primary text-primary-foreground">
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
      <CardContent className="p-4 pt-2 space-y-2">
        {analysis && (
          <div className="flex gap-2">
            <Badge variant="outline" className="text-xs">
              Score: {analysis.overall_score}
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
      </CardContent>
    </Card>
  );
};

// Droppable component
const useDroppable = ({ id }: { id: string }) => {
  const { setNodeRef } = useDndKitDroppable({ id });
  return { setNodeRef };
};

// Import from dnd-kit
import { useDroppable as useDndKitDroppable } from "@dnd-kit/core";
import { useDraggable } from "@dnd-kit/core";

export default Kanban;