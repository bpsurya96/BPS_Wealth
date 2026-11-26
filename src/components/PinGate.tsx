"use client";

import { useState } from "react";
import { Lock, ShieldCheck } from "lucide-react";

export function PinGate({ onUnlocked }: { onUnlocked: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submitPin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", pin }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Invalid PIN");
        setPin("");
      } else {
        onUnlocked();
      }
    } catch {
      setError("Failed to verify PIN");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900/90 p-7 shadow-2xl">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="h-12 w-12 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-3">
            <Lock className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">
            BPS Wealth Tracker
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Enter your local PIN to unlock your portfolio
          </p>
        </div>

        <form onSubmit={submitPin} className="space-y-4">
          <input
            type="password"
            inputMode="numeric"
            autoFocus
            maxLength={8}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            placeholder="••••"
            className="w-full text-center text-2xl tracking-[0.6em] rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white focus:border-emerald-500 focus:outline-none"
          />

          {error && (
            <p className="text-sm text-rose-400 text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || pin.length < 4}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-4 py-2.5 text-sm font-medium text-white transition"
          >
            <ShieldCheck className="h-4 w-4" />
            {loading ? "Verifying..." : "Unlock"}
          </button>
        </form>
      </div>
    </div>
  );
}
