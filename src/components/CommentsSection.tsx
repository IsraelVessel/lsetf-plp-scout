import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageCircle, Send } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Comment {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  profiles?: {
    full_name: string;
    email: string;
  };
}

interface CommentsSectionProps {
  applicationId: string;
}

export const CommentsSection = ({ applicationId }: CommentsSectionProps) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchComments();
    
    // Subscribe to realtime updates
    const channel = supabase
      .channel(`comments-${applicationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'comments',
          filter: `application_id=eq.${applicationId}`
        },
        () => {
          fetchComments();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [applicationId]);

  const fetchComments = async () => {
    const { data, error } = await supabase
      .from('comments')
      .select('*')
      .eq('application_id', applicationId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      // Fetch user profiles separately
      const userIds = [...new Set(data.map(c => c.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
      
      const commentsWithProfiles = data.map(comment => ({
        ...comment,
        profiles: profileMap.get(comment.user_id) || { full_name: '', email: '' }
      }));
      
      setComments(commentsWithProfiles as any);
    }
  };

  const handleSubmit = async () => {
    if (!newComment.trim()) return;

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('comments')
        .insert({
          application_id: applicationId,
          user_id: user.id,
          content: newComment.trim()
        });

      if (error) throw error;

      setNewComment("");
      toast({
        title: "Comment Added",
        description: "Your comment has been posted",
      });
    } catch (error) {
      console.error('Error adding comment:', error);
      toast({
        title: "Error",
        description: "Failed to add comment",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <MessageCircle className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Team Comments</h3>
        <span className="text-sm text-muted-foreground">({comments.length})</span>
      </div>

      <div className="space-y-3 mb-4 max-h-60 overflow-y-auto">
        {comments.map((comment) => (
          <Card key={comment.id} className="p-3 bg-muted/50">
            <div className="flex justify-between items-start mb-1">
              <span className="font-medium text-sm">
                {comment.profiles?.full_name || comment.profiles?.email || 'Unknown User'}
              </span>
              <span className="text-xs text-muted-foreground">
                {new Date(comment.created_at).toLocaleDateString()}
              </span>
            </div>
            <p className="text-sm">{comment.content}</p>
          </Card>
        ))}
      </div>

      <div className="flex gap-2">
        <Textarea
          placeholder="Add a comment..."
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          className="min-h-[60px]"
        />
        <Button
          onClick={handleSubmit}
          disabled={loading || !newComment.trim()}
          size="sm"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
};