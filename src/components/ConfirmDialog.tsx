"use client";

import { AlertTriangle, X } from "lucide-react";

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  destructive = true,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-[1px] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${
                destructive
                  ? "bg-rose-100 text-rose-600"
                  : "bg-amber-100 text-amber-600"
              }`}
            >
              <AlertTriangle className="h-5 w-5" />
            </div>
            <h2
              id="confirm-dialog-title"
              className="font-semibold text-base text-slate-900"
            >
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="p-1 rounded-lg hover:bg-slate-100 text-slate-500"
            aria-label="Close confirmation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-sm text-slate-600 leading-relaxed">{message}</p>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`px-4 py-2 rounded-xl text-white text-sm font-medium disabled:opacity-50 ${
              destructive
                ? "bg-rose-600 hover:bg-rose-500"
                : "bg-indigo-600 hover:bg-indigo-500"
            }`}
          >
            {busy ? "Processing..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
