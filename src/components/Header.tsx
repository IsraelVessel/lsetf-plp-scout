import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Brain, Users, TrendingUp, Database } from "lucide-react";

const Header = () => {
  const location = useLocation();
  
  const isActive = (path: string) => location.pathname === path;
  
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center">
        <Link to="/" className="flex items-center space-x-2 mr-8">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
            <Brain className="w-6 h-6 text-white" />
          </div>
          <span className="font-bold text-xl bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary">
            LSETF AI Recruit
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
              Upload Candidates
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
      </div>
    </header>
  );
};

export default Header;