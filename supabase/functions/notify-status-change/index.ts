import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { Resend } from "https://esm.sh/resend@4.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface StatusChangeRequest {
  applicationId: string;
  oldStatus: string;
  newStatus: string;
}

const STATUS_EMOJIS: Record<string, string> = {
  new: "🆕",
  reviewed: "👁️",
  interview: "💬",
  offer: "🎁",
  hired: "✅",
  rejected: "❌",
};

const STATUS_LABELS: Record<string, string> = {
  new: "New Application",
  reviewed: "Under Review",
  interview: "Interview Stage",
  offer: "Offer Extended",
  hired: "Hired",
  rejected: "Application Closed",
};

// Web Push notification sender using fetch API
async function sendPushNotification(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: { title: string; body: string; icon?: string; data?: any }
) {
  try {
    // For web push, we'll use a simpler approach with the Supabase edge function
    // sending to the push endpoint directly won't work without proper VAPID signing
    // Instead, we'll log the notification and rely on email + PWA for now
    console.log("Push notification payload prepared:", JSON.stringify(payload));
    console.log("Would send to endpoint:", subscription.endpoint);
    
    // Note: Full web-push implementation requires VAPID signature generation
    // which is complex in Deno. For now, we'll rely on email notifications
    // and the PWA install prompt for user engagement.
    
    return true;
  } catch (error: any) {
    console.error("Failed to send push notification:", error);
    return false;
  }
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { applicationId, oldStatus, newStatus }: StatusChangeRequest = await req.json();

    console.log(`Status change notification for application ${applicationId}: ${oldStatus} → ${newStatus}`);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch application details
    const { data: application, error: appError } = await supabase
      .from("applications")
      .select(`
        *,
        candidates(name, email),
        ai_analysis(overall_score, recommendations)
      `)
      .eq("id", applicationId)
      .single();

    if (appError || !application) {
      throw new Error(`Failed to fetch application: ${appError?.message}`);
    }

    const candidate = application.candidates;
    const analysis = application.ai_analysis?.[0];

    // Only send notifications for key stages: Interview, Offer, Hired
    const keyStages = ["interview", "offer", "hired"];
    if (!keyStages.includes(newStatus)) {
      console.log(`Status ${newStatus} is not a key stage, skipping notification`);
      return new Response(
        JSON.stringify({ success: true, message: "Not a key stage" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Send push notifications to all team members
    const { data: subscriptions, error: subError } = await supabase
      .from("push_subscriptions")
      .select("*");

    if (!subError && subscriptions && subscriptions.length > 0) {
      console.log(`Sending push notifications to ${subscriptions.length} subscribers`);

      const emoji = STATUS_EMOJIS[newStatus] || "📧";
      const statusLabel = STATUS_LABELS[newStatus] || newStatus;

      const pushPayload = {
        title: `${emoji} ${candidate.name} - ${statusLabel}`,
        body: `Candidate ${newStatus === "hired" ? "has been hired" : newStatus === "offer" ? "received an offer" : "moved to interview"} for ${application.job_role || "a position"}`,
        icon: "/pwa-192x192.png",
        data: {
          applicationId,
          status: newStatus,
          url: `/kanban`,
        },
      };

      for (const sub of subscriptions) {
        await sendPushNotification(
          { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
          pushPayload
        );
      }
    }

    // Send email to candidate
    const candidateEmailContent = getCandidateEmailContent(
      candidate.name,
      newStatus,
      application.job_role,
      analysis
    );

    const candidateEmail = await resend.emails.send({
      from: "Venia Recruitment <onboarding@resend.dev>",
      to: [candidate.email],
      subject: candidateEmailContent.subject,
      html: candidateEmailContent.html,
    });

    console.log("Candidate email sent:", candidateEmail);

    // Fetch team members (admins and recruiters) to notify via email
    const { data: teamMembers, error: teamError } = await supabase
      .from("user_roles")
      .select("user_id, profiles(email, full_name)")
      .in("role", ["admin", "recruiter"]);

    if (!teamError && teamMembers && teamMembers.length > 0) {
      const teamEmails = teamMembers
        .map((member: any) => member.profiles?.email)
        .filter(Boolean);

      if (teamEmails.length > 0) {
        const teamEmailContent = getTeamEmailContent(
          candidate.name,
          newStatus,
          oldStatus,
          application.job_role,
          analysis
        );

        const teamEmail = await resend.emails.send({
          from: "Venia Recruitment <onboarding@resend.dev>",
          to: teamEmails,
          subject: teamEmailContent.subject,
          html: teamEmailContent.html,
        });

        console.log("Team notification sent:", teamEmail);
      }
    }

    return new Response(
      JSON.stringify({ success: true, candidateEmail }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in notify-status-change function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

function getCandidateEmailContent(
  candidateName: string,
  status: string,
  jobRole: string,
  analysis: any
) {
  const emoji = STATUS_EMOJIS[status] || "📧";
  const statusLabel = STATUS_LABELS[status] || status;

  let message = "";

  if (status === "interview") {
    message = `
      <p style="font-size: 16px; color: #333;">Great news! We'd like to invite you for an interview${jobRole ? ` for the ${jobRole} position` : ''}.</p>
      <p style="color: #666;">Our team will reach out shortly with available time slots and interview details.</p>
      <div style="background: #f0f9ff; border-left: 4px solid #0ea5e9; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <strong style="color: #0369a1;">What to expect:</strong>
        <ul style="margin-top: 10px; color: #666;">
          <li>Technical discussion about your experience</li>
          <li>Problem-solving scenarios</li>
          <li>Culture fit assessment</li>
          <li>Q&A session</li>
        </ul>
      </div>
    `;
  } else if (status === "offer") {
    message = `
      <p style="font-size: 16px; color: #333;">Congratulations! We're pleased to extend an offer for the ${jobRole || 'position'}.</p>
      <p style="color: #666;">Please check your email for the detailed offer letter and next steps.</p>
      <div style="background: #f0fdf4; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <strong style="color: #059669;">Next Steps:</strong>
        <ul style="margin-top: 10px; color: #666;">
          <li>Review the offer details carefully</li>
          <li>Feel free to ask any questions</li>
          <li>We look forward to your response</li>
        </ul>
      </div>
    `;
  } else if (status === "hired") {
    message = `
      <p style="font-size: 16px; color: #333;">Welcome to the team! We're excited to have you join us${jobRole ? ` as ${jobRole}` : ''}.</p>
      <p style="color: #666;">Our HR team will be in touch with onboarding details and your start date.</p>
      <div style="background: #fefce8; border-left: 4px solid #eab308; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <strong style="color: #a16207;">Before Your Start Date:</strong>
        <ul style="margin-top: 10px; color: #666;">
          <li>Complete pre-employment documentation</li>
          <li>Prepare necessary identification documents</li>
          <li>Watch for onboarding schedule</li>
        </ul>
      </div>
    `;
  }

  return {
    subject: `${emoji} Application Update: ${statusLabel}${jobRole ? ` - ${jobRole}` : ''}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
          .status-badge { display: inline-block; background: white; color: #667eea; padding: 8px 16px; border-radius: 20px; font-weight: bold; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0 0 10px 0; font-size: 32px;">${emoji} Application Update</h1>
            <div class="status-badge">${statusLabel}</div>
          </div>
          
          <div class="content">
            <h2 style="color: #333; margin-top: 0;">Hello ${candidateName}!</h2>
            ${message}
            
            ${analysis ? `
              <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <h3 style="color: #333; margin-top: 0;">Your Score Summary</h3>
                <div style="text-align: center;">
                  <div style="font-size: 48px; font-weight: bold; color: #667eea;">${analysis.overall_score}/100</div>
                  <p style="color: #666;">Overall Assessment Score</p>
                </div>
              </div>
            ` : ''}

            <div class="footer">
              <p>Thank you for your interest in Venia!</p>
              <p style="margin-top: 20px; font-size: 12px;">
                This is an automated notification from Venia's AI-powered recruitment system.
              </p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `,
  };
}

function getTeamEmailContent(
  candidateName: string,
  newStatus: string,
  oldStatus: string,
  jobRole: string,
  analysis: any
) {
  const emoji = STATUS_EMOJIS[newStatus] || "📧";
  const statusLabel = STATUS_LABELS[newStatus] || newStatus;

  return {
    subject: `${emoji} Candidate Status Update: ${candidateName} → ${statusLabel}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #1e293b; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .info-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
          .status-change { text-align: center; padding: 20px; background: white; border-radius: 8px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2 style="margin: 0;">Candidate Status Update</h2>
            <p style="margin: 5px 0 0 0; opacity: 0.9;">Team Notification</p>
          </div>
          
          <div class="content">
            <div class="status-change">
              <h3 style="margin: 0 0 15px 0;">${candidateName}</h3>
              <p style="color: #666; margin: 0;">
                ${STATUS_EMOJIS[oldStatus] || ''} ${STATUS_LABELS[oldStatus] || oldStatus}
                <strong style="margin: 0 10px;">→</strong>
                ${emoji} ${statusLabel}
              </p>
            </div>

            <div class="info-row">
              <strong>Position:</strong>
              <span>${jobRole || 'Not specified'}</span>
            </div>

            ${analysis ? `
              <div class="info-row">
                <strong>Overall Score:</strong>
                <span style="color: #667eea; font-weight: bold;">${analysis.overall_score}/100</span>
              </div>
            ` : ''}

            <p style="margin-top: 30px; color: #666; font-size: 14px; text-align: center;">
              View full candidate details in your recruitment dashboard.
            </p>
          </div>
        </div>
      </body>
      </html>
    `,
  };
}

serve(handler);