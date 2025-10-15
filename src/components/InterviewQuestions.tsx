import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageSquare, Sparkles } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Question {
  question: string;
  category: string;
  difficulty: string;
}

interface InterviewQuestionsProps {
  applicationId: string;
}

export const InterviewQuestions = ({ applicationId }: InterviewQuestionsProps) => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const generateQuestions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-interview-questions', {
        body: { applicationId }
      });

      if (error) throw error;

      setQuestions(data.questions.questions);
      toast({
        title: "Questions Generated",
        description: "AI has generated tailored interview questions",
      });
    } catch (error) {
      console.error('Error generating questions:', error);
      toast({
        title: "Error",
        description: "Failed to generate questions",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy': return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'medium': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
      case 'hard': return 'bg-red-500/10 text-red-500 border-red-500/20';
      default: return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
    }
  };

  return (
    <Card className="p-4 bg-gradient-to-br from-primary/5 to-accent/5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">AI Interview Questions</h3>
        </div>
        <Button
          onClick={generateQuestions}
          disabled={loading}
          size="sm"
          className="gap-2"
        >
          <Sparkles className="h-4 w-4" />
          {loading ? "Generating..." : "Generate"}
        </Button>
      </div>

      {questions.length > 0 && (
        <div className="space-y-3">
          {questions.map((q, idx) => (
            <Card key={idx} className="p-3 bg-background">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
                  {idx + 1}
                </div>
                <div className="flex-1">
                  <p className="text-sm mb-2">{q.question}</p>
                  <div className="flex gap-2">
                    <Badge variant="outline" className="text-xs">
                      {q.category}
                    </Badge>
                    <Badge variant="outline" className={`text-xs ${getDifficultyColor(q.difficulty)}`}>
                      {q.difficulty}
                    </Badge>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </Card>
  );
};