import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { applicationId, resumeText, coverLetter } = await req.json();
    
    console.log('Analyzing application:', applicationId);
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Update application status to analyzing
    await supabase
      .from('applications')
      .update({ status: 'analyzing' })
      .eq('id', applicationId);

    // Prepare AI prompt for comprehensive resume analysis
    const prompt = `Analyze the following candidate application for LSETF (Lagos State Employment Trust Fund) / PLP (Power Land Project) programs. Provide a detailed assessment covering skills, experience, education, and overall fit.

RESUME/CV:
${resumeText}

${coverLetter ? `COVER LETTER:\n${coverLetter}` : ''}

Provide scores (0-100) for skills, experience, education, and overall fit. Identify 5-8 key skills with proficiency levels. Include recommendations and a summary of the candidate's strengths and program matches.`;

    // Call Lovable AI Gateway with structured output
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: [
          { 
            role: 'system', 
            content: 'You are an expert HR analyst specializing in candidate evaluation for employment and upskilling programs. Provide detailed, objective assessments.' 
          },
          { role: 'user', content: prompt }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'analyze_candidate',
              description: 'Analyze a candidate and return structured assessment',
              parameters: {
                type: 'object',
                properties: {
                  skills_score: {
                    type: 'number',
                    description: 'Score for technical and soft skills (0-100)'
                  },
                  experience_score: {
                    type: 'number',
                    description: 'Score for work experience (0-100)'
                  },
                  education_score: {
                    type: 'number',
                    description: 'Score for educational background (0-100)'
                  },
                  overall_score: {
                    type: 'number',
                    description: 'Overall recommendation score (0-100)'
                  },
                  skills: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        proficiency: { 
                          type: 'string',
                          enum: ['beginner', 'intermediate', 'advanced', 'expert']
                        }
                      },
                      required: ['name', 'proficiency'],
                      additionalProperties: false
                    }
                  },
                  recommendations: {
                    type: 'string',
                    description: '2-3 sentences on candidate fit'
                  },
                  summary: {
                    type: 'string',
                    description: 'Brief analysis of strengths and program matches'
                  }
                },
                required: ['skills_score', 'experience_score', 'education_score', 'overall_score', 'skills', 'recommendations', 'summary'],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: 'function', function: { name: 'analyze_candidate' } }
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI Gateway error:', aiResponse.status, errorText);
      throw new Error(`AI analysis failed: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    console.log('AI Response:', JSON.stringify(aiData, null, 2));
    
    // Extract structured output from tool call
    const toolCall = aiData.choices[0].message.tool_calls?.[0];
    if (!toolCall || !toolCall.function.arguments) {
      console.error('No tool call in response');
      throw new Error('Failed to get structured analysis from AI');
    }

    const analysis = JSON.parse(toolCall.function.arguments);

    // Store AI analysis in database
    const { error: analysisError } = await supabase
      .from('ai_analysis')
      .insert({
        application_id: applicationId,
        skills_score: analysis.skills_score,
        experience_score: analysis.experience_score,
        education_score: analysis.education_score,
        overall_score: analysis.overall_score,
        recommendations: analysis.recommendations,
        analysis_summary: {
          summary: analysis.summary,
          raw_response: JSON.stringify(analysis)
        }
      });

    if (analysisError) {
      console.error('Error storing analysis:', analysisError);
      throw analysisError;
    }

    // Store identified skills
    if (analysis.skills && analysis.skills.length > 0) {
      const skillsToInsert = analysis.skills.map((skill: any) => ({
        application_id: applicationId,
        skill_name: skill.name,
        proficiency_level: skill.proficiency
      }));

      const { error: skillsError } = await supabase
        .from('skills')
        .insert(skillsToInsert);

      if (skillsError) {
        console.error('Error storing skills:', skillsError);
      }
    }

    // Update application status to analyzed
    await supabase
      .from('applications')
      .update({ status: 'analyzed' })
      .eq('id', applicationId);

    console.log('Analysis completed successfully');

    return new Response(
      JSON.stringify({ 
        success: true, 
        analysis: {
          ...analysis,
          applicationId
        }
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Error in analyze-resume function:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        success: false
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});