import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

const isMockMode = () =>
  import.meta.env.VITE_MOCK_AUTH === "true" ||
  (typeof window !== "undefined" && window.localStorage.getItem("VITE_MOCK_AUTH") === "true");

export default function LLMSmoke() {
  const mock = useMemo(() => isMockMode(), []);
  const [provider] = useState<"gemini">("gemini");
  const [model, setModel] = useState("");
  const [prompt, setPrompt] = useState("Say OK");
  const [allowLive, setAllowLive] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("llm-smoke-allow-live") === "true";
  });
  const [output, setOutput] = useState<string | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("llm-smoke-allow-live", allowLive ? "true" : "false");
    }
  }, [allowLive]);

  const run = async () => {
    setLoading(true);
    setOutput(null);
    setError(null);
    setLatency(null);
    try {
      const { data, error: err } = await supabase.functions.invoke("llm-gateway", {
        body: {
          provider,
          task: "smoke",
          input: prompt,
          meta: { allowLive, model: model || undefined, source: "llm-smoke" },
        },
        headers: { "x-mock-auth": mock ? "true" : "false" },
      });
      if (err) throw new Error(err.message);
      if (!data?.ok) throw new Error(data?.message || data?.error || "Request failed");
      setOutput(data.text ?? data.output ?? "OK");
      if (typeof data.latencyMs === "number") setLatency(data.latencyMs);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container py-8" data-testid="llm-smoke-page">
      <Helmet>
        <title>LLM Smoke</title>
      </Helmet>
      <Card>
        <CardHeader>
          <CardTitle>LLM Smoke (Gemini)</CardTitle>
          <CardDescription>
            Owner-only test surface. Calls go through the llm-gateway. Demo keys stay server-side. Do not paste secrets here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
            Demo keys (if enabled) live server-side only. Live calls are opt-in; toggle to allow. Mock mode returns deterministic OK.
          </div>
          <div className="grid md:grid-cols-2 gap-4 items-center">
            <div>
              <label className="text-sm font-medium">Provider</label>
              <Input value="Gemini" readOnly />
            </div>
            <div>
              <label className="text-sm font-medium">Model (optional)</label>
              <Input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="gemini-pro"
                data-testid="llm-smoke-model"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Prompt</label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              data-testid="llm-smoke-prompt"
              placeholder="Say OK"
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium">
              <input
                type="checkbox"
                className="mr-2"
                checked={allowLive}
                onChange={(e) => setAllowLive(e.target.checked)}
                data-testid="llm-smoke-allow-live"
              />
              Allow live calls (opt-in)
            </label>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col items-start gap-3">
          <Button data-testid="llm-smoke-run" onClick={run} disabled={loading}>
            {loading ? "Running..." : "Run"}
          </Button>
          {output && (
            <div className="text-sm" data-testid="llm-smoke-output">
              <strong>Output:</strong> {output} {latency ? `(latency ${latency}ms)` : ""}
            </div>
          )}
          {error && (
            <div className="text-sm text-red-600" data-testid="llm-smoke-error">
              Error: {error}
            </div>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
