import { useEffect, useMemo, useState } from 'react';
import { Eye, RefreshCw, Search } from 'lucide-react';
import {
  Cancellation,
  CancellationStatus,
  RefundStatus,
} from '../../types';
import * as db from '../../services/db';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatCurrency, formatDateTime } from '../../rules/cancellationRules';
import {
  CancellationStatusBadge,
  RefundStatusBadge,
} from '../../components/StatusBadge';

interface AllCancellationsPageProps {
  onViewOrder: (orderId: string) => void;
}

export function AllCancellationsPage({ onViewOrder }: AllCancellationsPageProps) {
  const { user, dataVersion, triggerRefresh } = useAuth();
  const { showToast } = useToast();

  const [cancellations, setCancellations] = useState<Cancellation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [refundFilter, setRefundFilter] = useState('ALL');
  const [retryingId, setRetryingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const list = await db.getCancellations(user);
        if (active) setCancellations(list);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [user, dataVersion]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cancellations.filter((c) => {
      const matchStatus = statusFilter === 'ALL' || c.status === statusFilter;
      const matchRefund =
        refundFilter === 'ALL' || c.refundStatus === refundFilter;
      const matchSearch =
        !q ||
        c.id.toLowerCase().includes(q) ||
        c.orderId.toLowerCase().includes(q) ||
        c.customerName.toLowerCase().includes(q) ||
        c.reason.toLowerCase().includes(q);
      return matchStatus && matchRefund && matchSearch;
    });
  }, [cancellations, search, statusFilter, refundFilter]);

  const failedRefundCount = cancellations.filter(
    (c) =>
      c.status === CancellationStatus.APPROVED &&
      c.refundStatus === RefundStatus.REFUND_PENDING
  ).length;

  const handleRetryRefund = async (c: Cancellation) => {
    if (!user || retryingId) return;
    setRetryingId(c.id);
    try {
      const res = await db.retryRefund(c.id, user);
      triggerRefresh();
      if (res.success) {
        showToast({
          type: 'success',
          title: `Refund settled for ${c.orderId}`,
          description: `Refunded ${formatCurrency(
            c.refundAmount
          )} on attempt #${res.cancellation.refundAttempts}. Customer notified.`,
        });
      } else {
        showToast({
          type: 'warning',
          title: `Gateway retry #${res.cancellation.refundAttempts} failed`,
          description:
            res.cancellation.lastRefundError ||
            'Payment gateway failed again. Try retrying once more.',
        });
      }
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Retry error',
        description: err instanceof Error ? err.message : 'Unable to retry refund.',
      });
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <div className="space-y-5">
      {failedRefundCount > 0 && (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-amber-950">
              {failedRefundCount} Refund{failedRefundCount > 1 ? 's' : ''} Pending Gateway Retry
            </p>
            <p className="text-xs text-amber-800">
              Click “Retry Refund” on any REFUND_PENDING row to re-submit to the payment gateway.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setRefundFilter(RefundStatus.REFUND_PENDING)}
            className="rounded-lg bg-amber-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-amber-800 cursor-pointer whitespace-nowrap"
          >
            Show Pending Refunds
          </button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 md:flex-row md:items-center md:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by Cancellation ID, Order ID, customer, or reason..."
            className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by cancellation status"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
          >
            <option value="ALL">All Request Statuses</option>
            {Object.values(CancellationStatus).map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>

          <select
            value={refundFilter}
            onChange={(e) => setRefundFilter(e.target.value)}
            aria-label="Filter by refund status"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
          >
            <option value="ALL">All Refund Statuses</option>
            {Object.values(RefundStatus).map((rf) => (
              <option key={rf} value={rf}>
                {rf}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {loading ? (
          <div className="p-8 text-sm text-slate-500">Loading cancellations...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm font-semibold text-slate-900">
              No cancellation records match your filters
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="px-4 py-3">ID / Order</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Reason & Scope</th>
                  <th className="px-4 py-3">Request Status</th>
                  <th className="px-4 py-3">Refund Status</th>
                  <th className="px-4 py-3 text-right">Refund</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3.5 align-top">
                      <p className="font-mono text-xs font-bold text-[#0f2547]">
                        {c.id}
                      </p>
                      <p className="font-mono text-[11px] text-slate-500">
                        {c.orderId}
                      </p>
                    </td>
                    <td className="px-4 py-3.5 align-top">
                      <p className="text-xs font-semibold text-slate-900">
                        {c.customerName}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {formatDateTime(c.createdAt)}
                      </p>
                    </td>
                    <td className="px-4 py-3.5 align-top max-w-xs">
                      <p className="text-xs font-medium text-slate-900">
                        {c.reason}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {c.isPartial ? 'Partial' : 'Full'} · {c.items.length} item(s)
                      </p>
                      {c.lastRefundError &&
                        c.refundStatus === RefundStatus.REFUND_PENDING && (
                          <p className="mt-1 text-[11px] text-red-600">
                            {c.lastRefundError}
                          </p>
                        )}
                    </td>
                    <td className="px-4 py-3.5 align-top">
                      <CancellationStatusBadge status={c.status} />
                    </td>
                    <td className="px-4 py-3.5 align-top">
                      <RefundStatusBadge status={c.refundStatus} />
                    </td>
                    <td className="px-4 py-3.5 align-top text-right font-mono text-xs font-bold text-slate-900 tabular-nums whitespace-nowrap">
                      {formatCurrency(c.refundAmount)}
                    </td>
                    <td className="px-4 py-3.5 align-top">
                      <div className="flex items-center justify-end gap-2">
                        {c.status === CancellationStatus.APPROVED &&
                          c.refundStatus === RefundStatus.REFUND_PENDING && (
                            <button
                              type="button"
                              disabled={retryingId === c.id}
                              onClick={() => handleRetryRefund(c)}
                              className="inline-flex items-center gap-1 rounded-lg bg-[#0f2547] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#17345e] cursor-pointer disabled:opacity-50 whitespace-nowrap"
                            >
                              <RefreshCw
                                className={`h-3 w-3 ${
                                  retryingId === c.id ? 'animate-spin' : ''
                                }`}
                              />
                              {retryingId === c.id ? 'Retrying...' : 'Retry Refund'}
                            </button>
                          )}
                        <button
                          type="button"
                          onClick={() => onViewOrder(c.orderId)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Order
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
