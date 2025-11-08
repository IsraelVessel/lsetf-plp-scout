import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotificationRequest {
  candidateName: string;
  candidateEmail: string;
  overallScore: number;
  skillsScore: number;
  experienceScore: number;
  educationScore: number;
  recommendations: string;
  jobRole?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      candidateName,
      candidateEmail,
      overallScore,
      skillsScore,
      experienceScore,
      educationScore,
      recommendations,
      jobRole
    }: NotificationRequest = await req.json();

    console.log(`Sending notification to ${candidateEmail} for ${candidateName}`);

    const emailResponse = await resend.emails.send({
      from: "Venia Recruitment <onboarding@resend.dev>",
      to: [candidateEmail],
      subject: `Your Application Analysis Results${jobRole ? ` - ${jobRole}` : ''}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .score-card { background: white; border-radius: 8px; padding: 20px; margin: 15px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .score { font-size: 48px; font-weight: bold; color: #667eea; margin: 10px 0; }
            .score-breakdown { display: flex; justify-content: space-around; margin: 20px 0; }
            .score-item { text-align: center; }
            .score-value { font-size: 24px; font-weight: bold; color: #764ba2; }
            .recommendations { background: #fff; border-left: 4px solid #667eea; padding: 15px; margin: 20px 0; border-radius: 4px; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Hello ${candidateName}!</h1>
              <p>We've completed the analysis of your application${jobRole ? ` for the ${jobRole} position` : ''}.</p>
            </div>
            
            <div class="content">
              <div class="score-card">
                <h2 style="text-align: center; color: #333;">Overall Score</h2>
                <div class="score" style="text-align: center;">${overallScore}/100</div>
                <p style="text-align: center; color: #666;">
                  ${overallScore >= 80 ? 'Excellent!' : overallScore >= 60 ? 'Good performance!' : 'Room for improvement'}
                </p>
              </div>

              <h3 style="color: #333; margin-top: 30px;">Score Breakdown</h3>
              <div class="score-breakdown">
                <div class="score-item">
                  <div>Skills</div>
                  <div class="score-value">${skillsScore}</div>
                </div>
                <div class="score-item">
                  <div>Experience</div>
                  <div class="score-value">${experienceScore}</div>
                </div>
                <div class="score-item">
                  <div>Education</div>
                  <div class="score-value">${educationScore}</div>
                </div>
              </div>

              <div class="recommendations">
                <h3 style="color: #333; margin-top: 0;">AI Recommendations</h3>
                <p style="white-space: pre-line;">${recommendations}</p>
              </div>

              <div class="footer">
                <p>Thank you for your interest in Venia!</p>
                <p>Our recruitment team will review your application and get back to you soon.</p>
                <p style="margin-top: 20px; font-size: 12px;">
                  This is an automated notification from Venia's AI-powered recruitment system.
                </p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    console.log("Email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true, emailResponse }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in send-candidate-notification function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
