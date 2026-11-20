import React, { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary';
  loading?: boolean;
  /** If provided, user must type this exact text to enable confirmation (e.g. Order ID for hard delete). */
  requiredMatchText?: string;
  requiredMatchLabel?: string;
  /** If true, renders a mandatory free-text input (e.g. mandatory rejection reason). */
  inputRequired?: boolean;
  inputLabel?: string;
  inputPlaceholder?: string;
  inputMinLength?: number;
  onConfirm: (inputValue?: string) => void | Promise<void>;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  loading = false,
  requiredMatchText,
  requiredMatchLabel,
  inputRequired = false,
  inputLabel,
  inputPlaceholder,
  inputMinLength = 5,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [matchInput, setMatchInput] = useState('');
  const [textInput, setTextInput] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setMatchInput('');
      setTextInput('');
      setError('');
    }
  }, [open]);

  if (!open) return null;

  const isMatchValid = !requiredMatchText || matchInput.trim() === requiredMatchText;
  const isTextValid = !inputRequired || textInput.trim().length >= inputMinLength;
  const canSubmit = !loading && isMatchValid && isTextValid;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (requiredMatchText && matchInput.trim() !== requiredMatchText) {
      setError(`Please type "${requiredMatchText}" exactly to continue.`);
      return;
    }
    if (inputRequired && textInput.trim().length < inputMinLength) {
      setError(`Please enter at least ${inputMinLength} characters.`);
      return;
    }
    setError('');
    await onConfirm(inputRequired ? textInput.trim() : undefined);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            {variant === 'danger' && (
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600">
                <AlertTriangle className="h-5 w-5" />
              </div>
            )}
            <div>
              <h3
                id="confirm-dialog-title"
                className="text-base font-bold text-slate-900"
              >
                {title}
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">
                {description}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            aria-label="Close dialog"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {requiredMatchText && (
            <div>
              <label className="block text-xs font-semibold text-slate-700">
                {requiredMatchLabel || `Type ${requiredMatchText} to confirm`}
              </label>
              <input
                type="text"
                value={matchInput}
                onChange={(e) => {
                  setMatchInput(e.target.value);
                  setError('');
                }}
                placeholder={requiredMatchText}
                autoFocus
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-100"
              />
            </div>
          )}

          {inputRequired && (
            <div>
              <label className="block text-xs font-semibold text-slate-700">
                {inputLabel || 'Reason (required)'}
              </label>
              <textarea
                rows={3}
                value={textInput}
                onChange={(e) => {
                  setTextInput(e.target.value);
                  setError('');
                }}
                placeholder={inputPlaceholder || 'Enter explanation...'}
                autoFocus
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
          )}

          {error && <p className="text-xs font-medium text-red-600">{error}</p>}

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
            >
              {cancelLabel}
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
                variant === 'danger'
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-[#0f2547] hover:bg-[#17345e]'
              }`}
            >
              {loading ? 'Processing...' : confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
