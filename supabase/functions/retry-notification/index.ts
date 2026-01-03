import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@4.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_RETRIES = 3;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { notificationId } = await req.json();

    if (!notificationId) {
      throw new Error('Notification ID is required');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY is not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const resend = new Resend(resendApiKey);

    // Fetch the failed notification
    const { data: notification, error: fetchError } = await supabase
      .from('notification_history')
      .select('*')
      .eq('id', notificationId)
      .single();

    if (fetchError || !notification) {
      throw new Error('Notification not found');
    }

    if (notification.status === 'sent') {
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'Notification was already sent successfully' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (notification.retry_count >= MAX_RETRIES) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: `Maximum retry attempts (${MAX_RETRIES}) reached` 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch the email template based on notification type
    const { data: template } = await supabase
      .from('email_templates')
      .select('*')
      .eq('template_key', notification.notification_type === 'candidate_match' ? 'candidate_high_score' : 'recruiter_alert')
      .eq('is_active', true)
      .single();

    // Build the email content
    const metadata = notification.metadata || {};
    let html = '';
    let subject = notification.subject;

    if (notification.notification_type === 'candidate_match') {
      html = template?.html_template || getDefaultCandidateHtml({
        name: notification.recipient_name || 'Candidate',
        score: metadata.match_score || 0,
        jobRole: metadata.job_role || 'Position'
      });
    } else {
      html = template?.html_template || getDefaultRecruiterHtml(
        metadata.candidates_count || 1,
        notification.recipient_name,
        metadata.threshold || 80
      );
    }

    // Replace template variables if using custom template
    if (template) {
      const variables: Record<string, string> = {
        candidate_name: notification.recipient_name || 'Candidate',
        job_role: metadata.job_role || 'Position',
        match_score: String(metadata.match_score || 0),
        score_message: (metadata.match_score || 0) >= 90 ? 'Outstanding Match!' : 'Strong Match!',
        threshold: String(metadata.threshold || 80),
        count: String(metadata.candidates_count || 1),
        plural: (metadata.candidates_count || 1) > 1 ? 's' : '',
        recruiter_greeting: notification.recipient_name ? ` ${notification.recipient_name}` : ''
      };

      for (const [key, value] of Object.entries(variables)) {
        html = html.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
        subject = subject.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
      }
    }

    console.log(`Retrying notification ${notificationId} to ${notification.recipient_email} (attempt ${notification.retry_count + 1})`);

    try {
      await resend.emails.send({
        from: "Escoger Recruitment <onboarding@resend.dev>",
        to: [notification.recipient_email],
        subject: subject,
        html: html,
      });

      // Update notification as sent
      await supabase
        .from('notification_history')
        .update({
          status: 'sent',
          error_message: null,
          retry_count: notification.retry_count + 1,
          last_retry_at: new Date().toISOString()
        })
        .eq('id', notificationId);

      console.log(`Retry successful for notification ${notificationId}`);

      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Email sent successfully' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } catch (emailError) {
      const errorMsg = emailError instanceof Error ? emailError.message : 'Unknown error';
      
      // Update retry count and error
      await supabase
        .from('notification_history')
        .update({
          retry_count: notification.retry_count + 1,
          last_retry_at: new Date().toISOString(),
          error_message: errorMsg
        })
        .eq('id', notificationId);

      console.error(`Retry failed for notification ${notificationId}:`, emailError);

      return new Response(JSON.stringify({ 
        success: false, 
        message: errorMsg 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

  } catch (error: unknown) {
    console.error('Retry notification error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message, success: false }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function getDefaultCandidateHtml(candidate: { name: string; score: number; jobRole: string }): string {
  return `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 12px 12px; }
    .score { font-size: 48px; font-weight: bold; color: #10b981; }
    .cta { display: inline-block; background: #667eea; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎉 Congratulations, ${candidate.name}!</h1>
    </div>
    <div class="content">
      <p>Great news! Your profile has been identified as a <strong>strong match</strong> for the <strong>${candidate.jobRole}</strong> position.</p>
      <p style="text-align: center;"><span class="score">${candidate.score}%</span><br>Match Score</p>
      <p>Our recruitment team has been notified and will be in touch with you shortly regarding next steps.</p>
      <p>Best regards,<br>The Escoger Team</p>
    </div>
  </div>
</body>
</html>`;
}

function getDefaultRecruiterHtml(count: number, recruiterName: string | null, threshold: number): string {
  return `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 12px 12px; }
    .cta { display: inline-block; background: #f59e0b; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎯 High-Scoring Candidates Alert</h1>
    </div>
    <div class="content">
      <p>Hello${recruiterName ? ` ${recruiterName}` : ''},</p>
      <p>We found <strong>${count} candidate${count > 1 ? 's' : ''}</strong> who scored above <strong>${threshold}%</strong> in our matching system.</p>
      <p>Log in to review these candidates and take action.</p>
      <p>Best regards,<br>The Escoger System</p>
    </div>
  </div>
</body>
</html>`;
}
