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
    const { applicationId } = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch application and analysis data
    const { data: application, error: appError } = await supabase
      .from('applications')
      .select(`
        *,
        candidates(*),
        ai_analysis(*),
        skills(*)
      `)
      .eq('id', applicationId)
      .single();

    if (appError || !application) {
      throw new Error('Application not found');
    }

    // Generate interview questions using AI
    const prompt = `Based on the following candidate profile, generate 5 tailored interview questions that assess their fit for the ${application.job_role} position.

Candidate: ${application.candidates.name}
Skills: ${application.skills.map((s: any) => `${s.skill_name} (${s.proficiency_level})`).join(', ')}
Experience Score: ${application.ai_analysis[0]?.experience_score || 'N/A'}
Skills Score: ${application.ai_analysis[0]?.skills_score || 'N/A'}
Education Score: ${application.ai_analysis[0]?.education_score || 'N/A'}

Generate questions that:
1. Assess technical skills and experience
2. Evaluate problem-solving abilities
3. Check cultural fit
4. Verify key qualifications
5. Explore career goals and motivation

Return ONLY a JSON array of question objects, no other text.`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'You are an expert HR interviewer. Generate interview questions in JSON format.' },
          { role: 'user', content: prompt }
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'generate_questions',
            description: 'Generate interview questions',
            parameters: {
              type: 'object',
              properties: {
                questions: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      question: { type: 'string' },
                      category: { type: 'string' },
                      difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] }
                    },
                    required: ['question', 'category', 'difficulty']
                  }
                }
              },
              required: ['questions']
            }
          }
        }],
        tool_choice: { type: 'function', function: { name: 'generate_questions' } }
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI Gateway error:', aiResponse.status, errorText);
      throw new Error('AI generation failed');
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices[0].message.tool_calls?.[0];
    const questionsData = JSON.parse(toolCall.function.arguments);

    // Store questions in database
    const { error: insertError } = await supabase
      .from('interview_questions')
      .insert({
        application_id: applicationId,
        questions: questionsData
      });

    if (insertError) throw insertError;

    return new Response(
      JSON.stringify({ success: true, questions: questionsData }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error generating interview questions:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});