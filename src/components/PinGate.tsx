"use client";

import { useState } from "react";
import { KeyRound, Lock, ShieldCheck } from "lucide-react";

export function PinGate({
  setupRequired = false,
  onUnlocked,
}: {
  setupRequired?: boolean;
  onUnlocked: () => void;
}) {
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submitPin(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (setupRequired) {
      if (pin !== confirmPin) {
        setError("PINs do not match");
        return;
      }
      if (!setupToken.trim()) {
        setError("Owner setup token is required");
        return;
      }
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          setupRequired
            ? { action: "setup", pin, setupToken: setupToken.trim() }
            : { action: "verify", pin }
        ),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Authentication failed");
        setPin("");
        if (setupRequired) setConfirmPin("");
      } else {
        onUnlocked();
      }
    } catch {
      setError("Failed to verify credentials");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900/90 p-7 shadow-2xl">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="h-12 w-12 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-3">
            {setupRequired ? (
              <KeyRound className="h-6 w-6" />
            ) : (
              <Lock className="h-6 w-6" />
            )}
          </div>
          <h1 className="text-xl font-semibold tracking-tight">
            {setupRequired ? "First-Run Owner Setup" : "BPS Wealth Tracker"}
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {setupRequired
              ? "Enter your host setup token (BPS_OWNER_SETUP_TOKEN or data/.owner-setup-token) and create a 4–8 digit PIN."
              : "Enter your PIN to unlock your portfolio"}
          </p>
        </div>

        <form onSubmit={submitPin} className="space-y-3.5">
          {setupRequired && (
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Owner Setup Token
              </label>
              <input
                type="password"
                required
                value={setupToken}
                onChange={(e) => setSetupToken(e.target.value)}
                placeholder="Paste setup token"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>
          )}

          <div>
            {setupRequired && (
              <label className="block text-xs text-slate-400 mb-1">
                New PIN (4–8 digits)
              </label>
            )}
            <input
              type="password"
              inputMode="numeric"
              autoFocus={!setupRequired}
              maxLength={8}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              placeholder="••••"
              aria-label="PIN"
              className="w-full text-center text-2xl tracking-[0.6em] rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {setupRequired && (
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Confirm PIN
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={8}
                value={confirmPin}
                onChange={(e) =>
                  setConfirmPin(e.target.value.replace(/\D/g, ""))
                }
                placeholder="••••"
                aria-label="Confirm PIN"
                className="w-full text-center text-2xl tracking-[0.6em] rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>
          )}

          {error && (
            <p className="text-sm text-rose-400 text-center" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || pin.length < 4}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-4 py-2.5 text-sm font-medium text-white transition"
          >
            <ShieldCheck className="h-4 w-4" />
            {loading
              ? "Verifying..."
              : setupRequired
                ? "Initialize Owner PIN"
                : "Unlock"}
          </button>
        </form>
      </div>
    </div>
  );
}
