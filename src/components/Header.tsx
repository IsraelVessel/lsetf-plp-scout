import { Link, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Users, TrendingUp, Database, LogOut, FolderUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import veniaLogo from "@/assets/venia-logo.png";

const Header = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast({
      title: "Signed out",
      description: "You have been signed out successfully.",
    });
    navigate("/auth");
  };
  const location = useLocation();
  
  const isActive = (path: string) => location.pathname === path;
  
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center">
        <Link to="/" className="flex items-center space-x-2 mr-8">
          <img src={veniaLogo} alt="Venia Logo" className="w-10 h-10 rounded-lg" />
          <span className="font-bold text-xl bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary">
            Venia
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
        </nav>
        <Button variant="ghost" size="sm" onClick={handleSignOut} className="gap-2">
          <LogOut className="w-4 h-4" />
          Sign Out
        </Button>
      </div>
    </header>
  );
};

export default Header;