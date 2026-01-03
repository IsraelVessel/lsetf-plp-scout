import { Link, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Users, TrendingUp, Database, LogOut, FolderUp, BarChart3, LayoutGrid, Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import escogerLogo from "@/assets/escoger-logo.jpeg";
import { useQuery } from "@tanstack/react-query";
import { ThemeToggle } from "@/components/ThemeToggle";

const Header = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const location = useLocation();

  const { data: userRole } = useQuery({
    queryKey: ['userRole'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();
      
      return data?.role || null;
    }
  });

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast({
      title: "Signed out",
      description: "You have been signed out successfully.",
    });
    navigate("/auth");
  };
  
  const isActive = (path: string) => location.pathname === path;
  
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center">
        <Link to="/" className="flex items-center space-x-2 mr-8">
          <img src={escogerLogo} alt="Escoger Logo" className="w-10 h-10 rounded-lg" />
          <span className="font-bold text-xl bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary">
            Escoger
          </span>
        </Link>
        
        <nav className="flex items-center space-x-1 flex-1">
          <Link to="/">
            <Button 
              variant={isActive("/") ? "default" : "ghost"}
              className="gap-2"
            >
              <Database className="w-4 h-4" />
              Dashboard
            </Button>
          </Link>
          <Link to="/upload">
            <Button 
              variant={isActive("/upload") ? "default" : "ghost"}
              className="gap-2"
            >
              <Users className="w-4 h-4" />
              Single Upload
            </Button>
          </Link>
          <Link to="/batch-upload">
            <Button 
              variant={isActive("/batch-upload") ? "default" : "ghost"}
              className="gap-2"
            >
              <FolderUp className="w-4 h-4" />
              Batch Upload
            </Button>
          </Link>
          <Link to="/rankings">
            <Button 
              variant={isActive("/rankings") ? "default" : "ghost"}
              className="gap-2"
            >
              <TrendingUp className="w-4 h-4" />
              Rankings
            </Button>
          </Link>
          <Link to="/kanban">
            <Button 
              variant={isActive("/kanban") ? "default" : "ghost"}
              className="gap-2"
            >
              <LayoutGrid className="w-4 h-4" />
              Kanban
            </Button>
          </Link>
          <Link to="/job-requirements">
            <Button 
              variant={isActive("/job-requirements") ? "default" : "ghost"}
              className="gap-2"
            >
              <Target className="w-4 h-4" />
              Job Matching
            </Button>
          </Link>
          {userRole && (userRole === 'admin' || userRole === 'recruiter') && (
            <Link to="/admin-dashboard">
              <Button 
                variant={isActive("/admin-dashboard") ? "default" : "ghost"}
                className="gap-2"
              >
                <BarChart3 className="w-4 h-4" />
                Analytics
              </Button>
            </Link>
          )}
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button variant="ghost" size="sm" onClick={handleSignOut} className="gap-2">
            <LogOut className="w-4 h-4" />
            Sign Out
          </Button>
        </div>
      </div>
    </header>
  );
};

export default Header;