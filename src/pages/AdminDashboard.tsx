import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { Clock, TrendingUp, Award } from "lucide-react";

const AdminDashboard = () => {
  const [processingStats, setProcessingStats] = useState<{ avgTime: number; data: any[] }>({
    avgTime: 0,
    data: []
  });
  const [skillsData, setSkillsData] = useState<any[]>([]);
  const [scoreDistribution, setScoreDistribution] = useState<any[]>([]);

  const { data: applications } = useQuery({
    queryKey: ['admin-applications'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('applications')
        .select('*, ai_analysis(*), skills(*)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  useEffect(() => {
    if (applications) {
      // Calculate processing times
      const applicationsWithAnalysis = applications.filter(
        app => app.ai_analysis && Array.isArray(app.ai_analysis) && app.ai_analysis.length > 0
      );

      const processingTimes = applicationsWithAnalysis.map(app => {
        const createdAt = new Date(app.created_at).getTime();
        const analyzedAt = new Date(app.ai_analysis[0].analyzed_at).getTime();
        return (analyzedAt - createdAt) / 1000; // Convert to seconds
      });

      const avgTime = processingTimes.length > 0
        ? processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length
        : 0;

      setProcessingStats({
        avgTime: Math.round(avgTime),
        data: [
          { name: 'Average', time: Math.round(avgTime) },
          { name: 'Min', time: processingTimes.length > 0 ? Math.round(Math.min(...processingTimes)) : 0 },
          { name: 'Max', time: processingTimes.length > 0 ? Math.round(Math.max(...processingTimes)) : 0 }
        ]
      });

      // Calculate skill frequencies
      const skillCounts = new Map<string, number>();
      applications.forEach(app => {
        if (app.skills && Array.isArray(app.skills)) {
          app.skills.forEach((skill: any) => {
            const name = skill.skill_name;
            skillCounts.set(name, (skillCounts.get(name) || 0) + 1);
          });
        }
      });

      const topSkills = Array.from(skillCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, count]) => ({ name, count }));

      setSkillsData(topSkills);

      // Calculate score distribution
      const scoreRanges = [
        { range: '0-20', count: 0 },
        { range: '21-40', count: 0 },
        { range: '41-60', count: 0 },
        { range: '61-80', count: 0 },
        { range: '81-100', count: 0 }
      ];

      applicationsWithAnalysis.forEach(app => {
        const score = app.ai_analysis[0].overall_score;
        if (score <= 20) scoreRanges[0].count++;
        else if (score <= 40) scoreRanges[1].count++;
        else if (score <= 60) scoreRanges[2].count++;
        else if (score <= 80) scoreRanges[3].count++;
        else scoreRanges[4].count++;
      });

      setScoreDistribution(scoreRanges);
    }
  }, [applications]);

  const COLORS = ['hsl(var(--primary))', 'hsl(var(--secondary))', 'hsl(var(--accent))', 'hsl(var(--muted))', 'hsl(var(--chart-1))'];

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <section className="container py-12">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Admin Analytics Dashboard</h1>
          <p className="text-muted-foreground">
            Comprehensive insights into candidate processing and performance metrics
          </p>
        </div>

        {/* Processing Time Section */}
        <Card className="mb-8">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              <CardTitle>Processing Time Analysis</CardTitle>
            </div>
            <CardDescription>
              Average time to analyze applications
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold mb-4">
              {processingStats.avgTime}s average
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={processingStats.data}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" stroke="hsl(var(--foreground))" />
                <YAxis stroke="hsl(var(--foreground))" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }}
                />
                <Bar dataKey="time" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Skills and Scores Grid */}
        <div className="grid md:grid-cols-2 gap-8 mb-8">
          {/* Most Common Skills */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Award className="h-5 w-5 text-secondary" />
                <CardTitle>Top Skills Across Candidates</CardTitle>
              </div>
              <CardDescription>
                Most frequently appearing skills in applications
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={skillsData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" stroke="hsl(var(--foreground))" />
                  <YAxis dataKey="name" type="category" stroke="hsl(var(--foreground))" width={100} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                  <Bar dataKey="count" fill="hsl(var(--secondary))" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Score Distribution */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                <CardTitle>Score Distribution</CardTitle>
              </div>
              <CardDescription>
                Overall score ranges across all candidates
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <PieChart>
                  <Pie
                    data={scoreDistribution}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={120}
                    fill="hsl(var(--primary))"
                    dataKey="count"
                  >
                    {scoreDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
};

export default AdminDashboard;
