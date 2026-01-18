import { Bell, BellOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { usePushNotifications } from "@/hooks/usePushNotifications";

interface PushNotificationToggleProps {
  variant?: "button" | "card" | "switch";
}

export const PushNotificationToggle = ({ variant = "button" }: PushNotificationToggleProps) => {
  const { isSupported, isSubscribed, isLoading, permission, subscribe, unsubscribe } = usePushNotifications();

  if (!isSupported) {
    return null;
  }

  const handleToggle = async () => {
    if (isSubscribed) {
      await unsubscribe();
    } else {
      await subscribe();
    }
  };

  if (variant === "switch") {
    return (
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isSubscribed ? (
            <Bell className="h-5 w-5 text-primary" />
          ) : (
            <BellOff className="h-5 w-5 text-muted-foreground" />
          )}
          <div>
            <Label htmlFor="push-notifications" className="font-medium">
              Push Notifications
            </Label>
            <p className="text-sm text-muted-foreground">
              Get notified when candidates reach key stages
            </p>
          </div>
        </div>
        <Switch
          id="push-notifications"
          checked={isSubscribed}
          onCheckedChange={handleToggle}
          disabled={isLoading || permission === "denied"}
        />
      </div>
    );
  }

  if (variant === "card") {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Push Notifications
          </CardTitle>
          <CardDescription>
            Receive instant alerts when candidates move to Interview, Offer, or Hired stages.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {permission === "denied" ? (
            <p className="text-sm text-destructive">
              Notifications are blocked. Please enable them in your browser settings.
            </p>
          ) : (
            <Button
              onClick={handleToggle}
              disabled={isLoading}
              variant={isSubscribed ? "outline" : "default"}
              className="w-full gap-2"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isSubscribed ? (
                <>
                  <BellOff className="h-4 w-4" />
                  Disable Notifications
                </>
              ) : (
                <>
                  <Bell className="h-4 w-4" />
                  Enable Notifications
                </>
              )}
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  // Default button variant
  return (
    <Button
      onClick={handleToggle}
      disabled={isLoading || permission === "denied"}
      variant={isSubscribed ? "outline" : "default"}
      size="sm"
      className="gap-2"
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : isSubscribed ? (
        <>
          <BellOff className="h-4 w-4" />
          <span className="hidden sm:inline">Disable Alerts</span>
        </>
      ) : (
        <>
          <Bell className="h-4 w-4" />
          <span className="hidden sm:inline">Enable Alerts</span>
        </>
      )}
    </Button>
  );
};