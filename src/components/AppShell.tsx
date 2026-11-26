"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  LayoutDashboard,
  TrendingUp,
  Wallet,
  Zap,
  Landmark,
  FileSpreadsheet,
  Settings,
  Lock,
  Menu,
  X,
  Sparkles,
  Database,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PinGate } from "./PinGate";
import { AiAssistantDrawer } from "./AiAssistantDrawer";

const NAV_ITEMS = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/investments", label: "Investments & SIPs", icon: TrendingUp },
  { href: "/income", label: "Income & Passive", icon: Wallet },
  { href: "/quick-log", label: "Quick-Log Month", icon: Zap },
  { href: "/loans", label: "Loans & Insurance", icon: Landmark },
  { href: "/import", label: "Import & Backup", icon: FileSpreadsheet },
  { href: "/sql-studio", label: "SQL Studio", icon: Database },
  { href: "/settings", label: "Settings & AI Env", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [authState, setAuthState] = useState<{
    checked: boolean;
    pinEnabled: boolean;
    unlocked: boolean;
  }>({ checked: false, pinEnabled: false, unlocked: true });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  const pageContext = pathname.startsWith("/investments")
    ? "investments"
    : pathname.startsWith("/income")
      ? "income"
      : pathname.startsWith("/loans")
        ? "loans"
        : "overview";

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/pin", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setAuthState({
          checked: true,
          pinEnabled: Boolean(data.pinEnabled),
          unlocked: Boolean(data.unlocked),
        });
        return;
      }
    } catch {
      // fallback
    }
    setAuthState({ checked: true, pinEnabled: false, unlocked: true });
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  async function lockApp() {
    await fetch("/api/auth/pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "lock" }),
    });
    setAuthState((prev) => ({ ...prev, unlocked: false }));
  }

  if (!authState.checked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f3f6fb] text-slate-500 text-sm">
        Loading BPS Wealth Tracker...
      </div>
    );
  }

  if (authState.pinEnabled && !authState.unlocked) {
    return (
      <PinGate
        onUnlocked={() => {
          setAuthState((prev) => ({ ...prev, unlocked: true }));
        }}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[#f3f6fb]">
      {/* Mobile Header */}
      <header className="lg:hidden flex items-center justify-between px-4 py-3 bg-[#0B1120] text-white border-b border-slate-800 sticky top-0 z-30">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center font-bold text-slate-950 text-xs">
            BPS
          </div>
          <span className="font-semibold text-sm">BPS Wealth</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAiOpen(true)}
            className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white"
          >
            <Sparkles className="h-3.5 w-3.5" />
            AI
          </button>
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            className="p-2 rounded-lg hover:bg-slate-800"
            aria-label="Toggle Menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </header>

      {/* Sidebar */}
      <aside
        className={cn(
          "lg:w-64 lg:shrink-0 bg-gradient-to-b from-[#090F1F] via-[#0D152B] to-[#0B1120] text-slate-200 flex flex-col border-r border-slate-800/80",
          mobileOpen
            ? "fixed inset-y-0 left-0 z-40 w-64 pt-4"
            : "hidden lg:flex"
        )}
      >
        <div className="px-5 py-5 border-b border-slate-800/80 hidden lg:flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-400 via-teal-400 to-sky-500 flex items-center justify-center font-bold text-slate-950 text-sm shadow-md">
            BPS
          </div>
          <div>
            <div className="font-semibold text-sm text-white leading-tight">
              BPS Wealth
            </div>
            <div className="text-[11px] text-emerald-400/90">
              Income, SIPs & AI Copilot
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition",
                  active
                    ? "bg-gradient-to-r from-emerald-500/20 to-cyan-500/10 text-emerald-300 border border-emerald-500/30 shadow-xs"
                    : "text-slate-300 hover:bg-white/5 hover:text-white"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-800/80 space-y-2">
          <button
            type="button"
            onClick={() => setAiOpen(true)}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 via-indigo-600 to-emerald-600 hover:opacity-95 px-3 py-2.5 text-xs font-semibold text-white shadow-md transition"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Ask BPS AI Assistant
          </button>
          {authState.pinEnabled && (
            <button
              type="button"
              onClick={lockApp}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 px-3 py-2 text-xs font-medium text-slate-200 transition"
            >
              <Lock className="h-3.5 w-3.5" />
              Lock App
            </button>
          )}
          <div className="px-2 text-[11px] text-slate-500">
            Local SQLite + Separate .env AI
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
        {children}
      </main>

      <AiAssistantDrawer
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        context={pageContext}
      />
    </div>
  );
}
