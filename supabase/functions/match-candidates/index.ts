import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@4.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEFAULT_THRESHOLD = 80;

// Helper function to replace template variables
function applyTemplate(template: string, variables: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return result;
}

// Helper to log notification
async function logNotification(
  supabase: any,
  type: string,
  email: string,
  name: string | null,
  subject: string,
  status: 'sent' | 'failed',
  error?: string,
  metadata?: Record<string, unknown>
) {
  try {
    await supabase.from('notification_history').insert({
      notification_type: type,
      recipient_email: email,
      recipient_name: name,
      subject: subject,
      status: status,
      error_message: error || null,
      metadata: metadata || {}
    });
  } catch (e) {
    console.error('Failed to log notification:', e);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { jobRequirementId, applicationIds } = await req.json();

    if (!jobRequirementId) {
      throw new Error('Job requirement ID is required');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    const supabase = createClient(supabaseUrl, supabaseKey);
    const resend = resendApiKey ? new Resend(resendApiKey) : null;

    // Fetch notification settings from database
    const { data: settingsData } = await supabase
      .from('app_settings')
      .select('setting_value')
      .eq('setting_key', 'notification_threshold')
      .single();

    const settings = settingsData?.setting_value as { 
      candidate_threshold?: number; 
      recruiter_notification_enabled?: boolean 
    } | null;
    
    const threshold = settings?.candidate_threshold ?? DEFAULT_THRESHOLD;
    const recruiterNotificationsEnabled = settings?.recruiter_notification_enabled ?? true;

    console.log(`Using threshold: ${threshold}, recruiter notifications: ${recruiterNotificationsEnabled}`);

    // Fetch email templates
    const { data: templatesData } = await supabase
      .from('email_templates')
      .select('*')
      .eq('is_active', true);

    const candidateTemplate = templatesData?.find((t: any) => t.template_key === 'candidate_high_score');
    const recruiterTemplate = templatesData?.find((t: any) => t.template_key === 'recruiter_alert');

    console.log(`Templates loaded: candidate=${!!candidateTemplate}, recruiter=${!!recruiterTemplate}`);

    // Fetch job requirements
    const { data: jobReq, error: jobError } = await supabase
      .from('job_requirements')
      .select('*')
      .eq('id', jobRequirementId)
      .single();

    if (jobError || !jobReq) {
      throw new Error('Job requirements not found');
    }

    // Build query for applications
    let query = supabase
      .from('applications')
      .select(`
        id,
        job_role,
        candidates (name, email),
        ai_analysis (skills_score, experience_score, education_score, overall_score, analysis_summary),
        skills (skill_name, proficiency_level)
      `)
      .eq('status', 'analyzed');

    if (applicationIds && applicationIds.length > 0) {
      query = query.in('id', applicationIds);
    } else if (jobReq.job_role) {
      query = query.eq('job_role', jobReq.job_role);
    }

    const { data: applications, error: appError } = await query;

    if (appError) {
      throw new Error(`Failed to fetch applications: ${appError.message}`);
    }

    if (!applications || applications.length === 0) {
      return new Response(JSON.stringify({ success: true, matches: [], message: 'No applications to match' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch recruiters for notifications
    let recruiters: Array<{ email: string; full_name: string | null }> = [];
    if (recruiterNotificationsEnabled && resend) {
      const { data: recruiterData } = await supabase
        .from('user_roles')
        .select('user_id')
        .in('role', ['admin', 'recruiter']);

      if (recruiterData && recruiterData.length > 0) {
        const userIds = recruiterData.map((r: any) => r.user_id);
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('email, full_name')
          .in('id', userIds);

        if (profilesData) {
          recruiters = profilesData;
        }
      }
      console.log(`Found ${recruiters.length} recruiters for notifications`);
    }

    const matches = [];
    const highScoreCandidates: Array<{ name: string; email: string; score: number; jobRole: string }> = [];

    for (const app of applications) {
      const aiAnalysis = app.ai_analysis?.[0];
      const skills = app.skills || [];
      const candidate = Array.isArray(app.candidates) ? app.candidates[0] : app.candidates;
      const candidateName = candidate?.name || 'Unknown';
      const candidateEmail = candidate?.email || '';

      // Build candidate profile for AI matching
      const candidateProfile = {
        name: candidateName,
        skills: skills.map((s: any) => ({ name: s.skill_name, level: s.proficiency_level })),
        aiScores: aiAnalysis ? {
          skills: aiAnalysis.skills_score,
          experience: aiAnalysis.experience_score,
          education: aiAnalysis.education_score,
          overall: aiAnalysis.overall_score
        } : null,
        summary: aiAnalysis?.analysis_summary || {}
      };

      // Use AI to calculate match score
      const prompt = `You are evaluating how well a candidate matches specific job requirements.

JOB REQUIREMENTS:
- Role: ${jobReq.job_role}
- Description: ${jobReq.description || 'Not specified'}
- Minimum Experience: ${jobReq.min_experience_years} years
- Required Skills: ${jobReq.required_skills?.join(', ') || 'None specified'}
- Preferred Skills: ${jobReq.preferred_skills?.join(', ') || 'None specified'}
- Education Level: ${jobReq.education_level || 'Not specified'}
- Additional Requirements: ${JSON.stringify(jobReq.requirements)}

CANDIDATE PROFILE:
- Name: ${candidateProfile.name}
- Skills: ${candidateProfile.skills.map((s: any) => `${s.name} (${s.level})`).join(', ') || 'None listed'}
- AI Analysis Scores: ${candidateProfile.aiScores ? `Skills: ${candidateProfile.aiScores.skills}/100, Experience: ${candidateProfile.aiScores.experience}/100, Education: ${candidateProfile.aiScores.education}/100` : 'Not analyzed'}
- Summary: ${JSON.stringify(candidateProfile.summary)}

Evaluate the candidate's fit for this specific role and provide match scores.`;

      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${lovableApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash-lite',
          messages: [
            { role: 'system', content: 'You are an expert HR analyst specializing in candidate-job matching.' },
            { role: 'user', content: prompt }
          ],
          tools: [{
            type: 'function',
            function: {
              name: 'evaluate_match',
              description: 'Evaluate candidate match against job requirements',
              parameters: {
                type: 'object',
                properties: {
                  match_score: { type: 'integer', description: 'Overall match score 0-100' },
                  skills_match: { type: 'integer', description: 'Skills match score 0-100' },
                  experience_match: { type: 'integer', description: 'Experience match score 0-100' },
                  education_match: { type: 'integer', description: 'Education match score 0-100' },
                  matched_required_skills: { type: 'array', items: { type: 'string' }, description: 'Required skills the candidate has' },
                  matched_preferred_skills: { type: 'array', items: { type: 'string' }, description: 'Preferred skills the candidate has' },
                  missing_skills: { type: 'array', items: { type: 'string' }, description: 'Required skills the candidate lacks' },
                  strengths: { type: 'array', items: { type: 'string' }, description: 'Key strengths for this role' },
                  gaps: { type: 'array', items: { type: 'string' }, description: 'Areas where candidate falls short' },
                  recommendation: { type: 'string', enum: ['strong_match', 'good_match', 'partial_match', 'weak_match'], description: 'Overall recommendation' }
                },
                required: ['match_score', 'skills_match', 'experience_match', 'education_match', 'recommendation']
              }
            }
          }],
          tool_choice: { type: 'function', function: { name: 'evaluate_match' } }
        }),
      });

      if (!response.ok) {
        console.error(`AI matching failed for ${candidateName}: ${response.status}`);
        continue;
      }

      const aiResult = await response.json();
      const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
      
      if (!toolCall) {
        console.error(`No tool call result for ${candidateName}`);
        continue;
      }

      const matchData = JSON.parse(toolCall.function.arguments);

      // Check if candidate exceeds threshold for notification
      if (matchData.match_score >= threshold && candidateEmail) {
        highScoreCandidates.push({
          name: candidateName,
          email: candidateEmail,
          score: matchData.match_score,
          jobRole: jobReq.job_role
        });
      }

      // Upsert match result
      const { error: upsertError } = await supabase
        .from('candidate_job_matches')
        .upsert({
          application_id: app.id,
          job_requirement_id: jobRequirementId,
          match_score: matchData.match_score,
          skills_match: matchData.skills_match,
          experience_match: matchData.experience_match,
          education_match: matchData.education_match,
          match_details: {
            matched_required_skills: matchData.matched_required_skills || [],
            matched_preferred_skills: matchData.matched_preferred_skills || [],
            missing_skills: matchData.missing_skills || [],
            strengths: matchData.strengths || [],
            gaps: matchData.gaps || [],
            recommendation: matchData.recommendation
          }
        }, {
          onConflict: 'application_id,job_requirement_id'
        });

      if (upsertError) {
        console.error(`Failed to save match for ${candidateName}: ${upsertError.message}`);
        continue;
      }

      matches.push({
        applicationId: app.id,
        candidateName,
        ...matchData
      });

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Send email notifications for high-scoring candidates
    let candidateNotificationsSent = 0;
    let recruiterNotificationsSent = 0;

    if (resend && highScoreCandidates.length > 0) {
      // Send to candidates using custom template if available
      for (const candidate of highScoreCandidates) {
        const variables = {
          candidate_name: candidate.name,
          job_role: candidate.jobRole,
          match_score: String(candidate.score),
          score_message: candidate.score >= 90 ? 'Outstanding Match!' : 'Strong Match!',
          threshold: String(threshold)
        };

        const subject = candidateTemplate 
          ? applyTemplate(candidateTemplate.subject_template, variables)
          : `Great News! You're a Strong Match for ${candidate.jobRole}`;
        
        const html = candidateTemplate
          ? applyTemplate(candidateTemplate.html_template, variables)
          : getDefaultCandidateHtml(candidate);

        try {
          await resend.emails.send({
            from: "Escoger Recruitment <onboarding@resend.dev>",
            to: [candidate.email],
            subject: subject,
            html: html,
          });
          candidateNotificationsSent++;
          console.log(`Candidate notification sent to ${candidate.email} (score: ${candidate.score})`);
          
          // Log successful notification
          await logNotification(
            supabase,
            'candidate_match',
            candidate.email,
            candidate.name,
            subject,
            'sent',
            undefined,
            { match_score: candidate.score, job_role: candidate.jobRole }
          );
        } catch (emailError) {
          const errorMsg = emailError instanceof Error ? emailError.message : 'Unknown error';
          console.error(`Failed to send notification to ${candidate.email}:`, emailError);
          
          // Log failed notification
          await logNotification(
            supabase,
            'candidate_match',
            candidate.email,
            candidate.name,
            subject,
            'failed',
            errorMsg,
            { match_score: candidate.score, job_role: candidate.jobRole }
          );
        }
      }

      // Send notifications to recruiters if enabled
      if (recruiterNotificationsEnabled && recruiters.length > 0) {
        const candidatesListHtml = highScoreCandidates.map(c => `
          <div class="candidate-item">
            <div><strong>${c.name}</strong><div style="color: #666; font-size: 14px;">${c.jobRole}</div></div>
            <span class="score-badge">${c.score}%</span>
          </div>
        `).join('');

        for (const recruiter of recruiters) {
          const variables = {
            count: String(highScoreCandidates.length),
            plural: highScoreCandidates.length > 1 ? 's' : '',
            threshold: String(threshold),
            recruiter_greeting: recruiter.full_name ? ` ${recruiter.full_name}` : '',
            candidates_list: candidatesListHtml
          };

          const subject = recruiterTemplate
            ? applyTemplate(recruiterTemplate.subject_template, variables)
            : `🎯 ${highScoreCandidates.length} High-Scoring Candidate${highScoreCandidates.length > 1 ? 's' : ''} Found!`;
          
          const html = recruiterTemplate
            ? applyTemplate(recruiterTemplate.html_template, variables)
            : getDefaultRecruiterHtml(highScoreCandidates, recruiter, threshold);

          try {
            await resend.emails.send({
              from: "Escoger Recruitment <onboarding@resend.dev>",
              to: [recruiter.email],
              subject: subject,
              html: html,
            });
            recruiterNotificationsSent++;
            console.log(`Recruiter notification sent to ${recruiter.email}`);
            
            // Log successful notification
            await logNotification(
              supabase,
              'recruiter_alert',
              recruiter.email,
              recruiter.full_name,
              subject,
              'sent',
              undefined,
              { candidates_count: highScoreCandidates.length, threshold }
            );
          } catch (emailError) {
            const errorMsg = emailError instanceof Error ? emailError.message : 'Unknown error';
            console.error(`Failed to send recruiter notification to ${recruiter.email}:`, emailError);
            
            // Log failed notification
            await logNotification(
              supabase,
              'recruiter_alert',
              recruiter.email,
              recruiter.full_name,
              subject,
              'failed',
              errorMsg,
              { candidates_count: highScoreCandidates.length, threshold }
            );
          }
        }
      }
    }

    console.log(`Matched ${matches.length} candidates to job: ${jobReq.job_role}. Sent ${candidateNotificationsSent} candidate notifications and ${recruiterNotificationsSent} recruiter notifications.`);

    return new Response(JSON.stringify({ 
      success: true, 
      matches,
      candidateNotificationsSent,
      recruiterNotificationsSent,
      highScoreCandidates: highScoreCandidates.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Match candidates error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message, success: false }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Default HTML templates (used when custom templates not available)
function getDefaultCandidateHtml(candidate: { name: string; score: number; jobRole: string }): string {
  return `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
    .score-card { background: white; border-radius: 8px; padding: 20px; margin: 15px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); text-align: center; }
    .score { font-size: 64px; font-weight: bold; color: #10b981; margin: 10px 0; }
    .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎉 Congratulations, ${candidate.name}!</h1>
      <p>You're an excellent match for the ${candidate.jobRole} position!</p>
    </div>
    <div class="content">
      <div class="score-card">
        <h2 style="color: #333; margin-bottom: 5px;">Your Match Score</h2>
        <div class="score">${candidate.score}%</div>
        <p style="color: #10b981; font-weight: 600;">${candidate.score >= 90 ? 'Outstanding Match!' : 'Strong Match!'}</p>
      </div>
      <p style="text-align: center; margin: 25px 0;">Based on our AI-powered analysis, your skills and experience align exceptionally well with this role. Our recruitment team will be in touch with you shortly to discuss the next steps.</p>
      <div class="footer">
        <p>Thank you for your interest in joining our team!</p>
        <p style="margin-top: 20px; font-size: 12px;">This is an automated notification from Escoger's AI-powered recruitment system.</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function getDefaultRecruiterHtml(
  candidates: Array<{ name: string; score: number; jobRole: string }>,
  recruiter: { email: string; full_name: string | null },
  threshold: number
): string {
  const candidateItems = candidates.map(c => `
    <div class="candidate-item">
      <div><strong>${c.name}</strong><div style="color: #666; font-size: 14px;">${c.jobRole}</div></div>
      <span class="score-badge">${c.score}%</span>
    </div>
  `).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
    .candidate-list { background: white; border-radius: 8px; padding: 20px; margin: 15px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .candidate-item { padding: 12px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; }
    .candidate-item:last-child { border-bottom: none; }
    .score-badge { background: #10b981; color: white; padding: 4px 12px; border-radius: 20px; font-weight: 600; }
    .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎯 New High-Scoring Candidates!</h1>
      <p>We found ${candidates.length} candidate${candidates.length > 1 ? 's' : ''} matching ≥${threshold}%</p>
    </div>
    <div class="content">
      <p>Hi${recruiter.full_name ? ` ${recruiter.full_name}` : ''},</p>
      <p>Great news! Our AI matching system has identified the following high-scoring candidates:</p>
      <div class="candidate-list">${candidateItems}</div>
      <p style="text-align: center; margin: 25px 0;">Log in to Escoger to review these candidates and take the next steps in the hiring process.</p>
      <div class="footer">
        <p style="margin-top: 20px; font-size: 12px;">This is an automated notification from Escoger's AI-powered recruitment system.</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}