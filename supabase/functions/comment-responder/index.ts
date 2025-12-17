import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { aiChat, parseAIError } from "../_shared/ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { comment, context = "HVAC business" } = await req.json();

    const result = await aiChat({
      messages: [
        { 
          role: "system", 
          content: `You are a friendly social media manager for a ${context}. 
          Your job is to respond to comments in a professional, helpful, and engaging way.
          Keep responses concise (1-3 sentences).
          Be warm and personable.
          If it's a complaint, acknowledge and offer to help.
          If it's praise, thank them genuinely.
          If it's a question, provide a helpful answer.
          Include a soft call-to-action when appropriate (e.g., "Feel free to DM us" or "Call us anytime").` 
        },
        { 
          role: "user", 
          content: `Write a reply to this social media comment: "${comment}"` 
        }
      ],
      purpose: "social_response",
    });

    console.log(`[comment-responder] Generated reply for: ${comment.substring(0, 50)}...`);

    return new Response(JSON.stringify({ reply: result.text }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("[comment-responder] error:", parseAIError(error));
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
