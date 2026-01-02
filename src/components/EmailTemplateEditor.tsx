import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { FileText, Save, Loader2, Eye, Code } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface EmailTemplate {
  id: string;
  template_key: string;
  template_name: string;
  subject_template: string;
  html_template: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const EmailTemplateEditor = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedTemplate, setSelectedTemplate] = useState<string>('candidate_high_score');
  const [subject, setSubject] = useState('');
  const [htmlContent, setHtmlContent] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [viewMode, setViewMode] = useState<'code' | 'preview'>('code');

  const { data: templates, isLoading } = useQuery({
    queryKey: ['email-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_templates')
        .select('*')
        .order('template_name');
      
      if (error) throw error;
      return data as EmailTemplate[];
    }
  });

  const currentTemplate = templates?.find(t => t.template_key === selectedTemplate);

  useEffect(() => {
    if (currentTemplate) {
      setSubject(currentTemplate.subject_template);
      setHtmlContent(currentTemplate.html_template);
      setIsActive(currentTemplate.is_active);
    }
  }, [currentTemplate]);

  const handleSave = async () => {
    if (!currentTemplate) return;
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('email_templates')
        .update({
          subject_template: subject,
          html_template: htmlContent,
          is_active: isActive
        })
        .eq('id', currentTemplate.id);

      if (error) throw error;

      toast({
        title: "Template saved",
        description: `${currentTemplate.template_name} has been updated successfully.`,
      });
      
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
    } catch (error) {
      console.error('Error saving template:', error);
      toast({
        title: "Error",
        description: "Failed to save template. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Replace template variables with sample data for preview
  const getPreviewHtml = () => {
    return htmlContent
      .replace(/\{\{candidate_name\}\}/g, 'John Smith')
      .replace(/\{\{job_role\}\}/g, 'Senior Software Engineer')
      .replace(/\{\{match_score\}\}/g, '92')
      .replace(/\{\{score_message\}\}/g, 'Outstanding Match!')
      .replace(/\{\{count\}\}/g, '3')
      .replace(/\{\{plural\}\}/g, 's')
      .replace(/\{\{threshold\}\}/g, '80')
      .replace(/\{\{recruiter_greeting\}\}/g, ' Sarah')
      .replace(/\{\{candidates_list\}\}/g, `
        <div class="candidate-item">
          <div><strong>John Smith</strong><div style="color: #666; font-size: 14px;">Senior Software Engineer</div></div>
          <span class="score-badge">92%</span>
        </div>
        <div class="candidate-item">
          <div><strong>Jane Doe</strong><div style="color: #666; font-size: 14px;">Senior Software Engineer</div></div>
          <span class="score-badge">88%</span>
        </div>
      `);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <CardTitle>Email Templates</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <CardTitle>Email Templates</CardTitle>
        </div>
        <CardDescription>
          Customize the email templates sent to candidates and recruiters. Use {"{{variable}}"} syntax for dynamic content.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Template Selector */}
        <Tabs value={selectedTemplate} onValueChange={setSelectedTemplate}>
          <TabsList className="grid w-full grid-cols-2">
            {templates?.map((template) => (
              <TabsTrigger key={template.template_key} value={template.template_key}>
                {template.template_name}
              </TabsTrigger>
            ))}
          </TabsList>

          {templates?.map((template) => (
            <TabsContent key={template.template_key} value={template.template_key} className="space-y-4">
              {template.description && (
                <p className="text-sm text-muted-foreground">{template.description}</p>
              )}

              {/* Active Toggle */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Template Active</Label>
                  <p className="text-sm text-muted-foreground">
                    {isActive ? "This template will be used for notifications" : "This template is disabled"}
                  </p>
                </div>
                <Switch checked={isActive} onCheckedChange={setIsActive} />
              </div>

              {/* Subject Template */}
              <div className="space-y-2">
                <Label htmlFor="subject">Subject Line</Label>
                <Input
                  id="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Email subject..."
                />
                <p className="text-xs text-muted-foreground">
                  Available variables: {"{{job_role}}"}, {"{{candidate_name}}"}, {"{{match_score}}"}, {"{{count}}"}, {"{{threshold}}"}
                </p>
              </div>

              {/* HTML Template */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Email Body (HTML)</Label>
                  <div className="flex gap-1">
                    <Button
                      variant={viewMode === 'code' ? 'secondary' : 'ghost'}
                      size="sm"
                      onClick={() => setViewMode('code')}
                      className="gap-1"
                    >
                      <Code className="h-4 w-4" />
                      Code
                    </Button>
                    <Button
                      variant={viewMode === 'preview' ? 'secondary' : 'ghost'}
                      size="sm"
                      onClick={() => setViewMode('preview')}
                      className="gap-1"
                    >
                      <Eye className="h-4 w-4" />
                      Preview
                    </Button>
                  </div>
                </div>
                
                {viewMode === 'code' ? (
                  <Textarea
                    value={htmlContent}
                    onChange={(e) => setHtmlContent(e.target.value)}
                    placeholder="HTML template..."
                    className="font-mono text-sm min-h-[300px]"
                  />
                ) : (
                  <ScrollArea className="h-[300px] border rounded-md bg-white">
                    <iframe
                      srcDoc={getPreviewHtml()}
                      className="w-full h-[500px] border-0"
                      title="Email Preview"
                    />
                  </ScrollArea>
                )}
              </div>

              {/* Save Button */}
              <Button onClick={handleSave} disabled={isSaving} className="gap-2">
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Save Template
                  </>
                )}
              </Button>
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default EmailTemplateEditor;