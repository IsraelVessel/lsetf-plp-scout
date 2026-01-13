import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { History, Loader2, LogIn, Key, UserPlus, FileEdit, Upload, Eye } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ActivityLogEntry {
  id: string;
  action_type: string;
  description: string;
  metadata: Record<string, any>;
  created_at: string;
}

const getActionIcon = (actionType: string) => {
  switch (actionType) {
    case 'signup':
      return <UserPlus className="h-4 w-4" />;
    case 'login':
      return <LogIn className="h-4 w-4" />;
    case 'password_change':
      return <Key className="h-4 w-4" />;
    case 'profile_update':
      return <FileEdit className="h-4 w-4" />;
    case 'resume_upload':
      return <Upload className="h-4 w-4" />;
    case 'candidate_view':
      return <Eye className="h-4 w-4" />;
    default:
      return <History className="h-4 w-4" />;
  }
};

const getActionBadgeVariant = (actionType: string): "default" | "secondary" | "destructive" | "outline" => {
  switch (actionType) {
    case 'signup':
      return 'default';
    case 'login':
      return 'secondary';
    case 'password_change':
      return 'destructive';
    default:
      return 'outline';
  }
};

const ActivityLogSection = () => {
  const { t } = useTranslation();
  
  const { data: activities, isLoading } = useQuery({
    queryKey: ['activity-log'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from('activity_log')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return data as ActivityLogEntry[];
    },
  });

  const getActionLabel = (actionType: string) => {
    const key = `activityLog.${actionType}`;
    const translation = t(key);
    // If translation key doesn't exist, fallback to formatted action type
    return translation !== key ? translation : actionType.replace('_', ' ');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5" />
          {t("activityLog.title")}
        </CardTitle>
        <CardDescription>
          {t("activityLog.description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : activities && activities.length > 0 ? (
          <ScrollArea className="h-[300px] pr-4">
            <div className="space-y-4">
              {activities.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="p-2 rounded-full bg-primary/10 text-primary">
                    {getActionIcon(activity.action_type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={getActionBadgeVariant(activity.action_type)}>
                        {getActionLabel(activity.action_type)}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-sm text-foreground truncate">
                      {activity.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <History className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>{t("activityLog.noActivity")}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ActivityLogSection;
