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

  let applicationId: string | undefined;
  
  try {
    const body = await req.json();
    applicationId = body.applicationId;
    const { resumeText, coverLetter } = body;
    
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
    const prompt = `Analyze this candidate's CV/resume for Venia recruitment. Extract EVERY detail comprehensively.

RESUME/CV:
${resumeText}

${coverLetter ? `COVER LETTER:\n${coverLetter}` : ''}

EXTRACT AND SCORE:

1. SKILLS (Score 0-100): List ALL technical skills (programming, tools, frameworks), soft skills (leadership, communication), languages, certifications. Extract minimum 10-20 skills with proficiency levels.

2. EXPERIENCE (Score 0-100): Document ALL jobs with company names, titles, durations, responsibilities, achievements, metrics/numbers. Calculate total years of experience.

3. EDUCATION (Score 0-100): All degrees, institutions, years, GPA if mentioned, certifications, online courses, bootcamps, workshops.

4. OVERALL (Score 0-100): Weighted combination considering skill depth, experience relevance, education quality.

Be exhaustive - extract EVERY piece of information from the resume.`;

    // Call Lovable AI Gateway with structured output - using flash-lite for speed
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
            content: 'You are an expert HR analyst. Provide thorough, detailed candidate assessments. Extract every skill, experience, and qualification mentioned.' 
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
                    description: 'Score 0-100 based on skill quantity, depth, and relevance'
                  },
                  experience_score: {
                    type: 'number',
                    description: 'Score 0-100 based on years, roles, achievements'
                  },
                  education_score: {
                    type: 'number',
                    description: 'Score 0-100 based on degrees, certifications, relevance'
                  },
                  overall_score: {
                    type: 'number',
                    description: 'Weighted overall score 0-100'
                  },
                  total_years_experience: {
                    type: 'number',
                    description: 'Total years of professional experience'
                  },
                  highest_education: {
                    type: 'string',
                    description: 'Highest degree obtained (e.g., PhD, Masters, Bachelors, Diploma, High School)'
                  },
                  skills: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        name: { type: 'string', description: 'Skill name' },
                        proficiency: { 
                          type: 'string',
                          enum: ['beginner', 'intermediate', 'advanced', 'expert']
                        },
                        category: {
                          type: 'string',
                          enum: ['technical', 'soft', 'language', 'tool', 'certification']
                        }
                      },
                      required: ['name', 'proficiency', 'category'],
                      additionalProperties: false
                    },
                    description: 'Extract ALL skills mentioned (aim for 10-20)'
                  },
                  work_history: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        company: { type: 'string' },
                        title: { type: 'string' },
                        duration: { type: 'string' },
                        highlights: { type: 'string' }
                      },
                      required: ['company', 'title'],
                      additionalProperties: false
                    },
                    description: 'All jobs listed on resume'
                  },
                  recommendations: {
                    type: 'string',
                    description: 'Detailed recommendations covering strengths, fit, and areas for development (4-6 sentences)'
                  },
                  summary: {
                    type: 'string',
                    description: 'Comprehensive candidate profile summary with key qualifications (5-7 sentences)'
                  },
                  experience_details: {
                    type: 'string',
                    description: 'Detailed analysis of career progression, achievements, responsibilities'
                  },
                  education_details: {
                    type: 'string',
                    description: 'All educational qualifications, certifications, courses, training programs'
                  },
                  key_achievements: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Top 3-5 notable achievements with metrics if available'
                  }
                },
                required: ['skills_score', 'experience_score', 'education_score', 'overall_score', 'skills', 'recommendations', 'summary', 'experience_details', 'education_details'],
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
      
      // Return specific status codes for rate limiting
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ 
            error: 'Rate limit exceeded. Please wait and try again.',
            success: false,
            retryable: true
          }),
          { 
            status: 429,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
      
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

    // Parse the arguments - handle potential malformed JSON
    let analysis;
    try {
      const argsString = toolCall.function.arguments.trim();
      // Try to extract just the first JSON object if multiple are concatenated
      const firstBraceIndex = argsString.indexOf('{');
      let braceCount = 0;
      let endIndex = firstBraceIndex;
      
      for (let i = firstBraceIndex; i < argsString.length; i++) {
        if (argsString[i] === '{') braceCount++;
        if (argsString[i] === '}') braceCount--;
        if (braceCount === 0) {
          endIndex = i + 1;
          break;
        }
      }
      
      const singleJsonString = argsString.substring(firstBraceIndex, endIndex);
      analysis = JSON.parse(singleJsonString);
      console.log('Parsed analysis:', JSON.stringify(analysis, null, 2));
    } catch (parseError) {
      console.error('JSON Parse Error:', parseError);
      console.error('Raw arguments:', toolCall.function.arguments);
      throw new Error('Failed to parse AI analysis response');
    }

    // Store AI analysis in database using upsert to handle duplicates
    const { error: analysisError } = await supabase
      .from('ai_analysis')
      .upsert({
        application_id: applicationId,
        skills_score: analysis.skills_score,
        experience_score: analysis.experience_score,
        education_score: analysis.education_score,
        overall_score: analysis.overall_score,
        recommendations: analysis.recommendations,
        analysis_summary: {
          summary: analysis.summary,
          experience_details: analysis.experience_details,
          education_details: analysis.education_details,
          raw_response: JSON.stringify(analysis)
        }
      }, {
        onConflict: 'application_id'
      });

    if (analysisError) {
      console.error('Error storing analysis:', analysisError);
      throw analysisError;
    }

    // Delete existing skills for this application before inserting new ones
    await supabase
      .from('skills')
      .delete()
      .eq('application_id', applicationId);

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

    // Fetch candidate details for email notification
    const { data: application } = await supabase
      .from('applications')
      .select('*, candidates(*)')
      .eq('id', applicationId)
      .single();

    // Send email notification to candidate
    if (application?.candidates) {
      try {
        console.log('Sending email notification to candidate...');
        
        const notificationResponse = await fetch(
          `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-candidate-notification`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
            },
            body: JSON.stringify({
              candidateName: application.candidates.name,
              candidateEmail: application.candidates.email,
              overallScore: analysis.overall_score,
              skillsScore: analysis.skills_score,
              experienceScore: analysis.experience_score,
              educationScore: analysis.education_score,
              recommendations: analysis.recommendations || 'Continue building your skills and experience.',
              jobRole: application.job_role
            })
          }
        );

        if (!notificationResponse.ok) {
          console.error('Failed to send email notification:', await notificationResponse.text());
        } else {
          console.log('Email notification sent successfully');
        }
      } catch (emailError) {
        console.error('Error sending email notification:', emailError);
        // Don't fail the whole function if email fails
      }
    }

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
    
    // Update application status to pending on error
    if (applicationId) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);
        
        await supabase
          .from('applications')
          .update({ status: 'pending' })
          .eq('id', applicationId);
      } catch (updateError) {
        console.error('Failed to update status on error:', updateError);
      }
    }
    
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