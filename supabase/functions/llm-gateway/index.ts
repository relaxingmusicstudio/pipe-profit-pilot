import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-mock-auth",
};

const PROVIDERS = ["openai", "gemini"] as const;
type Provider = (typeof PROVIDERS)[number];

type RateEntry = { count: number; windowStart: number };
const rateMap = new Map<string, RateEntry>();
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60_000;

const getEncryptionKey = async (): Promise<CryptoKey> => {
  const secret =
    Deno.env.get("INTEGRATIONS_ENCRYPTION_KEY") ||
    Deno.env.get("VAULT_ENCRYPTION_KEY") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret) throw new Error("Missing encryption secret");
  const keyMaterial = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", keyMaterial, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
};

const decrypt = async (ciphertext: string): Promise<string> => {
  const key = await getEncryptionKey();
  const combined = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return new TextDecoder().decode(plain);
};

const fetchWithAbort = async (input: string, init: RequestInit, timeoutMs: number) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(input, { ...init, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
};

const checkRateLimit = (userId: string) => {
  const now = Date.now();
  const current = rateMap.get(userId);
  if (!current || now - current.windowStart > RATE_WINDOW_MS) {
    rateMap.set(userId, { count: 1, windowStart: now });
    return false;
  }
  if (current.count >= RATE_LIMIT) return true;
  current.count += 1;
  rateMap.set(userId, current);
  return false;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const start = Date.now();

  const safeLog = (payload: Record<string, unknown>) => {
    const copy = { ...payload };
    delete (copy as any).apiKey;
    console.log("[llm-gateway]", copy);
  };

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseAnonKey) {
      return new Response(JSON.stringify({ ok: false, error: "Server misconfigured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { provider, task, input, meta } = await req.json();
    if (!PROVIDERS.includes(provider)) {
      return new Response(JSON.stringify({ ok: false, error: "Unsupported provider" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mockMode = req.headers.get("x-mock-auth") === "true" || Deno.env.get("VITE_MOCK_AUTH") === "true";
    if (mockMode) {
      safeLog({ provider, task, mock: true });
      return new Response(
        JSON.stringify({
          ok: true,
          provider,
          latencyMs: 25,
          output: `mock-${provider}-response`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
      auth: { persistSession: false },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (checkRateLimit(user.id)) {
      return new Response(JSON.stringify({ ok: false, error: "Rate limit exceeded" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: row, error } = await supabase
      .from("user_integrations")
      .select("api_key_ciphertext")
      .eq("user_id", user.id)
      .eq("provider", provider)
      .single();

    if (error || !row) {
      return new Response(JSON.stringify({ ok: false, error: "No key configured" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = await decrypt(row.api_key_ciphertext);
    const prompt = typeof input === "string" && input.trim().length > 0 ? input : "Hello";

    try {
      if (provider === "openai") {
        const resp = await fetchWithAbort(
          "https://api.openai.com/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: "gpt-3.5-turbo",
              messages: [{ role: "user", content: prompt }],
              max_tokens: 32,
            }),
          },
          8000
        );
        const latencyMs = Date.now() - start;
        if (!resp.ok) {
          const errText = await resp.text();
          safeLog({ provider, task, status: resp.status, error: "openai_error" });
          return new Response(JSON.stringify({ ok: false, error: errText.slice(0, 300) || resp.statusText }), {
            status: resp.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const data = await resp.json();
        const output = data?.choices?.[0]?.message?.content ?? "";
        safeLog({ provider, task, latencyMs });
        return new Response(
          JSON.stringify({ ok: true, provider, latencyMs, output }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (provider === "gemini") {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${encodeURIComponent(
          apiKey
        )}`;
        const resp = await fetchWithAbort(
          url,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
            }),
          },
          8000
        );
        const latencyMs = Date.now() - start;
        if (!resp.ok) {
          const errText = await resp.text();
          safeLog({ provider, task, status: resp.status, error: "gemini_error" });
          return new Response(JSON.stringify({ ok: false, error: errText.slice(0, 300) || resp.statusText }), {
            status: resp.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const data = await resp.json();
        const output =
          data?.candidates?.[0]?.content?.parts?.[0]?.text ||
          data?.candidates?.[0]?.output ||
          "";
        safeLog({ provider, task, latencyMs });
        return new Response(
          JSON.stringify({ ok: true, provider, latencyMs, output }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(JSON.stringify({ ok: false, error: "Unsupported provider" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "LLM call failed";
      safeLog({ provider, task, error: "llm_exception" });
      return new Response(JSON.stringify({ ok: false, error: message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ ok: false, error: message, latencyMs: Date.now() - start }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
