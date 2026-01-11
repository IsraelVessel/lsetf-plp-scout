import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Bell, Loader2, Save, UserPlus, RefreshCw, AlertCircle, CheckCircle, Calendar } from "lucide-react";

interface EmailPreferences {
  newCandidates?: boolean;
  statusChanges?: boolean;
  interviewReminders?: boolean;
  weeklyDigest?: boolean;
  systemAlerts?: boolean;
}

interface EmailPreferencesSectionProps {
  initialPreferences?: EmailPreferences;
  onSave?: (preferences: EmailPreferences) => Promise<void>;
}

const EmailPreferencesSection = ({ initialPreferences, onSave }: EmailPreferencesSectionProps) => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [preferences, setPreferences] = useState<EmailPreferences>({
    newCandidates: true,
    statusChanges: true,
    interviewReminders: true,
    weeklyDigest: false,
    systemAlerts: true,
  });

  useEffect(() => {
    if (initialPreferences) {
      setPreferences(prev => ({ ...prev, ...initialPreferences }));
    } else {
      loadPreferences();
    }
  }, [initialPreferences]);

  const loadPreferences = async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("profiles")
        .select("preferences")
        .eq("id", user.id)
        .single();

      if (error) throw error;

      if (data?.preferences) {
        const prefs = data.preferences as Record<string, unknown>;
        setPreferences(prev => ({
          ...prev,
          newCandidates: prefs.newCandidates as boolean ?? true,
          statusChanges: prefs.statusChanges as boolean ?? true,
          interviewReminders: prefs.interviewReminders as boolean ?? true,
          weeklyDigest: prefs.weeklyDigest as boolean ?? false,
          systemAlerts: prefs.systemAlerts as boolean ?? true,
        }));
      }
    } catch (err: any) {
      console.error("Error loading preferences:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const savePreferences = async () => {
    setIsSaving(true);
    try {
      if (onSave) {
        await onSave(preferences);
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        // Get current preferences first
        const { data: currentProfile } = await supabase
          .from("profiles")
          .select("preferences")
          .eq("id", user.id)
          .single();

        const currentPrefs = (currentProfile?.preferences as Record<string, unknown>) || {};

        const { error } = await supabase
          .from("profiles")
          .update({
            preferences: JSON.parse(JSON.stringify({
              ...currentPrefs,
              ...preferences,
            })),
            updated_at: new Date().toISOString(),
          })
          .eq("id", user.id);

        if (error) throw error;

        // Log activity
        await supabase.from("activity_log").insert({
          user_id: user.id,
          action_type: "preferences_updated",
          description: "Email notification preferences updated",
        });
      }

      toast({
        title: "Preferences Saved",
        description: "Your email notification preferences have been updated.",
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const preferenceItems = [
    {
      key: "newCandidates",
      label: "New Candidates",
      description: "Get notified when new candidates apply",
      icon: UserPlus,
    },
    {
      key: "statusChanges",
      label: "Status Changes",
      description: "Get notified when candidate statuses change",
      icon: RefreshCw,
    },
    {
      key: "interviewReminders",
      label: "Interview Reminders",
      description: "Receive reminders for scheduled interviews",
      icon: Calendar,
    },
    {
      key: "weeklyDigest",
      label: "Weekly Digest",
      description: "Receive a weekly summary of hiring activity",
      icon: CheckCircle,
    },
    {
      key: "systemAlerts",
      label: "System Alerts",
      description: "Important system notifications and updates",
      icon: AlertCircle,
    },
  ];

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Email Notifications
        </CardTitle>
        <CardDescription>
          Choose which email notifications you'd like to receive
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {preferenceItems.map((item, index) => (
          <div key={item.key}>
            {index > 0 && <Separator className="mb-6" />}
            <div className="flex items-center justify-between">
              <div className="flex items-start gap-3">
                <item.icon className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="space-y-0.5">
                  <Label htmlFor={item.key}>{item.label}</Label>
                  <p className="text-sm text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              </div>
              <Switch
                id={item.key}
                checked={preferences[item.key as keyof EmailPreferences] ?? false}
                onCheckedChange={(checked) =>
                  setPreferences(prev => ({ ...prev, [item.key]: checked }))
                }
              />
            </div>
          </div>
        ))}

        <Separator />

        <Button onClick={savePreferences} disabled={isSaving} className="w-full">
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Save Preferences
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
};

export default EmailPreferencesSection;
