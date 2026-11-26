"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

export function AiInsightBanner({
  scope,
  onAskAi,
}: {
  scope: string;
  onAskAi?: () => void;
}) {
  const [insights, setInsights] = useState<string[]>([]);
  const [provider, setProvider] = useState("local");

  useEffect(() => {
    fetch(`/api/ai?scope=${encodeURIComponent(scope)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (json?.insights) setInsights(json.insights);
        if (json?.activeProvider) setProvider(json.activeProvider);
      })
      .catch(() => {});
  }, [scope]);

  if (insights.length === 0) return null;

  return (
    <div className="rounded-2xl border border-indigo-200/80 bg-gradient-to-r from-indigo-50/90 via-white to-emerald-50/80 p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="space-y-1">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-700 uppercase tracking-wider">
          <Sparkles className="h-3.5 w-3.5 text-violet-600" />
          AI Financial Pulse ({provider})
        </div>
        <ul className="space-y-0.5 text-xs text-slate-700">
          {insights.map((line, i) => (
            <li key={i}>• {line}</li>
          ))}
        </ul>
      </div>
      {onAskAi && (
        <button
          type="button"
          onClick={onAskAi}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:opacity-95 text-white px-3.5 py-2 text-xs font-medium shadow-xs"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Ask AI Assistant
        </button>
      )}
    </div>
  );
}
