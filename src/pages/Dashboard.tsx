import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, FileText, TrendingUp, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const Dashboard = () => {
  const [stats, setStats] = useState({
    totalCandidates: 0,
    totalApplications: 0,
    analyzedApplications: 0,
    averageScore: 0
  });

  const { data: candidates } = useQuery({
    queryKey: ['candidates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('candidates')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  const { data: applications } = useQuery({
    queryKey: ['applications'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('applications')
        .select('*, ai_analysis(*)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  useEffect(() => {
    if (candidates && applications) {
      const analyzed = applications.filter(app => app.status === 'analyzed');
      const scores = analyzed
        .map(app => app.ai_analysis?.[0]?.overall_score)
        .filter(score => score !== undefined) as number[];
      
      const avgScore = scores.length > 0 
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : 0;

      setStats({
        totalCandidates: candidates.length,
        totalApplications: applications.length,
        analyzedApplications: analyzed.length,
        averageScore: avgScore
      });
    }
  }, [candidates, applications]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      {/* Hero Section */}
      <section className="relative py-20 px-4 overflow-hidden">
        <div className="absolute inset-0 bg-[var(--gradient-hero)] opacity-10" />
        <div className="container relative">
          <div className="max-w-3xl mx-auto text-center space-y-6">
            <h1 className="text-5xl font-bold tracking-tight">
              AI-Powered Candidate Selection
            </h1>
            <p className="text-xl text-muted-foreground">
              Intelligent analysis for candidate selection. Upload multiple resumes at once, get instant detailed AI rankings capturing every detail from CVs, and identify top talents.
            </p>
            <div className="flex gap-4 justify-center pt-4">
              <Link to="/batch-upload">
                <Button size="lg" className="gap-2">
                  <Users className="w-5 h-5" />
                  Batch Upload
                </Button>
              </Link>
              <Link to="/upload">
                <Button size="lg" variant="outline" className="gap-2">
                  <Users className="w-5 h-5" />
                  Single Upload
                </Button>
              </Link>
              <Link to="/rankings">
                <Button size="lg" variant="outline" className="gap-2">
                  <TrendingUp className="w-5 h-5" />
                  View Rankings
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="container py-12">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Card className="transition-all duration-300 hover:shadow-[var(--shadow-elegant)]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Candidates</CardTitle>
              <Users className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.totalCandidates}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Registered in system
              </p>
            </CardContent>
          </Card>

          <Card className="transition-all duration-300 hover:shadow-[var(--shadow-elegant)]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Applications</CardTitle>
              <FileText className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.totalApplications}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Total submissions
              </p>
            </CardContent>
          </Card>

          <Card className="transition-all duration-300 hover:shadow-[var(--shadow-elegant)]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">AI Analyzed</CardTitle>
              <Brain className="h-4 w-4 text-secondary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.analyzedApplications}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Processed by AI
              </p>
            </CardContent>
          </Card>

          <Card className="transition-all duration-300 hover:shadow-[var(--shadow-elegant)]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Average Score</CardTitle>
              <TrendingUp className="h-4 w-4 text-secondary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.averageScore}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Out of 100
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Features Section */}
      <section className="container py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-4">Powerful AI Analysis</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Our platform uses advanced machine learning to evaluate candidates comprehensively
          </p>
        </div>
        
        <div className="grid md:grid-cols-3 gap-8">
          <Card>
            <CardHeader>
              <Brain className="w-12 h-12 text-primary mb-4" />
              <CardTitle>Smart Ranking</CardTitle>
              <CardDescription>
                AI evaluates skills, experience, and education to rank candidates objectively
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <Users className="w-12 h-12 text-primary mb-4" />
              <CardTitle>Batch Processing</CardTitle>
              <CardDescription>
                Upload multiple resumes at once and get instant AI-powered analysis
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <TrendingUp className="w-12 h-12 text-secondary mb-4" />
              <CardTitle>Program Integration</CardTitle>
              <CardDescription>
                Seamlessly connect with Escoger's upskilling platform for program matching
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </section>
    </div>
  );
};

export default Dashboard;