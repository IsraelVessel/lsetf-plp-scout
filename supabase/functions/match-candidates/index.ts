import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    const supabase = createClient(supabaseUrl, supabaseKey);

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

    const matches = [];

    for (const app of applications) {
      const aiAnalysis = app.ai_analysis?.[0];
      const skills = app.skills || [];
      const candidate = Array.isArray(app.candidates) ? app.candidates[0] : app.candidates;
      const candidateName = candidate?.name || 'Unknown';

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

    console.log(`Matched ${matches.length} candidates to job: ${jobReq.job_role}`);

    return new Response(JSON.stringify({ success: true, matches }), {
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
