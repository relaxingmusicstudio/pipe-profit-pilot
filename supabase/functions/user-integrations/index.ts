import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-mock-auth",
};

const PROVIDERS = ["openai", "gemini"] as const;

const getEncryptionKey = async (): Promise<CryptoKey> => {
  const secret =
    Deno.env.get("INTEGRATIONS_ENCRYPTION_KEY") ||
    Deno.env.get("VAULT_ENCRYPTION_KEY") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret) throw new Error("Missing encryption secret");
  const keyMaterial = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", keyMaterial, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
};

const encrypt = async (plaintext: string): Promise<string> => {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  const combined = new Uint8Array(iv.length + cipher.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(cipher), iv.length);
  return btoa(String.fromCharCode(...combined));
};

const decrypt = async (ciphertext: string): Promise<string> => {
  const key = await getEncryptionKey();
  const combined = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return new TextDecoder().decode(plain);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const start = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseAnonKey) {
      return new Response(JSON.stringify({ ok: false, error: "Server misconfigured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, provider, apiKey, prompt } = await req.json();
    if (!PROVIDERS.includes(provider)) {
      return new Response(JSON.stringify({ ok: false, error: "Unsupported provider" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mockMode = req.headers.get("x-mock-auth") === "true" || Deno.env.get("VITE_MOCK_AUTH") === "true";
    if (mockMode) {
      if (action === "save") {
        return new Response(JSON.stringify({ ok: true, mock: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (action === "test") {
        return new Response(
          JSON.stringify({
            ok: true,
            provider,
            latencyMs: 42,
            sampleText: "mock-response",
            mock: true,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
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

    if (action === "save") {
      if (!apiKey || typeof apiKey !== "string") {
        return new Response(JSON.stringify({ ok: false, error: "apiKey required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const encrypted = await encrypt(apiKey);
      const { error } = await supabase
        .from("user_integrations")
        .upsert(
          {
            user_id: user.id,
            provider,
            api_key_ciphertext: encrypted,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,provider" }
        );
      if (error) {
        return new Response(JSON.stringify({ ok: false, error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "test") {
      const { data: row, error } = await supabase
        .from("user_integrations")
        .select("api_key_ciphertext")
        .eq("user_id", user.id)
        .eq("provider", provider)
        .maybeSingle();

      if (error || !row) {
        return new Response(JSON.stringify({ ok: false, error: "No key saved" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      try {
        const key = await decrypt(row.api_key_ciphertext);
        return new Response(
          JSON.stringify({ ok: true, provider, latencyMs: Date.now() - start, sampleText: "encrypted-ok", keyLength: key.length }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Decrypt failed";
        return new Response(JSON.stringify({ ok: false, error: message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ ok: false, error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
