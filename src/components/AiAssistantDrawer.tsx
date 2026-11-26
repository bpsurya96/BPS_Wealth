"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ImagePlus,
  Send,
  Sparkles,
  Square,
  X,
} from "lucide-react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  provider?: string;
}

type ExtractTarget =
  | "insurance"
  | "investment"
  | "income"
  | "loan"
  | "receipt"
  | "bank_statement"
  | "financial_document";

interface PendingExtraction {
  targetType: ExtractTarget;
  model: string;
  fields: Record<string, string>;
  unknownFields: string[];
}

const CONTEXT_PROMPTS: Record<string, string[]> = {
  overview: [
    "Plan how to reach my Emergency Fund & long-term goals faster",
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
  const [extractTarget, setExtractTarget] = useState<ExtractTarget>("investment");
  const [loading, setLoading] = useState(false);
  const [providerLabel, setProviderLabel] = useState("Checking AI provider...");
  const [isRemote, setIsRemote] = useState(false);
  const [remoteApproved, setRemoteApproved] = useState(false);
  const [pendingExtraction, setPendingExtraction] =
    useState<PendingExtraction | null>(null);
  const [savingExtraction, setSavingExtraction] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) return;
    fetch(`/api/ai?scope=${encodeURIComponent(context)}`, {
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!json) return;
        setIsRemote(Boolean(json.isRemoteAiEndpoint));
        if (json.isRemoteAiEndpoint) {
          setProviderLabel(`Remote Endpoint (${json.activeProvider})`);
        } else if (json.ollamaReachable) {
          setProviderLabel(
            `Local Ollama (${json.models?.chat || "local"})`
          );
        } else {
          setProviderLabel("Offline Deterministic Copilot");
        }
      })
      .catch(() => {});
  }, [open, context]);

  function cancelRequest() {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
  }

  async function sendPrompt(text: string) {
    const q = text.trim();
    if (!q || loading) return;
    if (isRemote && !remoteApproved) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Remote AI endpoint warning: please check 'Allow remote AI data sharing' above before sending portfolio context externally.",
        },
      ]);
      return;
    }

    setMessages((prev) => [...prev, { role: "user", content: q }]);
    setInput("");
    setLoading(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: q,
          context,
          mode,
          allowRemoteEgress: remoteApproved,
        }),
        signal: controller.signal,
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
    } catch (err) {
      if ((err as Error)?.name === "AbortError") {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Request cancelled." },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Failed to reach AI endpoint." },
        ]);
      }
    } finally {
      abortRef.current = null;
      setLoading(false);
    }
  }

  async function handleImageExtract(file: File) {
    if (isRemote && !remoteApproved) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Remote AI endpoint warning: confirm remote AI sharing above before uploading documents for extraction.",
        },
      ]);
      return;
    }

    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        content: `Extract ${extractTarget} fields from: ${file.name}`,
      },
    ]);
    setLoading(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("targetType", extractTarget);
      fd.append("allowRemoteEgress", String(remoteApproved));
      const res = await fetch("/api/ai/extract", {
        method: "POST",
        body: fd,
        signal: controller.signal,
      });
      const json = await res.json();
      if (json.ok && json.extracted) {
        const stringFields: Record<string, string> = {};
        for (const [k, v] of Object.entries(
          json.extracted as Record<string, unknown>
        )) {
          stringFields[k] = v == null ? "" : String(v);
        }
        setPendingExtraction({
          targetType: extractTarget,
          model: json.model,
          fields: stringFields,
          unknownFields: Array.isArray(json.unknownFields)
            ? json.unknownFields
            : [],
        });
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "Extraction complete. Review and correct the draft fields below, then click Approve & Save (nothing is saved automatically).",
            provider: `Vision (${json.model})`,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `${json.rawText || json.error || "Extraction failed"}${
              json.hint ? `\n\nHint: ${json.hint}` : ""
            }`,
            provider: json.model ? `Vision (${json.model})` : undefined,
          },
        ]);
      }
    } finally {
      abortRef.current = null;
      setLoading(false);
    }
  }

  async function approveAndSaveExtraction() {
    if (!pendingExtraction) return;
    setSavingExtraction(true);
    try {
      const { targetType, fields } = pendingExtraction;
      let res: Response | null = null;
      if (targetType === "insurance") {
        res = await fetch("/api/insurance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: fields.name || "Extracted Policy",
            policyType: fields.policyType || "term",
            provider: fields.provider || "",
            premiumAmount: Number(fields.premiumAmount || 0),
            premiumFrequency: fields.premiumFrequency || "annual",
            coverAmount: fields.coverAmount || "",
            expiryDate: fields.expiryDate || "",
            notes: fields.notes || "",
          }),
        });
      } else if (targetType === "investment") {
        res = await fetch("/api/investments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: fields.name || "Extracted Investment",
            assetClass: fields.assetClass || "mutual_fund",
            investedAmount: Number(fields.amount || 0),
            currentNav: Number(fields.navOrPrice || 0),
            units: Number(fields.units || 0),
            notes: fields.remarks || "",
          }),
        });
      } else if (targetType === "income") {
        res = await fetch("/api/income", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date: fields.date || new Date().toISOString().slice(0, 10),
            source: fields.source || "Extracted Income",
            category: fields.category || "other",
            inhandAmount: Number(fields.inhandAmount || 0),
            account: fields.account || "Bank",
            notes: fields.notes || "",
          }),
        });
      } else if (targetType === "loan") {
        res = await fetch("/api/loans", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: fields.name || "Extracted Loan",
            lender: fields.lender || "",
            principalSanctioned: Number(fields.principalSanctioned || 0),
            currentBalance: Number(fields.currentBalance || 0),
            interestRate: Number(fields.interestRate || 0),
            emiAmount: Number(fields.emiAmount || 0),
            notes: fields.notes || "",
          }),
        });
      } else {
        // receipt / bank_statement / financial_document -> log as income/other or display saved note
        res = await fetch("/api/income", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date: fields.date || new Date().toISOString().slice(0, 10),
            source: fields.merchantOrInstitution || "Document Record",
            category: "other",
            inhandAmount: Number(fields.totalAmount || 0),
            notes: [fields.summary, fields.notes].filter(Boolean).join(" | "),
          }),
        });
      }

      if (res?.ok) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Saved approved ${targetType} record to database.`,
          },
        ]);
        setPendingExtraction(null);
      } else {
        const err = await res?.json().catch(() => ({}));
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Could not save: ${err?.error || "Validation error"}`,
          },
        ]);
      }
    } finally {
      setSavingExtraction(false);
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
              <div className="font-semibold text-sm">BPS AI Assistant</div>
              <div className="text-[11px] text-emerald-300/90">
                {providerLabel}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300"
            aria-label="Close AI Drawer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Remote AI Warning */}
        {isRemote && (
          <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200 text-xs text-amber-900 space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
              Remote AI Endpoint Configured
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={remoteApproved}
                onChange={(e) => setRemoteApproved(e.target.checked)}
              />
              <span>
                Allow sending anonymized portfolio summary to the remote AI endpoint
              </span>
            </label>
          </div>
        )}

        {/* Mode & Vision Extractor Bar */}
        <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="inline-flex rounded-lg bg-white border border-slate-200 p-0.5">
            <button
              type="button"
              onClick={() => setMode("chat")}
              className={`px-2.5 py-1 rounded-md font-medium ${
                mode === "chat"
                  ? "bg-indigo-600 text-white"
                  : "text-slate-600"
              }`}
            >
              Q&A Chat
            </button>
            <button
              type="button"
              onClick={() => setMode("planning")}
              className={`px-2.5 py-1 rounded-md font-medium ${
                mode === "planning"
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
                setExtractTarget(e.target.value as ExtractTarget)
              }
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px]"
              aria-label="Extraction Document Type"
            >
              <option value="investment">Investment / MF / Stock</option>
              <option value="insurance">Insurance Policy</option>
              <option value="income">Salary / Rent Slip</option>
              <option value="loan">Loan Statement</option>
              <option value="receipt">Receipt</option>
              <option value="bank_statement">Bank Statement</option>
              <option value="financial_document">Financial Document</option>
            </select>
            <label className="inline-flex items-center gap-1 rounded-lg bg-violet-600 hover:bg-violet-500 text-white px-2.5 py-1 font-medium cursor-pointer">
              <ImagePlus className="h-3.5 w-3.5" />
              Extract
              <input
                type="file"
                accept=".png,.jpg,.jpeg,.webp,.txt,.csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleImageExtract(f);
                  e.target.value = "";
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
                {isRemote ? "Remote" : "Local"} AI Assistant ({context})
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Ask questions about your portfolio or extract structured fields
                from images/CSVs. Extracted records always require your explicit
                review and approval before saving.
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
              className={`flex ${
                m.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap ${
                  m.role === "user"
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

          {/* Review & Approve Extracted Record */}
          {pendingExtraction && (
            <div className="rounded-2xl border border-violet-200 bg-white p-3.5 space-y-2.5 shadow-sm text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-violet-800 uppercase">
                  Review Extracted ({pendingExtraction.targetType})
                </span>
                <button
                  type="button"
                  onClick={() => setPendingExtraction(null)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  Discard
                </button>
              </div>
              {pendingExtraction.unknownFields.length > 0 && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-[11px] text-amber-800">
                  Unknown / missing fields:{" "}
                  {pendingExtraction.unknownFields.join(", ")}
                </div>
              )}
              <div className="space-y-1.5">
                {Object.entries(pendingExtraction.fields).map(([key, val]) => (
                  <div key={key} className="grid grid-cols-3 gap-2 items-center">
                    <label className="text-[11px] font-medium text-slate-600 truncate">
                      {key}
                    </label>
                    <input
                      value={val}
                      placeholder="unknown"
                      onChange={(e) =>
                        setPendingExtraction({
                          ...pendingExtraction,
                          fields: {
                            ...pendingExtraction.fields,
                            [key]: e.target.value,
                          },
                        })
                      }
                      className="col-span-2 rounded-lg border border-slate-200 px-2 py-1 text-xs"
                    />
                  </div>
                ))}
              </div>
              <button
                type="button"
                disabled={savingExtraction}
                onClick={approveAndSaveExtraction}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold py-2"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {savingExtraction ? "Saving..." : "Approve & Save to Database"}
              </button>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-between text-xs text-slate-500 px-2">
              <span className="animate-pulse">Processing AI request...</span>
              <button
                type="button"
                onClick={cancelRequest}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-rose-600 hover:bg-rose-50"
              >
                <Square className="h-3 w-3" />
                Stop
              </button>
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
            aria-label="Send message"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
