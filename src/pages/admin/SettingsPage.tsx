import { useEffect, useState } from 'react';
import { Download, RotateCcw, ShieldAlert } from 'lucide-react';
import { AppSettings } from '../../types';
import * as db from '../../services/db';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { DEFAULT_SETTINGS } from '../../rules/cancellationRules';
import { ConfirmDialog } from '../../components/ConfirmDialog';

export function SettingsPage() {
  const { user, triggerRefresh } = useAuth();
  const { showToast } = useToast();

  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const cfg = await db.getSettings();
        if (active) setSettings(cfg);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleToggle = async (key: keyof AppSettings) => {
    if (!user || savingKey) return;
    setSavingKey(key);
    try {
      const nextVal = !settings[key];
      const updated = await db.updateSettings({ [key]: nextVal }, user);
      setSettings(updated);
      triggerRefresh();
      showToast({
        type: 'success',
        title: 'Policy setting saved',
        description: 'Cancellation rules updated immediately across all roles.',
      });
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Update failed',
        description: err instanceof Error ? err.message : 'Unable to save setting.',
      });
    } finally {
      setSavingKey(null);
    }
  };

  const handleExportJson = async () => {
    if (!user) return;
    try {
      const jsonStr = await db.exportAllDataJson(user);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `cocs-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast({
        type: 'success',
        title: 'Data exported (JSON)',
        description: 'Full localStorage snapshot downloaded.',
      });
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Export failed',
        description: err instanceof Error ? err.message : 'Unable to export JSON.',
      });
    }
  };

  const handleConfirmReset = async () => {
    if (!user || resetting) return;
    setResetting(true);
    try {
      await db.resetDemoData(user);
      const cfg = await db.getSettings();
      setSettings(cfg);
      setResetOpen(false);
      triggerRefresh();
      showToast({
        type: 'success',
        title: 'Demo data restored',
        description:
          'All users, 12 products, 8 sample orders, payments, cancellations, and settings were reset to seed values.',
      });
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Reset failed',
        description: err instanceof Error ? err.message : 'Unable to reset data.',
      });
    } finally {
      setResetting(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
        Loading system settings...
      </div>
    );
  }

  const ToggleRow = ({
    settingKey,
    title,
    description,
    disabled,
  }: {
    settingKey: keyof AppSettings;
    title: string;
    description: string;
    disabled?: boolean;
  }) => {
    const checked = settings[settingKey];
    return (
      <div className="flex items-start justify-between gap-4 py-5 first:pt-0 last:pb-0">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            {description}
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={checked}
          disabled={disabled || savingKey === settingKey}
          onClick={() => handleToggle(settingKey)}
          className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
            checked ? 'bg-blue-700' : 'bg-slate-300'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              checked ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Policy Rules Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="font-display text-base font-bold text-slate-900">
          Cancellation & Refund Policy Rules
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Changes are saved directly to <code className="font-mono">cocs_settings</code> and
          enforced in real time for all customers and support agents.
        </p>

        <div className="mt-6 divide-y divide-slate-100">
          <ToggleRow
            settingKey="allowCancelPacked"
            title="Allow cancelling PACKED orders"
            description="When enabled, customers can request cancellation for orders that are packed at the warehouse. When disabled, PACKED orders behave like SHIPPED orders and hide the Cancel button."
          />

          <ToggleRow
            settingKey="packedNeedsAgentApproval"
            title="PACKED orders need agent approval"
            disabled={!settings.allowCancelPacked}
            description="When enabled, cancellation requests on PACKED orders stay PENDING until a Support Agent approves or rejects them. When disabled, PACKED cancellations are auto-approved immediately."
          />

          <ToggleRow
            settingKey="simulateRefundFailure"
            title="Refund failure simulation on/off"
            description="When ON, the mock payment gateway succeeds ~85% of the time and fails ~15% (setting REFUND_PENDING for Agent/Admin retry). Turn OFF to guarantee 100% instant refund settlement."
          />
        </div>
      </div>

      {/* Data Management Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
        <div>
          <h2 className="font-display text-base font-bold text-slate-900">
            Data Backup & Demo Environment
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Export the full browser localStorage database as JSON or reset the system
            back to its realistic initial seed state.
          </p>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">Export Data (JSON)</p>
            <p className="text-xs text-slate-500">
              Downloads all <code className="font-mono">cocs_*</code> tables in a single JSON file.
            </p>
          </div>
          <button
            type="button"
            onClick={handleExportJson}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#0f2547] px-4 py-2 text-xs font-semibold text-white hover:bg-[#17345e] cursor-pointer whitespace-nowrap"
          >
            <Download className="h-4 w-4" />
            Export data (JSON)
          </button>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
            <div>
              <p className="text-sm font-semibold text-slate-900">Reset Demo Data</p>
              <p className="text-xs text-slate-500">
                Overwrites all local changes and restores the original 5 users, 12 products,
                8 sample orders across all statuses, payments, and cancellations.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setResetOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 cursor-pointer whitespace-nowrap"
          >
            <RotateCcw className="h-4 w-4" />
            Reset demo data
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={resetOpen}
        title="Reset all data to initial demo seed?"
        description="This will erase any custom orders, products, cancellations, and user registrations created in this browser and restore the default COCS seed dataset."
        confirmLabel="Yes, Reset Demo Data"
        variant="danger"
        loading={resetting}
        onConfirm={handleConfirmReset}
        onCancel={() => setResetOpen(false)}
      />
    </div>
  );
}
