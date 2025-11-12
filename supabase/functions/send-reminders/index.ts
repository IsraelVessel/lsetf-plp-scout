import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseKey);
    const resend = new Resend(resendApiKey);

    console.log("Checking for applications that need reminders...");

    // Find applications that have been in 'reviewed' status for 3+ days without a reminder
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const { data: applications, error: appsError } = await supabase
      .from("applications")
      .select(`
        *,
        candidates(*),
        ai_analysis(*)
      `)
      .eq("status", "reviewed")
      .lt("updated_at", threeDaysAgo.toISOString());

    if (appsError) throw appsError;

    console.log(`Found ${applications?.length || 0} applications needing follow-up`);

    let remindersSent = 0;
    let remindersCreated = 0;

    for (const app of applications || []) {
      // Check if reminder already sent for this application
      const { data: existingReminder } = await supabase
        .from("reminders")
        .select("id")
        .eq("application_id", app.id)
        .eq("reminder_type", "schedule_interview")
        .eq("reminder_status", "sent")
        .single();

      if (existingReminder) {
        console.log(`Reminder already sent for application ${app.id}`);
        continue;
      }

      // Get staff members to notify
      const { data: staffRoles } = await supabase
        .from("user_roles")
        .select(`
          user_id,
          profiles:user_id(email, full_name)
        `)
        .in("role", ["admin", "recruiter"]);

      const staffEmails = staffRoles
        ?.map((role: any) => role.profiles?.email)
        .filter(Boolean) || [];

      if (staffEmails.length === 0) {
        console.log("No staff emails found to send reminders");
        continue;
      }

      const candidate = app.candidates;
      const analysis = app.ai_analysis?.[0];

      // Send reminder emails to staff
      for (const email of staffEmails) {
        try {
          await resend.emails.send({
            from: "Venia ATS <onboarding@resend.dev>",
            to: email,
            subject: `Reminder: Schedule Interview - ${candidate?.name}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #333;">Interview Scheduling Reminder</h2>
                <p>This is a reminder to schedule an interview for the following candidate:</p>
                
                <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
                  <h3 style="margin-top: 0;">${candidate?.name}</h3>
                  <p><strong>Job Role:</strong> ${app.job_role || "Not specified"}</p>
                  <p><strong>Email:</strong> ${candidate?.email}</p>
                  <p><strong>Phone:</strong> ${candidate?.phone || "Not provided"}</p>
                  ${analysis ? `
                    <p><strong>Overall Score:</strong> ${analysis.overall_score}/100</p>
                    <p><strong>Skills Score:</strong> ${analysis.skills_score}/100</p>
                  ` : ''}
                </div>

                <p>This candidate has been in 'Reviewed' status for more than 3 days.</p>
                <p>Please log in to the ATS to schedule an interview or update the candidate's status.</p>
              </div>
            `,
          });

          console.log(`Reminder email sent to ${email}`);
          remindersSent++;
        } catch (emailError) {
          console.error(`Failed to send email to ${email}:`, emailError);
        }
      }

      // Create reminder record
      const { error: reminderError } = await supabase
        .from("reminders")
        .insert({
          application_id: app.id,
          reminder_type: "schedule_interview",
          reminder_status: "sent",
          scheduled_for: new Date().toISOString(),
          sent_at: new Date().toISOString(),
        });

      if (reminderError) {
        console.error("Failed to create reminder record:", reminderError);
      } else {
        remindersCreated++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        remindersSent,
        remindersCreated,
        applicationsProcessed: applications?.length || 0,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("Error in send-reminders function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});