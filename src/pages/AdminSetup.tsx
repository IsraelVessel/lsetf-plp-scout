import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Shield, CheckCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { User } from "@supabase/supabase-js";

const AdminSetup = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasRole, setHasRole] = useState(false);

  useEffect(() => {
    checkAuthAndRole();
  }, []);

  const checkAuthAndRole = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      navigate("/auth");
      return;
    }

    setUser(session.user);

    // Check if user already has a role
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id);

    if (roles && roles.length > 0) {
      setHasRole(true);
    }
  };

  const assignAdminRole = async () => {
    if (!user) return;

    setLoading(true);

    const { error } = await supabase
      .from("user_roles")
      .insert({
        user_id: user.id,
        role: "admin",
      });

    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Success!",
        description: "Admin role assigned successfully.",
      });
      setHasRole(true);
      setTimeout(() => navigate("/"), 1500);
    }

    setLoading(false);
  };

  if (hasRole) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="flex justify-center mb-4">
              <CheckCircle className="w-16 h-16 text-green-500" />
            </div>
            <CardTitle>You're All Set!</CardTitle>
            <CardDescription>
              You already have staff access to the platform.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate("/")} className="w-full">
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <Shield className="w-16 h-16 text-primary" />
          </div>
          <CardTitle className="text-2xl">First-Time Setup</CardTitle>
          <CardDescription>
            Assign yourself as the system administrator to access all features.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted p-4 rounded-lg space-y-2">
            <p className="text-sm font-medium">What this does:</p>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>Grants admin access to view all candidates</li>
              <li>Allows you to manage applications and rankings</li>
              <li>Enables you to invite other staff members</li>
            </ul>
          </div>

          <Button
            onClick={assignAdminRole}
            disabled={loading}
            className="w-full"
            size="lg"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Assigning Role...
              </>
            ) : (
              <>
                <Shield className="w-4 h-4 mr-2" />
                Assign Admin Role
              </>
            )}
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            You can assign additional roles to other users later from the admin panel.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminSetup;
