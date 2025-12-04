import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Edit, Trash2, Target, Briefcase, GraduationCap, Clock, X } from "lucide-react";

interface JobRequirement {
  id: string;
  job_role: string;
  description: string | null;
  min_experience_years: number | null;
  required_skills: string[] | null;
  preferred_skills: string[] | null;
  education_level: string | null;
  requirements: Record<string, any>;
  created_at: string;
}

const educationLevels = [
  "High School",
  "Associate Degree",
  "Bachelor's Degree",
  "Master's Degree",
  "PhD",
  "Professional Certification",
  "No Requirement"
];

export default function JobRequirements() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<JobRequirement | null>(null);
  const [formData, setFormData] = useState({
    job_role: "",
    description: "",
    min_experience_years: 0,
    required_skills: [] as string[],
    preferred_skills: [] as string[],
    education_level: "",
    newRequiredSkill: "",
    newPreferredSkill: ""
  });

  const { data: jobRequirements, isLoading } = useQuery({
    queryKey: ['job-requirements'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('job_requirements')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as JobRequirement[];
    }
  });

  const createMutation = useMutation({
    mutationFn: async (data: { job_role: string; description: string | null; min_experience_years: number; required_skills: string[]; preferred_skills: string[]; education_level: string | null; requirements: Record<string, any> }) => {
      const { error } = await supabase.from('job_requirements').insert([data]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-requirements'] });
      toast.success("Job requirements created");
      resetForm();
      setIsDialogOpen(false);
    },
    onError: (error: any) => {
      toast.error(error.message);
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<JobRequirement> }) => {
      const { error } = await supabase.from('job_requirements').update(data).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-requirements'] });
      toast.success("Job requirements updated");
      resetForm();
      setIsDialogOpen(false);
    },
    onError: (error: any) => {
      toast.error(error.message);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('job_requirements').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-requirements'] });
      toast.success("Job requirements deleted");
    },
    onError: (error: any) => {
      toast.error(error.message);
    }
  });

  const resetForm = () => {
    setFormData({
      job_role: "",
      description: "",
      min_experience_years: 0,
      required_skills: [],
      preferred_skills: [],
      education_level: "",
      newRequiredSkill: "",
      newPreferredSkill: ""
    });
    setEditingJob(null);
  };

  const openEditDialog = (job: JobRequirement) => {
    setEditingJob(job);
    setFormData({
      job_role: job.job_role,
      description: job.description || "",
      min_experience_years: job.min_experience_years || 0,
      required_skills: job.required_skills || [],
      preferred_skills: job.preferred_skills || [],
      education_level: job.education_level || "",
      newRequiredSkill: "",
      newPreferredSkill: ""
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.job_role.trim()) {
      toast.error("Job role is required");
      return;
    }

    const payload = {
      job_role: formData.job_role,
      description: formData.description || null,
      min_experience_years: formData.min_experience_years,
      required_skills: formData.required_skills,
      preferred_skills: formData.preferred_skills,
      education_level: formData.education_level || null,
      requirements: {}
    };

    if (editingJob) {
      updateMutation.mutate({ id: editingJob.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const addSkill = (type: 'required' | 'preferred') => {
    const key = type === 'required' ? 'newRequiredSkill' : 'newPreferredSkill';
    const listKey = type === 'required' ? 'required_skills' : 'preferred_skills';
    const skill = formData[key].trim();
    
    if (skill && !formData[listKey].includes(skill)) {
      setFormData(prev => ({
        ...prev,
        [listKey]: [...prev[listKey], skill],
        [key]: ""
      }));
    }
  };

  const removeSkill = (type: 'required' | 'preferred', skill: string) => {
    const listKey = type === 'required' ? 'required_skills' : 'preferred_skills';
    setFormData(prev => ({
      ...prev,
      [listKey]: prev[listKey].filter(s => s !== skill)
    }));
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold">Job Requirements</h1>
            <p className="text-muted-foreground">Define requirements to match candidates against</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Add Job Requirements</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingJob ? "Edit" : "Create"} Job Requirements</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <Label>Job Role *</Label>
                  <Input
                    value={formData.job_role}
                    onChange={(e) => setFormData(prev => ({ ...prev, job_role: e.target.value }))}
                    placeholder="e.g., Software Engineer"
                  />
                </div>
                
                <div>
                  <Label>Description</Label>
                  <Textarea
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Describe the role and responsibilities..."
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Minimum Experience (years)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={formData.min_experience_years}
                      onChange={(e) => setFormData(prev => ({ ...prev, min_experience_years: parseInt(e.target.value) || 0 }))}
                    />
                  </div>
                  <div>
                    <Label>Education Level</Label>
                    <Select
                      value={formData.education_level}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, education_level: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select level" />
                      </SelectTrigger>
                      <SelectContent>
                        {educationLevels.map(level => (
                          <SelectItem key={level} value={level}>{level}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label>Required Skills</Label>
                  <div className="flex gap-2 mb-2">
                    <Input
                      value={formData.newRequiredSkill}
                      onChange={(e) => setFormData(prev => ({ ...prev, newRequiredSkill: e.target.value }))}
                      placeholder="Add a required skill"
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSkill('required'))}
                    />
                    <Button type="button" variant="secondary" onClick={() => addSkill('required')}>Add</Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {formData.required_skills.map(skill => (
                      <Badge key={skill} variant="default" className="gap-1">
                        {skill}
                        <X className="h-3 w-3 cursor-pointer" onClick={() => removeSkill('required', skill)} />
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <Label>Preferred Skills</Label>
                  <div className="flex gap-2 mb-2">
                    <Input
                      value={formData.newPreferredSkill}
                      onChange={(e) => setFormData(prev => ({ ...prev, newPreferredSkill: e.target.value }))}
                      placeholder="Add a preferred skill"
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSkill('preferred'))}
                    />
                    <Button type="button" variant="secondary" onClick={() => addSkill('preferred')}>Add</Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {formData.preferred_skills.map(skill => (
                      <Badge key={skill} variant="secondary" className="gap-1">
                        {skill}
                        <X className="h-3 w-3 cursor-pointer" onClick={() => removeSkill('preferred', skill)} />
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button variant="outline" onClick={() => { setIsDialogOpen(false); resetForm(); }}>Cancel</Button>
                  <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
                    {editingJob ? "Update" : "Create"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : jobRequirements?.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Target className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No job requirements defined yet</p>
              <p className="text-sm text-muted-foreground">Create your first job requirements to start matching candidates</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {jobRequirements?.map(job => (
              <Card key={job.id} className="hover:shadow-lg transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg">{job.job_role}</CardTitle>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEditDialog(job)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(job.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {job.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{job.description}</p>
                  )}
                  
                  <div className="flex flex-wrap gap-2 text-sm">
                    {job.min_experience_years !== null && job.min_experience_years > 0 && (
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {job.min_experience_years}+ years
                      </div>
                    )}
                    {job.education_level && (
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <GraduationCap className="h-3 w-3" />
                        {job.education_level}
                      </div>
                    )}
                  </div>

                  {job.required_skills && job.required_skills.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Required:</p>
                      <div className="flex flex-wrap gap-1">
                        {job.required_skills.slice(0, 5).map(skill => (
                          <Badge key={skill} variant="default" className="text-xs">{skill}</Badge>
                        ))}
                        {job.required_skills.length > 5 && (
                          <Badge variant="outline" className="text-xs">+{job.required_skills.length - 5}</Badge>
                        )}
                      </div>
                    </div>
                  )}

                  {job.preferred_skills && job.preferred_skills.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Preferred:</p>
                      <div className="flex flex-wrap gap-1">
                        {job.preferred_skills.slice(0, 3).map(skill => (
                          <Badge key={skill} variant="secondary" className="text-xs">{skill}</Badge>
                        ))}
                        {job.preferred_skills.length > 3 && (
                          <Badge variant="outline" className="text-xs">+{job.preferred_skills.length - 3}</Badge>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
