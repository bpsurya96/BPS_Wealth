"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Coins,
  Edit3,
  Flag,
  Link2,
  Pause,
  Play,
  Plus,
  Shield,
  Target,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AiInsightBanner } from "@/components/AiInsightBanner";
import { AiAssistantDrawer } from "@/components/AiAssistantDrawer";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  EmergencyFundData,
  EmergencyFundPanel,
} from "@/components/planning/EmergencyFundPanel";
import {
  MilestonesPanel,
  MilestonesTrackerData,
} from "@/components/planning/MilestonesPanel";
import {
  ASSET_CLASS_LABELS,
  formatCompactINR,
  formatINR,
  formatPercent,
} from "@/lib/utils";
import type {
  GoalHealth,
  GoalProjectionResult,
  GoalTemplate,
} from "@/lib/wealth-calculations";

interface GoalAllocationItem {
  id: number;
  goalId: number;
  holdingId: number;
  holdingName: string;
  assetClass: string;
  currency: string;
  allocationType: string;
  requestedInr: number;
  effectiveInr: number;
  allocationPct: number;
  holdingCurrentInr: number;
  holdingInvestedInr: number;
  holdingGainPct: number;
  holdingXirr: number | null;
  overAllocated: boolean;
  notes: string;
}

interface GoalItem {
  id: number;
  name: string;
  category: string;
  description: string;
  targetAmount: number;
  currentAmount: number;
  standaloneAmount: number;
  allocatedAmount: number;
  effectiveCurrentAmount: number;
  targetDate: string;
  priority: "high" | "medium" | "low";
  expectedAnnualReturn: number;
  inflationRate: number;
  monthlyContribution: number;
  status: "active" | "paused" | "completed" | "archived";
  notes: string;
  createdAt: string;
  projection: GoalProjectionResult;
  allocations: GoalAllocationItem[];
  contributions: Array<{
    id: number;
    date: string;
    amount: number;
    source: string;
    notes: string;
  }>;
  snapshots: Array<{
    id: number;
    snapshotDate: string;
    totalInr: number;
    allocatedInr: number;
    standaloneInr: number;
  }>;
}

interface HoldingAvailability {
  id: number;
  name: string;
  assetClass: string;
  currency: string;
  currentInr: number;
  allocatedInr: number;
  availableInr: number;
  allocatedPct: number;
  maturityDate: string;
  xirr: number | null;
}

interface GoalsResponse {
  usdInrRate: number;
  templates: GoalTemplate[];
  summary: {
    totalGoalsCount: number;
    activeGoalsCount: number;
    completedCount: number;
    onTrackCount: number;
    atRiskCount: number;
    attentionCount: number;
    totalTargetAmount: number;
    totalAllocatedAmount: number;
    totalStandaloneAmount: number;
    totalCurrentAmount: number;
    overallProgressPct: number;
    monthlyContributionRequired: number;
    monthlyContributionPlanned: number;
    overAllocatedHoldingCount: number;
  };
  goals: GoalItem[];
  goalsRequiringAttention: Array<{
    id: number;
    name: string;
    health: GoalHealth;
    completionPct: number;
    requiredMonthly: number;
    plannedMonthly: number;
    targetDate: string;
  }>;
  holdingsAvailability: HoldingAvailability[];
}

const HEALTH_BADGES: Record<
  GoalHealth,
  { label: string; className: string }
> = {
  completed: { label: "Completed", className: "bg-emerald-100 text-emerald-800" },
  on_track: { label: "On Track", className: "bg-emerald-100 text-emerald-800" },
  attention: { label: "Needs Attention", className: "bg-amber-100 text-amber-800" },
  at_risk: { label: "At Risk", className: "bg-rose-100 text-rose-800" },
  paused: { label: "Paused", className: "bg-slate-200 text-slate-700" },
  archived: { label: "Archived", className: "bg-slate-100 text-slate-500" },
};

function GoalsContent() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab");
  const [tab, setTab] = useState<"goals" | "emergency" | "milestones">(
    initialTab === "emergency"
      ? "emergency"
      : initialTab === "milestones"
        ? "milestones"
        : "goals"
  );

  const [goalsData, setGoalsData] = useState<GoalsResponse | null>(null);
  const [emergencyData, setEmergencyData] = useState<EmergencyFundData | null>(
    null
  );
  const [milestonesData, setMilestonesData] =
    useState<MilestonesTrackerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedGoalId, setSelectedGoalId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("active_all");
  const [aiOpen, setAiOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [toast, setToast] = useState("");

  // Modals
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState<number | null>(null);
  const [goalToDelete, setGoalToDelete] = useState<number | null>(null);

  const [goalForm, setGoalForm] = useState({
    name: "",
    category: "house",
    description: "",
    targetAmount: "",
    currentAmount: "0",
    targetDate: "",
    priority: "high" as "high" | "medium" | "low",
    expectedAnnualReturn: "10",
    inflationRate: "6",
    monthlyContribution: "0",
    notes: "",
  });

  // Allocation form
  const [allocForm, setAllocForm] = useState({
    holdingId: "",
    allocationType: "amount" as "amount" | "percentage",
    allocatedAmount: "",
    allocationPct: "",
    notes: "",
  });

  // Contribution form
  const [contribForm, setContribForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    amount: "",
    source: "manual" as "manual" | "sip" | "lump_sum",
    notes: "",
  });

  const loadAll = useCallback(async () => {
    try {
      const [gRes, pRes, mRes] = await Promise.all([
        fetch("/api/goals", { cache: "no-store" }),
        fetch("/api/planning/profile", { cache: "no-store" }),
        fetch("/api/planning/milestones", { cache: "no-store" }),
      ]);
      if (gRes.ok) {
        const gj: GoalsResponse = await gRes.json();
        setGoalsData(gj);
        setSelectedGoalId((prev) => {
          if (prev && gj.goals.some((g) => g.id === prev)) return prev;
          return gj.goals[0]?.id ?? null;
        });
      }
      if (pRes.ok) {
        const pj = await pRes.json();
        setEmergencyData(pj.emergency ?? null);
      }
      if (mRes.ok) {
        setMilestonesData(await mRes.json());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  function openNewGoalFromTemplate(tpl?: GoalTemplate) {
    setEditingGoalId(null);
    setGoalForm({
      name: tpl && tpl.key !== "custom" ? tpl.name : "",
      category: tpl ? tpl.category : "custom",
      description: tpl ? tpl.description : "",
      targetAmount: "",
      currentAmount: "0",
      targetDate: "",
      priority: tpl ? tpl.defaultPriority : "medium",
      expectedAnnualReturn: tpl ? String(tpl.defaultReturnPct) : "10",
      inflationRate: tpl ? String(tpl.defaultInflationPct) : "6",
      monthlyContribution: "0",
      notes: "",
    });
    setShowGoalModal(true);
  }

  function openEditGoal(g: GoalItem) {
    setEditingGoalId(g.id);
    setGoalForm({
      name: g.name,
      category: g.category,
      description: g.description || "",
      targetAmount: String(g.targetAmount),
      currentAmount: String(g.standaloneAmount),
      targetDate: g.targetDate || "",
      priority: g.priority || "medium",
      expectedAnnualReturn: String(g.expectedAnnualReturn ?? 10),
      inflationRate: String(g.inflationRate ?? 6),
      monthlyContribution: String(g.monthlyContribution ?? 0),
      notes: g.notes || "",
    });
    setShowGoalModal(true);
  }

  async function saveGoal(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");
    setToast("");
    const payload = {
      ...(editingGoalId ? { id: editingGoalId } : {}),
      name: goalForm.name,
      category: goalForm.category,
      description: goalForm.description,
      targetAmount: Number(goalForm.targetAmount),
      currentAmount: Number(goalForm.currentAmount || 0),
      targetDate: goalForm.targetDate,
      priority: goalForm.priority,
      expectedAnnualReturn: Number(goalForm.expectedAnnualReturn || 0),
      inflationRate: Number(goalForm.inflationRate || 0),
      monthlyContribution: Number(goalForm.monthlyContribution || 0),
      notes: goalForm.notes,
    };

    const res = await fetch("/api/goals", {
      method: editingGoalId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErrorMsg(json.error || "Failed to save goal");
      return;
    }
    setShowGoalModal(false);
    setToast(editingGoalId ? "Goal updated" : "Goal created");
    if (json.goal?.id) setSelectedGoalId(json.goal.id);
    await loadAll();
  }

  async function updateGoalStatus(
    id: number,
    status: "active" | "paused" | "completed" | "archived"
  ) {
    setErrorMsg("");
    const res = await fetch("/api/goals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setErrorMsg(err.error || "Failed to update goal status");
      return;
    }
    setToast(`Goal marked as ${status}`);
    await loadAll();
  }

  async function deleteGoal(id: number) {
    await fetch(`/api/goals?id=${id}`, { method: "DELETE" });
    setGoalToDelete(null);
    setToast("Goal removed");
    await loadAll();
  }

  async function saveAllocation(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedGoalId) return;
    setErrorMsg("");
    setToast("");

    const res = await fetch("/api/goals/allocations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        goalId: selectedGoalId,
        holdingId: Number(allocForm.holdingId),
        allocationType: allocForm.allocationType,
        allocatedAmount:
          allocForm.allocationType === "amount"
            ? Number(allocForm.allocatedAmount || 0)
            : 0,
        allocationPct:
          allocForm.allocationType === "percentage"
            ? Number(allocForm.allocationPct || 0)
            : 0,
        notes: allocForm.notes,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErrorMsg(json.error || "Failed to link investment");
      return;
    }
    setAllocForm({
      holdingId: "",
      allocationType: "amount",
      allocatedAmount: "",
      allocationPct: "",
      notes: "",
    });
    setToast("Investment allocation saved");
    await loadAll();
  }

  async function removeAllocation(allocId: number) {
    setErrorMsg("");
    await fetch(`/api/goals/allocations?id=${allocId}`, { method: "DELETE" });
    setToast("Investment unlinked from goal");
    await loadAll();
  }

  async function logContribution(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedGoalId) return;
    setErrorMsg("");
    const res = await fetch("/api/goals/contributions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        goalId: selectedGoalId,
        date: contribForm.date,
        amount: Number(contribForm.amount || 0),
        source: contribForm.source,
        applyToStandaloneSavings: true,
        notes: contribForm.notes,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErrorMsg(json.error || "Failed to log contribution");
      return;
    }
    setContribForm({
      date: new Date().toISOString().slice(0, 10),
      amount: "",
      source: "manual",
      notes: "",
    });
    setToast("Contribution recorded");
    await loadAll();
  }

  async function saveProfile(patch: Record<string, unknown>) {
    await fetch("/api/planning/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    await loadAll();
  }

  if (loading || !goalsData) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-32 bg-slate-200 rounded-3xl" />
        <div className="h-72 bg-white rounded-2xl border border-slate-200" />
      </div>
    );
  }

  const s = goalsData.summary;
  const filteredGoals = goalsData.goals.filter((g) => {
    if (statusFilter === "active_all") return g.status !== "archived";
    return g.status === statusFilter;
  });
  const selectedGoal =
    goalsData.goals.find((g) => g.id === selectedGoalId) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Goals & Financial Planning
          </h1>
          <p className="text-sm text-slate-500">
            Link real investment holdings to goals without double-counting,
            track progress, and plan your emergency reserve & net worth
            milestones.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => openNewGoalFromTemplate()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 text-sm font-semibold shadow-xs"
          >
            <Plus className="h-4 w-4" />
            New Goal
          </button>
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="inline-flex flex-wrap gap-1 rounded-2xl bg-white border border-slate-200 p-1 shadow-xs">
        <button
          type="button"
          onClick={() => setTab("goals")}
          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition ${
            tab === "goals"
              ? "bg-slate-900 text-white"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <Target className="h-3.5 w-3.5" />
          Goals & Allocations ({s.activeGoalsCount})
        </button>
        <button
          type="button"
          onClick={() => setTab("emergency")}
          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition ${
            tab === "emergency"
              ? "bg-slate-900 text-white"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <Shield className="h-3.5 w-3.5" />
          Emergency Fund Planner
        </button>
        <button
          type="button"
          onClick={() => setTab("milestones")}
          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition ${
            tab === "milestones"
              ? "bg-slate-900 text-white"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <Flag className="h-3.5 w-3.5" />
          Net Worth Milestones
        </button>
      </div>

      {toast && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-sm text-emerald-800">
          {toast}
        </div>
      )}
      {errorMsg && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-2.5 text-sm text-rose-700">
          {errorMsg}
        </div>
      )}

      <AiInsightBanner scope="goals" onAskAi={() => setAiOpen(true)} />

      {tab === "emergency" && emergencyData && (
        <EmergencyFundPanel
          emergency={emergencyData}
          onSaveProfile={saveProfile}
        />
      )}

      {tab === "milestones" && milestonesData && (
        <MilestonesPanel data={milestonesData} onReload={loadAll} />
      )}

      {tab === "goals" && (
        <>
          {/* Summary KPI Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
            <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-indigo-950 text-white p-4 shadow-sm">
              <div className="text-[11px] uppercase tracking-wider text-emerald-300 font-semibold">
                Overall Goal Progress
              </div>
              <div className="text-2xl font-bold mt-1 tabular-nums">
                {Math.round(s.overallProgressPct * 100)}%
              </div>
              <div className="text-xs text-slate-300 mt-1 tabular-nums">
                {formatCompactINR(s.totalCurrentAmount)} /{" "}
                {formatCompactINR(s.totalTargetAmount)}
              </div>
            </div>

            <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-xs">
              <div className="text-[11px] uppercase text-slate-500 font-semibold">
                Linked Portfolio Capital
              </div>
              <div className="text-xl font-bold text-indigo-700 mt-1 tabular-nums">
                {formatCompactINR(s.totalAllocatedAmount)}
              </div>
              <div className="text-xs text-slate-500 mt-0.5 tabular-nums">
                + {formatCompactINR(s.totalStandaloneAmount)} standalone savings
              </div>
            </div>

            <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-xs">
              <div className="text-[11px] uppercase text-slate-500 font-semibold">
                Goal Health Status
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs font-semibold">
                <span className="px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-800">
                  {s.onTrackCount} On Track
                </span>
                <span className="px-2 py-0.5 rounded-lg bg-rose-100 text-rose-800">
                  {s.atRiskCount} At Risk
                </span>
                <span className="px-2 py-0.5 rounded-lg bg-sky-100 text-sky-800">
                  {s.completedCount} Done
                </span>
              </div>
            </div>

            <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-xs">
              <div className="text-[11px] uppercase text-slate-500 font-semibold">
                Required Monthly Savings
              </div>
              <div className="text-xl font-bold text-slate-900 mt-1 tabular-nums">
                {formatINR(s.monthlyContributionRequired)}/mo
              </div>
              <div className="text-xs text-slate-500 mt-0.5 tabular-nums">
                Planned: {formatINR(s.monthlyContributionPlanned)}/mo
              </div>
            </div>

            <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-xs">
              <div className="text-[11px] uppercase text-slate-500 font-semibold">
                Active Goals
              </div>
              <div className="text-xl font-bold text-slate-900 mt-1 tabular-nums">
                {s.activeGoalsCount} active
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                {s.attentionCount} requiring attention
              </div>
            </div>
          </div>

          {/* Goals Requiring Attention Banner */}
          {goalsData.goalsRequiringAttention.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-bold uppercase text-amber-900">
                    Goals Requiring Attention
                  </div>
                  <div className="text-xs text-amber-800 mt-1 flex flex-wrap gap-2">
                    {goalsData.goalsRequiringAttention.map((g) => (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => setSelectedGoalId(g.id)}
                        className="underline font-medium hover:text-amber-950"
                      >
                        {g.name} (Need {formatCompactINR(g.requiredMonthly)}/mo
                        vs {formatCompactINR(g.plannedMonthly)}/mo)
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Quick Templates */}
          <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-xs">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2.5">
              Quick-Create Goal from Template
            </div>
            <div className="flex flex-wrap gap-2">
              {goalsData.templates.map((tpl) => (
                <button
                  key={tpl.key}
                  type="button"
                  onClick={() => openNewGoalFromTemplate(tpl)}
                  className="rounded-xl border border-slate-200 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition"
                >
                  + {tpl.name}
                </button>
              ))}
            </div>
          </div>

          {/* Main Workspace: Goal List + Selected Goal Detail */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Goal List */}
            <div className="lg:col-span-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-slate-900">
                  Your Financial Goals ({filteredGoals.length})
                </h2>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                >
                  <option value="active_all">Active / Paused / Done</option>
                  <option value="active">Active Only</option>
                  <option value="paused">Paused</option>
                  <option value="completed">Completed</option>
                  <option value="archived">Archived</option>
                </select>
              </div>

              {filteredGoals.length === 0 ? (
                <div className="rounded-2xl bg-white border border-slate-200 p-8 text-center text-sm text-slate-400">
                  No goals in this view. Click &quot;New Goal&quot; or pick a
                  template above to start planning.
                </div>
              ) : (
                filteredGoals.map((g) => {
                  const pct = Math.min(
                    100,
                    Math.round(g.projection.completionPct * 100)
                  );
                  const badge = HEALTH_BADGES[g.projection.health];
                  const isSelected = g.id === selectedGoalId;
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setSelectedGoalId(g.id)}
                      className={`w-full text-left rounded-2xl border p-4 transition shadow-xs ${
                        isSelected
                          ? "border-indigo-500 bg-indigo-50/40 ring-1 ring-indigo-500"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 truncate">
                            {g.name}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {g.category.toUpperCase()} • Priority:{" "}
                            {g.priority.toUpperCase()}
                            {g.targetDate ? ` • Due ${g.targetDate}` : ""}
                          </div>
                        </div>
                        <span
                          className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      </div>

                      <div className="mt-3 flex items-center justify-between text-xs tabular-nums">
                        <span className="font-semibold text-slate-800">
                          {formatCompactINR(g.effectiveCurrentAmount)}
                        </span>
                        <span className="text-slate-500">
                          of {formatCompactINR(g.targetAmount)} ({pct}%)
                        </span>
                      </div>
                      <div className="mt-1.5 w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-2 rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                        <span>
                          Linked: {g.allocations.length} holding(s) (
                          {formatCompactINR(g.allocatedAmount)})
                        </span>
                        <span className="tabular-nums">
                          Req: {formatCompactINR(g.projection.requiredMonthlyInflationAdjusted)}/mo
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Selected Goal Deep Dive */}
            <div className="lg:col-span-7 space-y-5">
              {!selectedGoal ? (
                <div className="rounded-2xl bg-white border border-slate-200 p-10 text-center text-sm text-slate-400">
                  Select a goal on the left to manage investment allocations,
                  contributions, and scenario projections.
                </div>
              ) : (
                <>
                  {/* Goal Header & Actions */}
                  <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-xs space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-xl font-bold text-slate-900">
                            {selectedGoal.name}
                          </h2>
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                              HEALTH_BADGES[selectedGoal.projection.health]
                                .className
                            }`}
                          >
                            {
                              HEALTH_BADGES[selectedGoal.projection.health]
                                .label
                            }
                          </span>
                        </div>
                        {selectedGoal.description && (
                          <p className="text-xs text-slate-500 mt-1">
                            {selectedGoal.description}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditGoal(selectedGoal)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          Edit
                        </button>
                        {selectedGoal.status === "active" ? (
                          <button
                            type="button"
                            onClick={() =>
                              updateGoalStatus(selectedGoal.id, "paused")
                            }
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            <Pause className="h-3.5 w-3.5" />
                            Pause
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              updateGoalStatus(selectedGoal.id, "active")
                            }
                            className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700"
                          >
                            <Play className="h-3.5 w-3.5" />
                            Activate
                          </button>
                        )}
                        {selectedGoal.status !== "completed" && (
                          <button
                            type="button"
                            onClick={() =>
                              updateGoalStatus(selectedGoal.id, "completed")
                            }
                            className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Complete
                          </button>
                        )}
                        {selectedGoal.status !== "archived" && (
                          <button
                            type="button"
                            onClick={() =>
                              updateGoalStatus(selectedGoal.id, "archived")
                            }
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                          >
                            <Archive className="h-3.5 w-3.5" />
                            Archive
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setGoalToDelete(selectedGoal.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Goal Metrics */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="rounded-xl bg-slate-50 p-3">
                        <div className="text-slate-500">Nominal Target</div>
                        <div className="font-bold text-slate-900 mt-0.5 tabular-nums">
                          {formatINR(selectedGoal.targetAmount)}
                        </div>
                        {selectedGoal.projection.inflationAdjustedTarget >
                          selectedGoal.targetAmount && (
                          <div className="text-[10px] text-amber-700 mt-0.5 tabular-nums">
                            Infl. adj:{" "}
                            {formatCompactINR(
                              selectedGoal.projection.inflationAdjustedTarget
                            )}
                          </div>
                        )}
                      </div>
                      <div className="rounded-xl bg-indigo-50/70 p-3">
                        <div className="text-indigo-700">Allocated + Saved</div>
                        <div className="font-bold text-indigo-950 mt-0.5 tabular-nums">
                          {formatINR(selectedGoal.effectiveCurrentAmount)}
                        </div>
                        <div className="text-[10px] text-indigo-700 mt-0.5 tabular-nums">
                          Inv {formatCompactINR(selectedGoal.allocatedAmount)} +
                          Cash {formatCompactINR(selectedGoal.standaloneAmount)}
                        </div>
                      </div>
                      <div className="rounded-xl bg-amber-50/70 p-3">
                        <div className="text-amber-800">Remaining</div>
                        <div className="font-bold text-amber-950 mt-0.5 tabular-nums">
                          {formatINR(selectedGoal.projection.remainingNominal)}
                        </div>
                        <div className="text-[10px] text-amber-800 mt-0.5">
                          {selectedGoal.projection.hasTargetDate
                            ? `${selectedGoal.projection.monthsRemaining} months left`
                            : "No target date"}
                        </div>
                      </div>
                      <div className="rounded-xl bg-emerald-50/70 p-3">
                        <div className="text-emerald-700">Required Monthly</div>
                        <div className="font-bold text-emerald-950 mt-0.5 tabular-nums">
                          {formatINR(
                            selectedGoal.projection
                              .requiredMonthlyInflationAdjusted
                          )}
                        </div>
                        <div className="text-[10px] text-emerald-700 mt-0.5 tabular-nums">
                          Planned: {formatINR(selectedGoal.monthlyContribution)}
                          /mo
                        </div>
                      </div>
                    </div>

                    {/* Actual vs Expected Progress */}
                    {selectedGoal.projection.expectedProgressPct !== null && (
                      <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-xs space-y-1.5">
                        <div className="flex items-center justify-between font-medium text-slate-700">
                          <span>Actual vs Expected Time Progress</span>
                          <span className="tabular-nums">
                            Actual{" "}
                            {Math.round(
                              selectedGoal.projection.completionPct * 100
                            )}
                            % • Expected{" "}
                            {Math.round(
                              selectedGoal.projection.expectedProgressPct * 100
                            )}
                            %
                          </span>
                        </div>
                        <div className="relative h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className="h-2 bg-indigo-600 rounded-full"
                            style={{
                              width: `${Math.min(
                                100,
                                Math.round(
                                  selectedGoal.projection.completionPct * 100
                                )
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Linked Investment Holdings */}
                  <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-xs space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-slate-900 flex items-center gap-2 text-sm">
                        <Link2 className="h-4 w-4 text-indigo-600" />
                        Linked Investment Holdings (
                        {selectedGoal.allocations.length})
                      </h3>
                      <span className="text-xs font-semibold text-indigo-700 tabular-nums">
                        Total Linked:{" "}
                        {formatINR(selectedGoal.allocatedAmount)}
                      </span>
                    </div>

                    {selectedGoal.allocations.length === 0 ? (
                      <p className="text-xs text-slate-400">
                        No holdings linked yet. Link existing Mutual Funds,
                        Stocks, PPF, FDs, or ETFs below without duplicating
                        portfolio totals.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {selectedGoal.allocations.map((a) => (
                          <div
                            key={a.id}
                            className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                          >
                            <div>
                              <div className="font-semibold text-slate-900 flex items-center gap-2">
                                {a.holdingName}
                                <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 text-[10px]">
                                  {ASSET_CLASS_LABELS[a.assetClass] ??
                                    a.assetClass}
                                </span>
                                {a.overAllocated && (
                                  <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px]">
                                    Capped to current value
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                                Holding Value:{" "}
                                {formatCompactINR(a.holdingCurrentInr)} • Gain:{" "}
                                {formatPercent(a.holdingGainPct)}
                                {a.holdingXirr !== null
                                  ? ` • XIRR: ${formatPercent(a.holdingXirr)}`
                                  : ""}
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-right tabular-nums">
                                <div className="font-bold text-indigo-700">
                                  {formatINR(a.effectiveInr)}
                                </div>
                                <div className="text-[10px] text-slate-500">
                                  {a.allocationType === "percentage"
                                    ? `${a.allocationPct}% of holding`
                                    : `${a.allocationPct}% share`}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeAllocation(a.id)}
                                className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50"
                                aria-label={`Unlink ${a.holdingName}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Allocate Holding Form */}
                    <form
                      onSubmit={saveAllocation}
                      className="pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-12 gap-2.5 text-xs items-end"
                    >
                      <div className="sm:col-span-5">
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">
                          Select Holding (Available Balance)
                        </label>
                        <select
                          required
                          value={allocForm.holdingId}
                          onChange={(e) =>
                            setAllocForm({
                              ...allocForm,
                              holdingId: e.target.value,
                            })
                          }
                          className="w-full rounded-xl border border-slate-200 px-2.5 py-2 bg-white"
                        >
                          <option value="">Choose holding...</option>
                          {goalsData.holdingsAvailability.map((h) => (
                            <option key={h.id} value={h.id}>
                              {h.name} (Avail:{" "}
                              {formatCompactINR(h.availableInr)} /{" "}
                              {formatCompactINR(h.currentInr)})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">
                          Mode
                        </label>
                        <select
                          value={allocForm.allocationType}
                          onChange={(e) =>
                            setAllocForm({
                              ...allocForm,
                              allocationType: e.target.value as
                                | "amount"
                                | "percentage",
                            })
                          }
                          className="w-full rounded-xl border border-slate-200 px-2 py-2 bg-white"
                        >
                          <option value="amount">₹ Amount</option>
                          <option value="percentage">% Share</option>
                        </select>
                      </div>
                      <div className="sm:col-span-3">
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">
                          {allocForm.allocationType === "amount"
                            ? "Allocate (INR)"
                            : "Percentage (%)"}
                        </label>
                        {allocForm.allocationType === "amount" ? (
                          <input
                            required
                            type="number"
                            min="1"
                            step="any"
                            value={allocForm.allocatedAmount}
                            onChange={(e) =>
                              setAllocForm({
                                ...allocForm,
                                allocatedAmount: e.target.value,
                              })
                            }
                            placeholder="e.g. 200000"
                            className="w-full rounded-xl border border-slate-200 px-2.5 py-2"
                          />
                        ) : (
                          <input
                            required
                            type="number"
                            min="0.1"
                            max="100"
                            step="any"
                            value={allocForm.allocationPct}
                            onChange={(e) =>
                              setAllocForm({
                                ...allocForm,
                                allocationPct: e.target.value,
                              })
                            }
                            placeholder="e.g. 50"
                            className="w-full rounded-xl border border-slate-200 px-2.5 py-2"
                          />
                        )}
                      </div>
                      <div className="sm:col-span-2">
                        <button
                          type="submit"
                          className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2"
                        >
                          Link
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* Three Scenarios Projection */}
                  <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-xs space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-slate-900 flex items-center gap-2 text-sm">
                        <TrendingUp className="h-4 w-4 text-emerald-600" />
                        Projection Scenarios (Inflation{" "}
                        {selectedGoal.inflationRate}% p.a.)
                      </h3>
                      <span className="text-[11px] text-slate-400">
                        Projections are estimates, not guaranteed returns
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      {(
                        [
                          selectedGoal.projection.scenarios.conservative,
                          selectedGoal.projection.scenarios.moderate,
                          selectedGoal.projection.scenarios.optimistic,
                        ] as const
                      ).map((sc) => (
                        <div
                          key={sc.key}
                          className={`rounded-xl border p-3.5 space-y-1.5 ${
                            sc.key === "moderate"
                              ? "border-indigo-200 bg-indigo-50/40"
                              : "border-slate-200 bg-slate-50/60"
                          }`}
                        >
                          <div className="flex items-center justify-between font-semibold text-slate-900">
                            <span>{sc.label}</span>
                            <span className="text-indigo-700">
                              {sc.annualReturnPct}% p.a.
                            </span>
                          </div>
                          <div className="text-slate-600 tabular-nums">
                            Projected at Target:{" "}
                            <strong className="text-slate-900">
                              {formatCompactINR(sc.projectedAtTarget)}
                            </strong>
                          </div>
                          <div className="text-slate-600 tabular-nums">
                            Req. Monthly:{" "}
                            <strong>{formatINR(sc.requiredMonthly)}</strong>
                          </div>
                          <div className="text-[11px] text-slate-500">
                            Est. Completion:{" "}
                            {sc.expectedCompletionDate ?? "Not reached in 50y"}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Contributions & Historical Snapshot Chart */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-xs space-y-3">
                      <h3 className="font-semibold text-slate-900 flex items-center gap-2 text-sm">
                        <Coins className="h-4 w-4 text-amber-600" />
                        Log Direct Savings Contribution
                      </h3>
                      <form
                        onSubmit={logContribution}
                        className="space-y-2.5 text-xs"
                      >
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="date"
                            required
                            value={contribForm.date}
                            onChange={(e) =>
                              setContribForm({
                                ...contribForm,
                                date: e.target.value,
                              })
                            }
                            className="rounded-xl border border-slate-200 px-2.5 py-2"
                          />
                          <input
                            type="number"
                            min="1"
                            step="any"
                            required
                            placeholder="Amount (INR)"
                            value={contribForm.amount}
                            onChange={(e) =>
                              setContribForm({
                                ...contribForm,
                                amount: e.target.value,
                              })
                            }
                            className="rounded-xl border border-slate-200 px-2.5 py-2"
                          />
                        </div>
                        <div className="flex gap-2">
                          <input
                            placeholder="Notes (optional)"
                            value={contribForm.notes}
                            onChange={(e) =>
                              setContribForm({
                                ...contribForm,
                                notes: e.target.value,
                              })
                            }
                            className="flex-1 rounded-xl border border-slate-200 px-2.5 py-2"
                          />
                          <button
                            type="submit"
                            className="rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 font-semibold"
                          >
                            Add
                          </button>
                        </div>
                      </form>

                      {selectedGoal.contributions.length > 0 && (
                        <div className="space-y-1.5 pt-2 max-h-40 overflow-y-auto">
                          {selectedGoal.contributions.map((c) => (
                            <div
                              key={c.id}
                              className="flex items-center justify-between text-xs border-b border-slate-100 pb-1"
                            >
                              <span className="text-slate-600">
                                {c.date} {c.notes ? `• ${c.notes}` : ""}
                              </span>
                              <span className="font-semibold text-emerald-700 tabular-nums">
                                +{formatINR(c.amount)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-xs space-y-3">
                      <h3 className="font-semibold text-slate-900 text-sm">
                        Goal Value History
                      </h3>
                      {selectedGoal.snapshots.length === 0 ? (
                        <p className="text-xs text-slate-400 py-8 text-center">
                          Snapshots are recorded automatically as allocations
                          and savings update.
                        </p>
                      ) : (
                        <div className="h-44">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={selectedGoal.snapshots}>
                              <CartesianGrid
                                strokeDasharray="3 3"
                                stroke="#e2e8f0"
                              />
                              <XAxis
                                dataKey="snapshotDate"
                                tick={{ fontSize: 10 }}
                              />
                              <YAxis
                                tick={{ fontSize: 10 }}
                                tickFormatter={(v) =>
                                  formatCompactINR(Number(v))
                                }
                              />
                              <Tooltip
                                formatter={(v) => formatINR(Number(v ?? 0))}
                              />
                              <Area
                                type="monotone"
                                dataKey="totalInr"
                                name="Total Value"
                                stroke="#4f46e5"
                                fill="#4f46e522"
                                strokeWidth={2}
                              />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* Create/Edit Goal Modal */}
      {showGoalModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl my-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-base text-slate-900">
                {editingGoalId ? "Edit Financial Goal" : "Create Financial Goal"}
              </h2>
              <button
                type="button"
                onClick={() => setShowGoalModal(false)}
                className="p-1 rounded-lg hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={saveGoal} className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Goal Name *
                  </label>
                  <input
                    required
                    value={goalForm.name}
                    onChange={(e) =>
                      setGoalForm({ ...goalForm, name: e.target.value })
                    }
                    placeholder="e.g. House Purchase"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Category
                  </label>
                  <select
                    value={goalForm.category}
                    onChange={(e) =>
                      setGoalForm({ ...goalForm, category: e.target.value })
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  >
                    {goalsData.templates.map((t) => (
                      <option key={t.key} value={t.category}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Description
                </label>
                <input
                  value={goalForm.description}
                  onChange={(e) =>
                    setGoalForm({ ...goalForm, description: e.target.value })
                  }
                  placeholder="Optional goal description"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Target Amount (INR) *
                  </label>
                  <input
                    required
                    type="number"
                    min="1"
                    step="any"
                    value={goalForm.targetAmount}
                    onChange={(e) =>
                      setGoalForm({ ...goalForm, targetAmount: e.target.value })
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Standalone Savings (INR)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={goalForm.currentAmount}
                    onChange={(e) =>
                      setGoalForm({
                        ...goalForm,
                        currentAmount: e.target.value,
                      })
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Target Date
                  </label>
                  <input
                    type="date"
                    value={goalForm.targetDate}
                    onChange={(e) =>
                      setGoalForm({ ...goalForm, targetDate: e.target.value })
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Priority
                  </label>
                  <select
                    value={goalForm.priority}
                    onChange={(e) =>
                      setGoalForm({
                        ...goalForm,
                        priority: e.target.value as "high" | "medium" | "low",
                      })
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  >
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Return (% p.a.)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="50"
                    step="any"
                    value={goalForm.expectedAnnualReturn}
                    onChange={(e) =>
                      setGoalForm({
                        ...goalForm,
                        expectedAnnualReturn: e.target.value,
                      })
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Inflation (% p.a.)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="30"
                    step="any"
                    value={goalForm.inflationRate}
                    onChange={(e) =>
                      setGoalForm({
                        ...goalForm,
                        inflationRate: e.target.value,
                      })
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Monthly SIP (INR)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={goalForm.monthlyContribution}
                    onChange={(e) =>
                      setGoalForm({
                        ...goalForm,
                        monthlyContribution: e.target.value,
                      })
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Notes
                </label>
                <input
                  value={goalForm.notes}
                  onChange={(e) =>
                    setGoalForm({ ...goalForm, notes: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowGoalModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold"
                >
                  {editingGoalId ? "Save Changes" : "Create Goal"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={goalToDelete !== null}
        title="Delete Goal"
        message="Remove this financial goal and its allocation links? Your underlying investments and transactions will NOT be affected."
        confirmLabel="Delete Goal"
        onConfirm={() => goalToDelete !== null && deleteGoal(goalToDelete)}
        onCancel={() => setGoalToDelete(null)}
      />

      <AiAssistantDrawer
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        context="goals"
      />
    </div>
  );
}

export default function GoalsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4 animate-pulse">
          <div className="h-32 bg-slate-200 rounded-3xl" />
        </div>
      }
    >
      <GoalsContent />
    </Suspense>
  );
}
