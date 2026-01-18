import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Loader2 } from "lucide-react";
import ProtectedRoute from "./components/ProtectedRoute";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";

// Eagerly loaded pages (critical path)
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

// Lazy loaded pages (code splitting)
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Upload = lazy(() => import("./pages/Upload"));
const BatchUpload = lazy(() => import("./pages/BatchUpload"));
const Rankings = lazy(() => import("./pages/Rankings"));
const Kanban = lazy(() => import("./pages/Kanban"));
const AdminSetup = lazy(() => import("./pages/AdminSetup"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const JobRequirements = lazy(() => import("./pages/JobRequirements"));
const Profile = lazy(() => import("./pages/Profile"));
const AdminPanel = lazy(() => import("./pages/AdminPanel"));

const queryClient = new QueryClient();

// Loading fallback component
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="flex flex-col items-center gap-3">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">Loading...</p>
    </div>
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <PWAInstallPrompt />
        <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/admin-setup" element={<ProtectedRoute><AdminSetup /></ProtectedRoute>} />
              <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/upload" element={<ProtectedRoute><Upload /></ProtectedRoute>} />
              <Route path="/batch-upload" element={<ProtectedRoute><BatchUpload /></ProtectedRoute>} />
              <Route path="/rankings" element={<ProtectedRoute><Rankings /></ProtectedRoute>} />
              <Route path="/kanban" element={<ProtectedRoute><Kanban /></ProtectedRoute>} />
              <Route path="/admin-dashboard" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
              <Route path="/job-requirements" element={<ProtectedRoute><JobRequirements /></ProtectedRoute>} />
              <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
              <Route path="/admin-panel" element={<ProtectedRoute><AdminPanel /></ProtectedRoute>} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
