import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { aiImage, parseAIError } from "../_shared/ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { topic, platform, style = "professional", idea_id } = await req.json();

    if (!topic) {
      return new Response(JSON.stringify({ error: "topic is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Create image prompt
    const imagePrompt = `Create a ${style} marketing image for ${platform} about: ${topic}. 
    The image should be eye-catching, professional, and suitable for social media marketing.
    Use modern design trends, clean composition, and vibrant but professional colors.
    Do not include any text in the image.`;

    try {
      // Try to generate image - will throw if not available on free tier
      const result = await aiImage({
        prompt: imagePrompt,
        style,
        size: "1024x1024",
      });

      // Save to content table
      const { data: savedContent, error: saveError } = await supabase
        .from("content")
        .insert({
          idea_id,
          content_type: "image",
          title: `Image: ${topic.substring(0, 50)}`,
          body: result.text,
          media_url: result.text, // This would be the image URL if available
          platform,
          status: "pending"
        })
        .select()
        .single();

      if (saveError) {
        console.error("[content-image] Error saving content:", saveError);
      }

      console.log(`[content-image] Generated for: ${topic}`);

      return new Response(JSON.stringify({ 
        imageUrl: result.text,
        description: result.text,
        saved: savedContent
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });

    } catch (aiError) {
      const parsed = parseAIError(aiError);
      
      if (parsed.code === "IMAGE_NOT_AVAILABLE") {
        // Return controlled response for free tier
        console.log("[content-image] Image generation not available on free tier");
        
        return new Response(JSON.stringify({ 
          success: false,
          code: "IMAGE_NOT_AVAILABLE_ON_FREE",
          message: "Image generation requires premium tier. Please use stock images or upgrade your plan.",
          suggestion: "You can use Unsplash or Pexels for free stock images.",
          topic,
          platform
        }), {
          status: 200, // Return 200 so UI can handle gracefully
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      
      throw aiError;
    }

  } catch (error) {
    console.error("[content-image] error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
