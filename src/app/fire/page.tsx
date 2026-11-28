"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Calculator,
  Flame,
  Info,
  Landmark,
  Save,
} from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AiInsightBanner } from "@/components/AiInsightBanner";
import { AiAssistantDrawer } from "@/components/AiAssistantDrawer";
import { formatCompactINR, formatINR, formatPercent } from "@/lib/utils";
import {
  calculateFireAnalysis,
  calculateRetirementPlan,
  FireAnalysisResult,
} from "@/lib/wealth-calculations";

interface ProfileResponse {
  profile: {
    currentAge: number | null;
    plannedRetirementAge: number;
    lifeExpectancy: number;
    monthlyExpenses: number;
    expenseInflationPct: number;
    expectedReturnPct: number;
    safeWithdrawalRatePct: number;
    otherRetirementIncome: number;
    taxDragPct: number;
    includePrimaryResidence: boolean;
  };
  corpusInfo: {
    investableCorpusInr: number;
    portfolioInr: number;
    nonPortfolioFinancialInr: number;
    excludedPhysicalInr: number;
    retirementHoldingsInr: number;
    netWorthInr: number;
    monthlyPlannedSipInr: number;
  };
  linkedRetirementGoal: {
    id: number;
    name: string;
    currentAmount: number;
    targetAmount: number;
  } | null;
}

export default function FireAndRetirementPage() {
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [tab, setTab] = useState<"fire" | "retirement">("fire");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState<
    "conservative" | "moderate" | "optimistic"
  >("moderate");

  // Editable live inputs
  const [currentAge, setCurrentAge] = useState("");
  const [plannedRetirementAge, setPlannedRetirementAge] = useState("50");
  const [lifeExpectancy, setLifeExpectancy] = useState("85");
  const [monthlyExpenses, setMonthlyExpenses] = useState("0");
  const [inflationPct, setInflationPct] = useState("6");
  const [expectedReturnPct, setExpectedReturnPct] = useState("11");
  const [swrPct, setSwrPct] = useState("3.5");
  const [otherIncome, setOtherIncome] = useState("0");
  const [taxDragPct, setTaxDragPct] = useState("10");
  const [includeResidence, setIncludeResidence] = useState(false);
  const [monthlyInvestment, setMonthlyInvestment] = useState("0");
  const [corpusOverride, setCorpusOverride] = useState("");

  // Editable scenario overrides
  const [consRet, setConsRet] = useState("8.5");
  const [consSwr, setConsSwr] = useState("3.0");
  const [optRet, setOptRet] = useState("13.0");
  const [optSwr, setOptSwr] = useState("4.0");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/planning/profile", { cache: "no-store" });
      if (res.ok) {
        const json: ProfileResponse = await res.json();
        setData(json);
        const p = json.profile;
        setCurrentAge(p.currentAge !== null ? String(p.currentAge) : "");
        setPlannedRetirementAge(String(p.plannedRetirementAge));
        setLifeExpectancy(String(p.lifeExpectancy));
        setMonthlyExpenses(String(p.monthlyExpenses));
        setInflationPct(String(p.expenseInflationPct));
        setExpectedReturnPct(String(p.expectedReturnPct));
        setSwrPct(String(p.safeWithdrawalRatePct));
        setOtherIncome(String(p.otherRetirementIncome));
        setTaxDragPct(String(p.taxDragPct));
        setIncludeResidence(Boolean(p.includePrimaryResidence));
        setMonthlyInvestment(String(json.corpusInfo.monthlyPlannedSipInr));
        setConsRet(String(Math.max(2, p.expectedReturnPct - 2.5)));
        setConsSwr(String(Math.max(2, p.safeWithdrawalRatePct - 0.5)));
        setOptRet(String(p.expectedReturnPct + 2));
        setOptSwr(String(p.safeWithdrawalRatePct + 0.5));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function saveProfileDefaults(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setToast("");
    try {
      const res = await fetch("/api/planning/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentAge: currentAge.trim() ? Number(currentAge) : null,
          plannedRetirementAge: Number(plannedRetirementAge || 50),
          lifeExpectancy: Number(lifeExpectancy || 85),
          monthlyExpenses: Number(monthlyExpenses || 0),
          expenseInflationPct: Number(inflationPct || 6),
          expectedReturnPct: Number(expectedReturnPct || 11),
          safeWithdrawalRatePct: Number(swrPct || 3.5),
          otherRetirementIncome: Number(otherIncome || 0),
          taxDragPct: Number(taxDragPct || 10),
          includePrimaryResidence: includeResidence,
        }),
      });
      if (res.ok) {
        setToast("Saved FIRE & Retirement planning assumptions");
        await load();
      }
    } finally {
      setSaving(false);
    }
  }

  const effectiveCorpus = useMemo(() => {
    if (!data) return 0;
    if (corpusOverride.trim() !== "") {
      return Math.max(0, Number(corpusOverride || 0));
    }
    return includeResidence
      ? data.corpusInfo.portfolioInr +
          data.corpusInfo.nonPortfolioFinancialInr +
          data.corpusInfo.excludedPhysicalInr
      : data.corpusInfo.portfolioInr + data.corpusInfo.nonPortfolioFinancialInr;
  }, [data, corpusOverride, includeResidence]);

  const fireResult: FireAnalysisResult | null = useMemo(() => {
    if (!data) return null;
    const base = calculateFireAnalysis({
      currentAge: currentAge.trim() ? Number(currentAge) : null,
      plannedRetirementAge: Number(plannedRetirementAge || 50),
      monthlyExpenses: Number(monthlyExpenses || 0),
      annualInflationPct: Number(inflationPct || 0),
      currentInvestableCorpus: effectiveCorpus,
      monthlyInvestment: Number(monthlyInvestment || 0),
      expectedReturnPct: Number(expectedReturnPct || 0),
      withdrawalRatePct: Number(swrPct || 3.5),
      taxDragPct: Number(taxDragPct || 0),
      otherRetirementIncomeMonthly: Number(otherIncome || 0),
    });

    // Apply user-editable Conservative & Optimistic overrides cleanly
    const consCalc = calculateFireAnalysis({
      currentAge: currentAge.trim() ? Number(currentAge) : null,
      plannedRetirementAge: Number(plannedRetirementAge || 50),
      monthlyExpenses: Number(monthlyExpenses || 0),
      annualInflationPct: Number(inflationPct || 0),
      currentInvestableCorpus: effectiveCorpus,
      monthlyInvestment: Number(monthlyInvestment || 0),
      expectedReturnPct: Number(consRet || 8.5),
      withdrawalRatePct: Number(consSwr || 3),
      taxDragPct: Number(taxDragPct || 0),
      otherRetirementIncomeMonthly: Number(otherIncome || 0),
    });
    const optCalc = calculateFireAnalysis({
      currentAge: currentAge.trim() ? Number(currentAge) : null,
      plannedRetirementAge: Number(plannedRetirementAge || 50),
      monthlyExpenses: Number(monthlyExpenses || 0),
      annualInflationPct: Number(inflationPct || 0),
      currentInvestableCorpus: effectiveCorpus,
      monthlyInvestment: Number(monthlyInvestment || 0),
      expectedReturnPct: Number(optRet || 13),
      withdrawalRatePct: Number(optSwr || 4),
      taxDragPct: Number(taxDragPct || 0),
      otherRetirementIncomeMonthly: Number(otherIncome || 0),
    });

    return {
      ...base,
      scenarios: {
        conservative: {
          ...consCalc.scenarios.moderate,
          key: "conservative",
          label: "Conservative",
        },
        moderate: base.scenarios.moderate,
        optimistic: {
          ...optCalc.scenarios.moderate,
          key: "optimistic",
          label: "Optimistic",
        },
      },
    };
  }, [
    data,
    currentAge,
    plannedRetirementAge,
    monthlyExpenses,
    inflationPct,
    effectiveCorpus,
    monthlyInvestment,
    expectedReturnPct,
    swrPct,
    taxDragPct,
    otherIncome,
    consRet,
    consSwr,
    optRet,
    optSwr,
  ]);

  const retirementResult = useMemo(() => {
    if (!data) return null;
    const baseRetCorpus = data.linkedRetirementGoal
      ? data.linkedRetirementGoal.currentAmount
      : data.corpusInfo.retirementHoldingsInr > 0
        ? data.corpusInfo.retirementHoldingsInr
        : effectiveCorpus;

    return calculateRetirementPlan({
      currentAge: currentAge.trim() ? Number(currentAge) : 30,
      retirementAge: Number(plannedRetirementAge || 60),
      lifeExpectancy: Number(lifeExpectancy || 85),
      currentRetirementCorpus: baseRetCorpus,
      monthlyRetirementInvestment: Number(monthlyInvestment || 0),
      expectedReturnPct: Number(expectedReturnPct || 11),
      inflationPct: Number(inflationPct || 6),
      expectedMonthlyExpensesToday: Number(monthlyExpenses || 0),
      otherRetirementIncomeMonthly: Number(otherIncome || 0),
      withdrawalRatePct: Number(swrPct || 3.5),
    });
  }, [
    data,
    currentAge,
    plannedRetirementAge,
    lifeExpectancy,
    monthlyInvestment,
    expectedReturnPct,
    inflationPct,
    monthlyExpenses,
    otherIncome,
    swrPct,
    effectiveCorpus,
  ]);

  if (loading || !data || !fireResult || !retirementResult) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-32 bg-slate-200 rounded-3xl" />
        <div className="h-72 bg-white rounded-2xl border border-slate-200" />
      </div>
    );
  }

  const activeScenario = fireResult.scenarios[selectedScenario];
  const expensesMissing = Number(monthlyExpenses || 0) <= 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Financial Independence (FIRE) & Retirement
          </h1>
          <p className="text-sm text-slate-500">
            Estimate when your investable corpus can sustainably fund your
            lifestyle using configurable return, inflation, tax, and withdrawal
            assumptions.
          </p>
        </div>
        <div className="inline-flex rounded-2xl bg-white border border-slate-200 p-1 shadow-xs">
          <button
            type="button"
            onClick={() => setTab("fire")}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold ${
              tab === "fire"
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <Flame className="h-3.5 w-3.5" />
            FIRE Tracker
          </button>
          <button
            type="button"
            onClick={() => setTab("retirement")}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold ${
              tab === "retirement"
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <Landmark className="h-3.5 w-3.5" />
            Retirement Planner
          </button>
        </div>
      </div>

      {toast && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-sm text-emerald-800">
          {toast}
        </div>
      )}

      {expensesMissing && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/90 p-4 flex items-center gap-3 text-xs text-amber-900">
          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
          <div>
            <strong>Enter your monthly living expenses</strong> below and save
            to compute your required FIRE corpus, retirement corpus, and
            estimated independence year.
          </div>
        </div>
      )}

      <AiInsightBanner scope="fire" onAskAi={() => setAiOpen(true)} />

      {/* Corpus Separation Notice */}
      <div className="rounded-2xl bg-gradient-to-br from-[#0F172A] via-[#1E1B4B] to-[#064E3B] text-white p-5 shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-emerald-300 font-semibold">
              Investable Corpus vs Total Net Worth
            </div>
            <div className="text-2xl font-bold mt-1 tabular-nums">
              {formatINR(effectiveCorpus)}
            </div>
            <div className="text-xs text-slate-300 mt-1 tabular-nums">
              Portfolio: {formatCompactINR(data.corpusInfo.portfolioInr)} •
              Non-portfolio financial:{" "}
              {formatCompactINR(data.corpusInfo.nonPortfolioFinancialInr)} •
              Excluded physical/residence:{" "}
              {formatCompactINR(data.corpusInfo.excludedPhysicalInr)} (Total Net
              Worth: {formatCompactINR(data.corpusInfo.netWorthInr)})
            </div>
          </div>
          <label className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3.5 py-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={includeResidence}
              onChange={(e) => setIncludeResidence(e.target.checked)}
            />
            Include physical / property assets in corpus
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Editable Inputs Panel */}
        <form
          onSubmit={saveProfileDefaults}
          className="lg:col-span-4 rounded-2xl bg-white border border-slate-200 p-5 shadow-xs space-y-3 text-xs"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm text-slate-900 flex items-center gap-1.5">
              <Calculator className="h-4 w-4 text-indigo-600" />
              Planning Assumptions
            </h2>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 font-semibold"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? "Saving..." : "Save Defaults"}
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <label className="block text-slate-600 mb-1">Current Age</label>
              <input
                type="number"
                min="18"
                max="100"
                placeholder="Optional"
                value={currentAge}
                onChange={(e) => setCurrentAge(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-2.5 py-2"
              />
            </div>
            <div>
              <label className="block text-slate-600 mb-1">Retire Age</label>
              <input
                type="number"
                min="25"
                max="100"
                value={plannedRetirementAge}
                onChange={(e) => setPlannedRetirementAge(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-2.5 py-2"
              />
            </div>
            <div>
              <label className="block text-slate-600 mb-1">Life Exp.</label>
              <input
                type="number"
                min="40"
                max="120"
                value={lifeExpectancy}
                onChange={(e) => setLifeExpectancy(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-2.5 py-2"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-slate-600 mb-1">
                Monthly Expenses (₹)
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={monthlyExpenses}
                onChange={(e) => setMonthlyExpenses(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-2.5 py-2"
              />
            </div>
            <div>
              <label className="block text-slate-600 mb-1">
                Monthly Investment (₹)
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={monthlyInvestment}
                onChange={(e) => setMonthlyInvestment(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-2.5 py-2"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-slate-600 mb-1">
                Inflation (% p.a.)
              </label>
              <input
                type="number"
                min="0"
                max="25"
                step="any"
                value={inflationPct}
                onChange={(e) => setInflationPct(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-2.5 py-2"
              />
            </div>
            <div>
              <label className="block text-slate-600 mb-1">
                Expected Return (% p.a.)
              </label>
              <input
                type="number"
                min="0"
                max="40"
                step="any"
                value={expectedReturnPct}
                onChange={(e) => setExpectedReturnPct(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-2.5 py-2"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-slate-600 mb-1">
                Withdrawal Rate (%)
              </label>
              <input
                type="number"
                min="1"
                max="15"
                step="0.1"
                value={swrPct}
                onChange={(e) => setSwrPct(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-2.5 py-2"
              />
            </div>
            <div>
              <label className="block text-slate-600 mb-1">
                Tax Drag on Withdrawals (%)
              </label>
              <input
                type="number"
                min="0"
                max="50"
                step="any"
                value={taxDragPct}
                onChange={(e) => setTaxDragPct(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-2.5 py-2"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-slate-600 mb-1">
                Other Ret. Income (₹/mo)
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={otherIncome}
                onChange={(e) => setOtherIncome(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-2.5 py-2"
              />
            </div>
            <div>
              <label className="block text-slate-600 mb-1">
                Corpus Override (₹)
              </label>
              <input
                type="number"
                min="0"
                step="any"
                placeholder="Live DB corpus"
                value={corpusOverride}
                onChange={(e) => setCorpusOverride(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-2.5 py-2"
              />
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 space-y-2">
            <div className="font-semibold text-slate-700">
              Scenario Assumptions (Editable)
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-slate-500">
                  Conservative Ret % / SWR %
                </label>
                <div className="flex gap-1 mt-0.5">
                  <input
                    type="number"
                    step="0.5"
                    value={consRet}
                    onChange={(e) => setConsRet(e.target.value)}
                    className="w-1/2 rounded-lg border border-slate-200 px-2 py-1"
                  />
                  <input
                    type="number"
                    step="0.1"
                    value={consSwr}
                    onChange={(e) => setConsSwr(e.target.value)}
                    className="w-1/2 rounded-lg border border-slate-200 px-2 py-1"
                  />
                </div>
              </div>
              <div>
                <label className="text-[11px] text-slate-500">
                  Optimistic Ret % / SWR %
                </label>
                <div className="flex gap-1 mt-0.5">
                  <input
                    type="number"
                    step="0.5"
                    value={optRet}
                    onChange={(e) => setOptRet(e.target.value)}
                    className="w-1/2 rounded-lg border border-slate-200 px-2 py-1"
                  />
                  <input
                    type="number"
                    step="0.1"
                    value={optSwr}
                    onChange={(e) => setOptSwr(e.target.value)}
                    className="w-1/2 rounded-lg border border-slate-200 px-2 py-1"
                  />
                </div>
              </div>
            </div>
          </div>
        </form>

        {/* Right Side: FIRE or Retirement Results */}
        <div className="lg:col-span-8 space-y-5">
          {tab === "fire" ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-xs">
                  <div className="text-[11px] uppercase text-slate-500 font-semibold">
                    Annual Expenses
                  </div>
                  <div className="text-lg font-bold text-slate-900 mt-1 tabular-nums">
                    {formatCompactINR(fireResult.annualExpensesToday)}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                    In {fireResult.horizonYears}y:{" "}
                    {formatCompactINR(fireResult.estimatedFutureAnnualExpenses)}
                  </div>
                </div>

                <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-xs">
                  <div className="text-[11px] uppercase text-slate-500 font-semibold">
                    Required FIRE Corpus
                  </div>
                  <div className="text-lg font-bold text-indigo-700 mt-1 tabular-nums">
                    {formatCompactINR(fireResult.requiredCorpusToday)}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                    At target ({fireResult.horizonYears}y):{" "}
                    {formatCompactINR(fireResult.requiredCorpusAtTarget)}
                  </div>
                </div>

                <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-xs">
                  <div className="text-[11px] uppercase text-slate-500 font-semibold">
                    Current FIRE Progress
                  </div>
                  <div className="text-lg font-bold text-emerald-700 mt-1 tabular-nums">
                    {formatPercent(fireResult.currentFireProgressPct)}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                    Add&apos;l req:{" "}
                    {formatCompactINR(fireResult.additionalCorpusRequired)}
                  </div>
                </div>

                <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-xs">
                  <div className="text-[11px] uppercase text-slate-500 font-semibold">
                    Estimated FIRE
                  </div>
                  <div className="text-lg font-bold text-slate-900 mt-1 tabular-nums">
                    {activeScenario.fireYear
                      ? `${activeScenario.fireYear}${
                          activeScenario.fireAge
                            ? ` (Age ${activeScenario.fireAge})`
                            : ""
                        }`
                      : "Beyond 45y"}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                    Req. SIP:{" "}
                    {formatINR(activeScenario.monthlyInvestmentRequired)}/mo
                  </div>
                </div>
              </div>

              {/* Three Scenarios Selector */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {(
                  [
                    fireResult.scenarios.conservative,
                    fireResult.scenarios.moderate,
                    fireResult.scenarios.optimistic,
                  ] as const
                ).map((sc) => (
                  <button
                    key={sc.key}
                    type="button"
                    onClick={() => setSelectedScenario(sc.key)}
                    className={`text-left rounded-2xl border p-4 transition ${
                      selectedScenario === sc.key
                        ? "border-indigo-500 bg-indigo-50/50 ring-1 ring-indigo-500"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-900">
                      <span>{sc.label}</span>
                      <span className="text-indigo-700">
                        {sc.expectedReturnPct}% ret / {sc.withdrawalRatePct}% SWR
                      </span>
                    </div>
                    <div className="text-base font-bold text-slate-900 mt-1.5 tabular-nums">
                      {sc.fireYear
                        ? `${sc.fireYear} (${sc.fireYears}y)`
                        : "45+ years"}
                      {sc.fireAge ? ` • Age ${sc.fireAge}` : ""}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1 tabular-nums">
                      Req. Monthly SIP:{" "}
                      {formatINR(sc.monthlyInvestmentRequired)}
                    </div>
                  </button>
                ))}
              </div>

              {/* Interactive Trajectory Chart */}
              <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-slate-900">
                    Projected Corpus vs Required FIRE Corpus ({activeScenario.label})
                  </h3>
                  <span className="text-xs text-slate-500">
                    Inflation & tax-adjusted trajectory
                  </span>
                </div>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={activeScenario.projectionSeries}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v) => formatCompactINR(Number(v))}
                      />
                      <Tooltip
                        formatter={(v) => formatINR(Number(v ?? 0))}
                        labelFormatter={(lbl) => `Year ${lbl}`}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="projectedCorpus"
                        name="Projected Investable Corpus"
                        stroke="#10b981"
                        strokeWidth={2.5}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="requiredCorpus"
                        name="Required FIRE Corpus"
                        stroke="#6366f1"
                        strokeWidth={2.5}
                        strokeDasharray="6 4"
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Methodology & Disclaimer */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-xs text-slate-600 space-y-1.5">
                <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                  <Info className="h-4 w-4 text-indigo-600" />
                  Assumptions & Calculation Methodology
                </div>
                <p>
                  • Required FIRE Corpus = [(Future Annual Expenses − Other
                  Retirement Income) ÷ (1 − Tax Drag)] ÷ Withdrawal Rate.
                </p>
                <p>
                  • Note: No withdrawal rate (including 4% or 3.5%) or market
                  return assumption is universally guaranteed. Sequence-of-returns
                  risk, healthcare inflation, and tax law changes can alter
                  outcomes. All inputs above are configurable estimates.
                </p>
              </div>
            </>
          ) : (
            /* Retirement Planner Tab */
            <div className="space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-xs">
                  <div className="text-[11px] uppercase text-slate-500 font-semibold">
                    Years Remaining
                  </div>
                  <div className="text-xl font-bold text-slate-900 mt-1 tabular-nums">
                    {retirementResult.yearsRemaining} yrs
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Retirement span: {retirementResult.yearsInRetirement} yrs
                  </div>
                </div>

                <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-xs">
                  <div className="text-[11px] uppercase text-slate-500 font-semibold">
                    Future Monthly Expenses
                  </div>
                  <div className="text-xl font-bold text-slate-900 mt-1 tabular-nums">
                    {formatCompactINR(retirementResult.futureMonthlyExpenses)}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                    {formatCompactINR(retirementResult.futureAnnualExpenses)}/yr
                  </div>
                </div>

                <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-xs">
                  <div className="text-[11px] uppercase text-slate-500 font-semibold">
                    Required Corpus
                  </div>
                  <div className="text-xl font-bold text-indigo-700 mt-1 tabular-nums">
                    {formatCompactINR(retirementResult.requiredRetirementCorpus)}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                    Annuity ref:{" "}
                    {formatCompactINR(
                      retirementResult.requiredCorpusAnnuityReference
                    )}
                  </div>
                </div>

                <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-xs">
                  <div className="text-[11px] uppercase text-slate-500 font-semibold">
                    Retirement Readiness
                  </div>
                  <div className="text-xl font-bold text-emerald-700 mt-1 tabular-nums">
                    {formatPercent(retirementResult.readinessPct)}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                    Projected:{" "}
                    {formatCompactINR(retirementResult.projectedCorpus)}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-xs space-y-3">
                <h3 className="font-semibold text-slate-900">
                  Retirement Funding Gap & Action Plan
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div className="rounded-xl bg-slate-50 p-3.5">
                    <div className="text-slate-500">Projected Corpus</div>
                    <div className="text-lg font-bold text-slate-900 mt-1 tabular-nums">
                      {formatINR(retirementResult.projectedCorpus)}
                    </div>
                  </div>
                  <div className="rounded-xl bg-amber-50 p-3.5">
                    <div className="text-amber-800">Corpus Shortfall</div>
                    <div className="text-lg font-bold text-amber-950 mt-1 tabular-nums">
                      {formatINR(retirementResult.corpusShortfall)}
                    </div>
                  </div>
                  <div className="rounded-xl bg-indigo-50 p-3.5">
                    <div className="text-indigo-800">
                      Monthly Investment Shortfall
                    </div>
                    <div className="text-lg font-bold text-indigo-950 mt-1 tabular-nums">
                      {formatINR(retirementResult.monthlyInvestmentShortfall)}/mo
                    </div>
                    <div className="text-[11px] text-indigo-700 mt-0.5 tabular-nums">
                      Total needed:{" "}
                      {formatINR(retirementResult.requiredMonthlyTotal)}/mo
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  {data.linkedRetirementGoal ? (
                    <div className="text-emerald-700 font-medium">
                      Linked Retirement Goal:{" "}
                      <strong>{data.linkedRetirementGoal.name}</strong> (
                      {formatCompactINR(data.linkedRetirementGoal.currentAmount)}{" "}
                      of{" "}
                      {formatCompactINR(data.linkedRetirementGoal.targetAmount)})
                    </div>
                  ) : (
                    <div className="text-slate-600">
                      No dedicated Retirement goal created yet — currently using
                      PPF/NPS holdings (
                      {formatCompactINR(data.corpusInfo.retirementHoldingsInr)}
                      ).
                    </div>
                  )}
                  <Link
                    href="/goals"
                    className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:underline"
                  >
                    Manage Retirement Goal & Allocations →
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <AiAssistantDrawer
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        context="fire"
      />
    </div>
  );
}
