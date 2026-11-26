"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Lock,
  Save,
  Settings,
  Sparkles,
  Terminal,
} from "lucide-react";

interface AiConfigStatus {
  configuredProvider: string;
  activeProvider: string;
  isRemoteAiEndpoint: boolean;
  ollamaBaseUrl: string;
  ollamaChatModel: string;
  ollamaPlanningModel: string;
  ollamaVisionModel: string;
  ollamaEmbedModel: string;
  ossBaseUrl: string;
  ossModel: string;
  ollamaReachable: boolean;
  installedModels: string[];
}

export default function SettingsPage() {
  const [usdInrRate, setUsdInrRate] = useState("84.5");
  const [emergencyTarget, setEmergencyTarget] = useState("600000");
  const [pinEnabled, setPinEnabled] = useState(false);
  const [isProduction, setIsProduction] = useState(false);
  const [aiConfig, setAiConfig] = useState<AiConfigStatus | null>(null);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [msg, setMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (json.usdInrRate) setUsdInrRate(String(json.usdInrRate));
        if (json.emergencyFundTarget)
          setEmergencyTarget(String(json.emergencyFundTarget));
        setPinEnabled(Boolean(json.pinEnabled));
        setIsProduction(Boolean(json.isProduction));
        if (json.aiConfig) setAiConfig(json.aiConfig);
      });
  }, []);

  async function savePreferences(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    setErrorMsg("");
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        usdInrRate: Number(usdInrRate),
        emergencyFundTarget: Number(emergencyTarget),
      }),
    });
    if (res.ok) {
      setMsg("Settings saved.");
    } else {
      const err = await res.json().catch(() => ({}));
      setErrorMsg(err.error || "Failed to save settings");
    }
  }

  async function enablePin(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    setErrorMsg("");
    const res = await fetch("/api/auth/pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "set",
        pin: newPin,
        currentPin: pinEnabled ? currentPin : undefined,
      }),
    });
    const json = await res.json();
    if (res.ok) {
      setPinEnabled(true);
      setNewPin("");
      setCurrentPin("");
      setMsg("PIN lock updated.");
    } else {
      setErrorMsg(json.error || "Could not set PIN");
    }
  }

  async function disablePin() {
    setMsg("");
    setErrorMsg("");
    const res = await fetch("/api/auth/pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "disable",
        currentPin,
      }),
    });
    const json = await res.json();
    if (res.ok) {
      setPinEnabled(false);
      setCurrentPin("");
      setMsg("PIN lock disabled.");
    } else {
      setErrorMsg(json.error || "Could not disable PIN");
    }
  }

  const isInstalled = (name: string) =>
    aiConfig?.installedModels.some(
      (m) => m === name || m.startsWith(`${name}:`)
    ) ?? false;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Settings & AI Environment
        </h1>
        <p className="text-sm text-slate-500">
          Open-source AI via Ollama or OpenAI-compatible endpoints, Argon2id PIN
          lock, and portfolio targets
        </p>
      </div>

      {msg && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-sm text-emerald-800">
          {msg}
        </div>
      )}
      {errorMsg && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-2.5 text-sm text-rose-700">
          {errorMsg}
        </div>
      )}

      {/* Open-Source AI Status */}
      <div className="rounded-2xl bg-white border border-indigo-200 p-6 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-semibold text-slate-900">
            <Sparkles className="h-4 w-4 text-violet-600" />
            AI Stack Configuration
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                aiConfig?.ollamaReachable
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-amber-100 text-amber-800"
              }`}
            >
              {aiConfig?.ollamaReachable
                ? "Ollama Online"
                : "Ollama Offline"}
            </span>
            <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-indigo-100 text-indigo-800 uppercase">
              Provider: {aiConfig?.activeProvider ?? "ollama"}
            </span>
          </div>
        </div>

        {aiConfig?.isRemoteAiEndpoint && (
          <div className="flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2 text-xs text-amber-900">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            Remote AI endpoint configured. Users will be asked for explicit
            confirmation before portfolio summaries or documents leave the host.
          </div>
        )}

        {aiConfig && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {[
                {
                  role: "Chat & Q&A",
                  model: aiConfig.ollamaChatModel,
                  desc: "Portfolio Q&A & quick summaries",
                },
                {
                  role: "Financial Planning",
                  model: aiConfig.ollamaPlanningModel,
                  desc: "Goal roadmaps, SIP & loan prepay planning",
                },
                {
                  role: "Image / Doc Extraction (Vision)",
                  model: aiConfig.ollamaVisionModel,
                  desc: "Extracts Insurance PDFs, receipts & screenshots",
                },
                {
                  role: "Embeddings",
                  model: aiConfig.ollamaEmbedModel,
                  desc: "Semantic search across docs & ledgers",
                },
              ].map((item) => {
                const ready = isInstalled(item.model);
                return (
                  <div
                    key={item.role}
                    className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-800">
                        {item.role}
                      </span>
                      {ready ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Installed
                        </span>
                      ) : (
                        <span className="text-[11px] font-medium text-amber-700">
                          Not pulled
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-indigo-700">{item.model}</div>
                    <div className="text-[11px] text-slate-500">{item.desc}</div>
                  </div>
                );
              })}
            </div>

            <div className="rounded-xl bg-slate-950 text-emerald-300 p-3.5 text-xs font-mono space-y-1">
              <div className="flex items-center gap-1.5 text-slate-400 mb-1">
                <Terminal className="h-3.5 w-3.5" />
                Pull missing open-source Ollama models:
              </div>
              {!isInstalled(aiConfig.ollamaChatModel) && (
                <div>ollama pull {aiConfig.ollamaChatModel}</div>
              )}
              {!isInstalled(aiConfig.ollamaPlanningModel) && (
                <div>ollama pull {aiConfig.ollamaPlanningModel}</div>
              )}
              {!isInstalled(aiConfig.ollamaVisionModel) && (
                <div>ollama pull {aiConfig.ollamaVisionModel}</div>
              )}
              {aiConfig.installedModels.length > 0 && (
                <div className="text-slate-400 pt-1">
                  Currently installed: {aiConfig.installedModels.join(", ")}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <form
        onSubmit={savePreferences}
        className="rounded-2xl bg-white border border-slate-200 p-6 shadow-xs space-y-4"
      >
        <div className="flex items-center gap-2 font-semibold text-slate-900">
          <Settings className="h-4 w-4 text-emerald-600" />
          Portfolio Targets & Currency
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              USD / INR Fallback Rate (₹)
            </label>
            <input
              type="number"
              step="0.01"
              min="1"
              value={usdInrRate}
              onChange={(e) => setUsdInrRate(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Emergency Fund Target (₹)
            </label>
            <input
              type="number"
              min="0"
              value={emergencyTarget}
              onChange={(e) => setEmergencyTarget(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
            />
          </div>
        </div>

        <button
          type="submit"
          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-4 py-2"
        >
          <Save className="h-4 w-4" />
          Save Preferences
        </button>
      </form>

      <div className="rounded-2xl bg-white border border-slate-200 p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold text-slate-900">
            <Lock className="h-4 w-4 text-slate-700" />
            PIN Authentication (Argon2id)
          </div>
          <span
            className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
              pinEnabled
                ? "bg-emerald-100 text-emerald-800"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            {pinEnabled ? "Enabled" : "Disabled (Dev only)"}
          </span>
        </div>

        <form onSubmit={enablePin} className="flex flex-col sm:flex-row gap-2 text-sm">
          {pinEnabled && (
            <input
              type="password"
              inputMode="numeric"
              maxLength={8}
              required
              placeholder="Current PIN"
              value={currentPin}
              onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ""))}
              className="sm:w-36 rounded-xl border border-slate-200 px-3 py-2"
            />
          )}
          <input
            type="password"
            inputMode="numeric"
            maxLength={8}
            placeholder="New 4–8 digit PIN"
            value={newPin}
            onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
            className="flex-1 rounded-xl border border-slate-200 px-3 py-2"
          />
          <button
            type="submit"
            disabled={newPin.length < 4 || (pinEnabled && currentPin.length < 4)}
            className="rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white px-4 py-2 font-medium"
          >
            {pinEnabled ? "Update PIN" : "Enable PIN"}
          </button>
          {pinEnabled && !isProduction && (
            <button
              type="button"
              disabled={currentPin.length < 4}
              onClick={disablePin}
              className="rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 disabled:opacity-50 px-4 py-2 font-medium"
            >
              Disable
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
