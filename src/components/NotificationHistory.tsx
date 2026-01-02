import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Mail, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { format } from "date-fns";

interface NotificationRecord {
  id: string;
  notification_type: string;
  recipient_email: string;
  recipient_name: string | null;
  subject: string;
  status: string;
  error_message: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

const NotificationHistory = () => {
  const { data: notifications, isLoading } = useQuery({
    queryKey: ['notification-history'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notification_history')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data as NotificationRecord[];
    }
  });

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'candidate_match':
        return { label: 'Candidate', variant: 'default' as const };
      case 'recruiter_alert':
        return { label: 'Recruiter', variant: 'secondary' as const };
      default:
        return { label: type, variant: 'outline' as const };
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            <CardTitle>Notification History</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-primary" />
          <CardTitle>Notification History</CardTitle>
        </div>
        <CardDescription>
          Recent email notifications sent by the system
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!notifications || notifications.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No notifications sent yet
          </div>
        ) : (
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-3">
              {notifications.map((notification) => {
                const typeInfo = getTypeLabel(notification.notification_type);
                return (
                  <div
                    key={notification.id}
                    className="flex items-start justify-between p-4 border rounded-lg bg-card hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={typeInfo.variant}>{typeInfo.label}</Badge>
                        {notification.status === 'sent' ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-destructive" />
                        )}
                      </div>
                      <p className="font-medium truncate">{notification.subject}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        To: {notification.recipient_name || notification.recipient_email}
                      </p>
                      {notification.error_message && (
                        <p className="text-sm text-destructive">{notification.error_message}</p>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap ml-4">
                      {format(new Date(notification.created_at), 'MMM d, HH:mm')}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};

export default NotificationHistory;