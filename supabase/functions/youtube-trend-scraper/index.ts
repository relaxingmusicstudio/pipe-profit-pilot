import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TrendingVideo {
  title: string;
  channel: string;
  views: number;
  viral_score: number;
  source_url: string;
  suggested_formats: string[];
}

// Mock trending HVAC videos (in production, use YouTube API)
const mockTrendingVideos: TrendingVideo[] = [
  {
    title: "Why Your AC Runs But Doesn't Cool - Top 5 Fixes",
    channel: "HVAC School",
    views: 245000,
    viral_score: 87,
    source_url: "https://youtube.com/watch?v=mock1",
    suggested_formats: ["Tutorial", "Short", "Carousel"]
  },
  {
    title: "Heat Pump vs Gas Furnace: 2024 Complete Guide",
    channel: "Technology Connections",
    views: 890000,
    viral_score: 94,
    source_url: "https://youtube.com/watch?v=mock2",
    suggested_formats: ["Long-form", "Blog", "Infographic"]
  },
  {
    title: "HVAC Technician Day in My Life - $150K/Year",
    channel: "Skilled Trades",
    views: 156000,
    viral_score: 78,
    source_url: "https://youtube.com/watch?v=mock3",
    suggested_formats: ["Story", "Short", "Reel"]
  },
  {
    title: "Smart Thermostat Installation Mistakes Everyone Makes",
    channel: "This Old House",
    views: 420000,
    viral_score: 85,
    source_url: "https://youtube.com/watch?v=mock4",
    suggested_formats: ["Tutorial", "Checklist", "Short"]
  }
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Start automation log
  const { data: logEntry, error: logError } = await supabase
    .from('automation_logs')
    .insert({
      function_name: 'youtube-trend-scraper',
      status: 'running',
      metadata: { triggered_at: new Date().toISOString() }
    })
    .select()
    .single();

  if (logError) {
    console.error('Failed to create log entry:', logError);
  }

  console.log('YouTube Trend Scraper started');

  try {
    let itemsProcessed = 0;
    let itemsCreated = 0;
    const newIdeas: string[] = [];

    for (const video of mockTrendingVideos) {
      itemsProcessed++;

      // Check if we already have this idea
      const { data: existing } = await supabase
        .from('content_ideas')
        .select('id')
        .eq('source_url', video.source_url)
        .maybeSingle();

      if (!existing) {
        const { error: insertError } = await supabase
          .from('content_ideas')
          .insert({
            topic: video.title,
            source: 'youtube_trending',
            source_url: video.source_url,
            viral_score: video.viral_score,
            suggested_formats: video.suggested_formats,
            niche: 'HVAC',
            status: 'new',
            source_transcript: `Channel: ${video.channel}, Views: ${video.views.toLocaleString()}`
          });

        if (!insertError) {
          itemsCreated++;
          newIdeas.push(video.title);
        } else {
          console.error('Failed to insert idea:', insertError);
        }
      }
    }

    // Create work item if we found new trends
    if (itemsCreated > 0) {
      await supabase
        .from('work_queue')
        .insert({
          agent_type: 'youtube',
          title: `${itemsCreated} new trending videos discovered`,
          description: `New content opportunities: ${newIdeas.join(', ')}`,
          type: 'opportunity',
          priority: itemsCreated >= 3 ? 'high' : 'medium',
          source: 'automation',
          metadata: {
            videos_found: itemsCreated,
            topics: newIdeas,
            scraped_at: new Date().toISOString()
          }
        });

      console.log(`Created work item for ${itemsCreated} new videos`);
    }

    // Update log entry
    if (logEntry) {
      await supabase
        .from('automation_logs')
        .update({
          status: 'success',
          completed_at: new Date().toISOString(),
          items_processed: itemsProcessed,
          items_created: itemsCreated
        })
        .eq('id', logEntry.id);
    }

    console.log(`YouTube Trend Scraper completed: ${itemsProcessed} processed, ${itemsCreated} created`);

    return new Response(JSON.stringify({
      success: true,
      items_processed: itemsProcessed,
      items_created: itemsCreated,
      new_ideas: newIdeas
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    const error = err as Error;
    console.error('YouTube Trend Scraper error:', error);

    if (logEntry) {
      await supabase
        .from('automation_logs')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: error.message
        })
        .eq('id', logEntry.id);
    }

    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
