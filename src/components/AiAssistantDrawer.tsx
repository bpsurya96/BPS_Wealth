"use client";

import { useEffect, useState } from "react";
import { Bot, ImagePlus, Send, Sparkles, X } from "lucide-react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  provider?: string;
}

const CONTEXT_PROMPTS: Record<string, string[]> = {
  overview: [
    "Plan how to reach my Emergency Fund & 3BHK goals faster",
    "Give me a complete snapshot of my Net Worth and XIRR",
    "Summarize my Main vs Passive Income ratio",
  ],
  investments: [
    "Which SIPs have the highest XIRR right now?",
    "Plan my monthly SIP rebalancing across MF, Stocks, NPS, PPF",
    "How close am I to my Emergency Fund target?",
  ],
  income: [
    "How much Passive Income did I earn vs Salary?",
    "Plan strategies to scale my passive rental income",
  ],
  loans: [
    "Review my Loan payoff status and Insurance documents",
    "Plan an optimal loan prepayment schedule",
  ],
};

export function AiAssistantDrawer({
  open,
  onClose,
  context,
}: {
  open: boolean;
  onClose: () => void;
  context: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<"chat" | "planning">("chat");
  const [extractTarget, setExtractTarget] = useState<
    "insurance" | "investment" | "income" | "loan"
  >("investment");
  const [loading, setLoading] = useState(false);
  const [providerLabel, setProviderLabel] = useState("Checking Ollama...");

  useEffect(() => {
    if (!open) return;
    fetch(`/api/ai?scope=${encodeURIComponent(context)}`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((json) => {
        if (json.ollamaReachable) {
          setProviderLabel(
            `Open-Source Ollama (${json.models?.chat || "local"})`
          );
        } else {
          setProviderLabel("Offline Copilot (Start Ollama for LLM/Vision)");
        }
      })
      .catch(() => { });
  }, [open, context]);

  async function sendPrompt(text: string) {
    const q = text.trim();
    if (!q || loading) return;
    setMessages((prev) => [...prev, { role: "user", content: q }]);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: q, context, mode }),
      });
      const json = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: json.reply || json.error || "No response",
          provider: json.provider,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Failed to reach AI endpoint." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function handleImageExtract(file: File) {
    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        content: `Extract ${extractTarget} data from image/doc: ${file.name}`,
      },
    ]);
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("targetType", extractTarget);
      const res = await fetch("/api/ai/extract", { method: "POST", body: fd });
      const json = await res.json();
      const content = json.ok
        ? `Extracted JSON:\n${JSON.stringify(json.extracted ?? json.rawText, null, 2)}`
        : `${json.rawText}${json.hint ? `\n\nHint: ${json.hint}` : ""}`;
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content,
          provider: `Vision (${json.model})`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  const chips = CONTEXT_PROMPTS[context] ?? CONTEXT_PROMPTS.overview;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-[2px]">
      <div className="w-full max-w-md bg-white h-full shadow-2xl border-l border-slate-200 flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-indigo-950 via-slate-900 to-emerald-950 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-500 to-emerald-400 flex items-center justify-center shadow-sm">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div>
              <div className="font-semibold text-sm">
                BPS Open-Source AI
              </div>
              <div className="text-[11px] text-emerald-300/90">
                {providerLabel}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Mode & Vision Extractor Bar */}
        <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="inline-flex rounded-lg bg-white border border-slate-200 p-0.5">
            <button
              type="button"
              onClick={() => setMode("chat")}
              className={`px-2.5 py-1 rounded-md font-medium ${mode === "chat"
                  ? "bg-indigo-600 text-white"
                  : "text-slate-600"
                }`}
            >
              Q&A Chat
            </button>
            <button
              type="button"
              onClick={() => setMode("planning")}
              className={`px-2.5 py-1 rounded-md font-medium ${mode === "planning"
                  ? "bg-emerald-600 text-white"
                  : "text-slate-600"
                }`}
            >
              Planning Mode
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <select
              value={extractTarget}
              onChange={(e) =>
                setExtractTarget(
                  e.target.value as "insurance" | "investment" | "income" | "loan"
                )
              }
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px]"
            >
              <option value="investment">Investment Img</option>
              <option value="insurance">Insurance Doc</option>
              <option value="income">Salary/Rent Img</option>
              <option value="loan">Loan Stmt</option>
            </select>
            <label className="inline-flex items-center gap-1 rounded-lg bg-violet-600 hover:bg-violet-500 text-white px-2.5 py-1 font-medium cursor-pointer">
              <ImagePlus className="h-3.5 w-3.5" />
              Extract
              <input
                type="file"
                accept="image/*,.txt,.csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleImageExtract(f);
                }}
              />
            </label>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/70">
          {messages.length === 0 && (
            <div className="rounded-2xl border border-indigo-100 bg-white p-4 space-y-3 shadow-xs">
              <div className="flex items-center gap-2 text-xs font-semibold text-indigo-700">
                <Bot className="h-4 w-4" />
                Local Open-Source AI ({context})
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Uses local Ollama open-source models for Q&A, Planning
                (DeepSeek-R1 / Qwen2.5), and Vision Image/Document extraction
                (Qwen2.5-VL). Nothing leaves your computer.
              </p>
              <div className="space-y-1.5 pt-1">
                {chips.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => sendPrompt(c)}
                    className="w-full text-left text-xs px-3 py-2 rounded-xl bg-indigo-50/80 hover:bg-indigo-100 text-indigo-900 font-medium transition"
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, idx) => (
            <div
              key={idx}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"
                }`}
            >
              <div
                className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap ${m.role === "user"
                    ? "bg-indigo-600 text-white rounded-br-sm"
                    : "bg-white border border-slate-200 text-slate-800 rounded-bl-sm shadow-xs"
                  }`}
              >
                {m.content}
                {m.provider && (
                  <div className="mt-1.5 text-[10px] text-slate-400">
                    via {m.provider}
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="text-xs text-slate-400 animate-pulse px-2">
              Running open-source model locally...
            </div>
          )}
        </div>

        {/* Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendPrompt(input);
          }}
          className="p-3 border-t border-slate-200 bg-white flex items-center gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              mode === "planning"
                ? "Ask AI to plan goals, SIPs, or prepayments..."
                : "Ask BPS AI about your portfolio..."
            }
            className="flex-1 rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="rounded-xl bg-gradient-to-r from-indigo-600 to-emerald-600 hover:opacity-95 disabled:opacity-50 text-white p-2.5"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
