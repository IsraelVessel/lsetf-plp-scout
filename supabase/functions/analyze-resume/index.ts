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
    const prompt = `Analyze the following candidate application for LSETF (Lagos State Employment Trust Fund) / PLP (Power Land Project) programs. Provide a detailed assessment.

RESUME/CV:
${resumeText}

${coverLetter ? `COVER LETTER:\n${coverLetter}` : ''}

Please analyze this candidate and provide:
1. Skills Score (0-100): Rate technical and soft skills relevant to employment programs
2. Experience Score (0-100): Evaluate work experience, internships, projects
3. Education Score (0-100): Assess educational background and certifications
4. Overall Score (0-100): Weighted average recommendation
5. Key Skills: List 5-8 most relevant skills with proficiency levels (beginner/intermediate/advanced/expert)
6. Recommendations: 2-3 sentences on why this candidate is a good fit or areas for improvement
7. Summary: Brief analysis of strengths and potential program matches

Format your response as JSON with this exact structure:
{
  "skills_score": number,
  "experience_score": number,
  "education_score": number,
  "overall_score": number,
  "skills": [{"name": "skill name", "proficiency": "beginner|intermediate|advanced|expert"}],
  "recommendations": "text",
  "summary": "text"
}`;

    // Call Lovable AI Gateway
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { 
            role: 'system', 
            content: 'You are an expert HR analyst specializing in candidate evaluation for employment and upskilling programs. Provide detailed, objective assessments.' 
          },
          { role: 'user', content: prompt }
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI Gateway error:', aiResponse.status, errorText);
      throw new Error(`AI analysis failed: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const analysisText = aiData.choices[0].message.content;
    
    console.log('AI Response:', analysisText);
    
    // Parse AI response
    let analysis;
    try {
      // Extract JSON from potential markdown code blocks
      const jsonMatch = analysisText.match(/```json\n?([\s\S]*?)\n?```/) || 
                        analysisText.match(/\{[\s\S]*\}/);
      const jsonText = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : analysisText;
      analysis = JSON.parse(jsonText);
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      throw new Error('Failed to parse AI analysis');
    }

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
          raw_response: analysisText
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