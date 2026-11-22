import { useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { Cancellation, Order, OrderStatus } from '../../types';
import * as db from '../../services/db';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  CANCELLATION_REASONS,
  formatCurrency,
  formatDateTime,
} from '../../rules/cancellationRules';
import {
  CancellationStatusBadge,
  OrderStatusBadge,
  RefundStatusBadge,
} from '../../components/StatusBadge';

export function ReportsPage() {
  const { user, dataVersion } = useAuth();
  const { showToast } = useToast();

  const [orders, setOrders] = useState<Order[]>([]);
  const [cancellations, setCancellations] = useState<Cancellation[]>([]);
  const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState('ALL');
  const [reasonFilter, setReasonFilter] = useState('ALL');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const [ords, cancels] = await Promise.all([
          db.getOrders(user, true),
          db.getCancellations(user),
        ]);
        if (active) {
          setOrders(ords);
          setCancellations(cancels);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [user, dataVersion]);

  const rows = useMemo(() => {
    return orders
      .map((order) => {
        const linked = cancellations.filter((c) => c.orderId === order.id);
        const latestCancel = linked[0] || null;
        return { order, latestCancel };
      })
      .filter(({ order, latestCancel }) => {
        if (statusFilter !== 'ALL' && order.status !== statusFilter) return false;
        if (reasonFilter !== 'ALL') {
          if (!latestCancel || latestCancel.reason !== reasonFilter) return false;
        }
        const orderTime = new Date(order.createdAt).getTime();
        if (fromDate) {
          const fromTs = new Date(`${fromDate}T00:00:00`).getTime();
          if (orderTime < fromTs) return false;
        }
        if (toDate) {
          const toTs = new Date(`${toDate}T23:59:59`).getTime();
          if (orderTime > toTs) return false;
        }
        return true;
      });
  }, [orders, cancellations, statusFilter, reasonFilter, fromDate, toDate]);

  const summary = useMemo(() => {
    const gross = rows.reduce((s, r) => s + r.order.totalAmount, 0);
    const refunded = rows.reduce(
      (s, r) =>
        s +
        (r.latestCancel && r.latestCancel.refundStatus === 'REFUNDED'
          ? r.latestCancel.refundAmount
          : 0),
      0
    );
    return { count: rows.length, gross, refunded };
  }, [rows]);

  const handleExportCsv = () => {
    const headers = [
      'Order ID',
      'Date (ISO)',
      'Customer',
      'Email',
      'Order Status',
      'Payment Method',
      'Total Amount (INR)',
      'Cancellation ID',
      'Cancellation Reason',
      'Cancellation Status',
      'Refund Amount (INR)',
      'Refund Status',
    ];

    const escapeCell = (val: string | number) => {
      const str = String(val ?? '');
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvLines = [
      headers.join(','),
      ...rows.map(({ order, latestCancel }) =>
        [
          order.id,
          order.createdAt,
          order.customerName,
          order.customerEmail,
          order.status,
          order.paymentMethod,
          order.totalAmount.toFixed(2),
          latestCancel?.id || '',
          latestCancel?.reason || '',
          latestCancel?.status || '',
          latestCancel ? latestCancel.refundAmount.toFixed(2) : '0.00',
          latestCancel?.refundStatus || '',
        ]
          .map(escapeCell)
          .join(',')
      ),
    ];

    const blob = new Blob([csvLines.join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cocs-report-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast({
      type: 'success',
      title: 'CSV report exported',
      description: `Downloaded ${rows.length} filtered record(s).`,
    });
  };

  return (
    <div className="space-y-5">
      {/* Filters & Export */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-sm font-bold text-slate-900">
              Order & Cancellation Report Filters
            </h2>
            <p className="text-xs text-slate-500">
              Filter across order statuses, dates, and cancellation reasons, then export CSV.
            </p>
          </div>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={rows.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-[#0f2547] px-4 py-2 text-xs font-semibold text-white hover:bg-[#17345e] cursor-pointer disabled:opacity-50 whitespace-nowrap"
          >
            <Download className="h-4 w-4" />
            Export CSV ({rows.length})
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600">
              Order Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800"
            >
              <option value="ALL">All Statuses</option>
              {Object.values(OrderStatus).map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600">
              Cancellation Reason
            </label>
            <select
              value={reasonFilter}
              onChange={(e) => setReasonFilter(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800"
            >
              <option value="ALL">All Reasons</option>
              {CANCELLATION_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600">
              From Date
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-800"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600">
              To Date
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-800"
            />
          </div>
        </div>

        {/* Summary Strip */}
        <div className="grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-3 text-sm">
          <div>
            <span className="text-xs text-slate-500">Matching Orders</span>
            <p className="font-mono text-lg font-bold text-slate-900 tabular-nums">
              {summary.count}
            </p>
          </div>
          <div>
            <span className="text-xs text-slate-500">Gross Order Value</span>
            <p className="font-mono text-lg font-bold text-[#0f2547] tabular-nums">
              {formatCurrency(summary.gross)}
            </p>
          </div>
          <div>
            <span className="text-xs text-slate-500">Settled Refunds</span>
            <p className="font-mono text-lg font-bold text-emerald-700 tabular-nums">
              {formatCurrency(summary.refunded)}
            </p>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {loading ? (
          <div className="p-8 text-sm text-slate-500">Generating report...</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">
            No records match the selected filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="px-4 py-3">Order</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Order Status</th>
                  <th className="px-4 py-3">Cancellation</th>
                  <th className="px-4 py-3">Refund Status</th>
                  <th className="px-4 py-3 text-right">Order Total</th>
                  <th className="px-4 py-3 text-right">Refund</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(({ order, latestCancel }) => (
                  <tr key={order.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <p className="font-mono text-xs font-bold text-[#0f2547]">
                        {order.id}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {formatDateTime(order.createdAt)}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-800">
                      {order.customerName}
                    </td>
                    <td className="px-4 py-3">
                      <OrderStatusBadge status={order.status} />
                    </td>
                    <td className="px-4 py-3">
                      {latestCancel ? (
                        <div className="space-y-1">
                          <CancellationStatusBadge status={latestCancel.status} />
                          <p className="text-[11px] text-slate-500">
                            {latestCancel.reason}
                          </p>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {latestCancel ? (
                        <RefundStatusBadge status={latestCancel.refundStatus} />
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs font-semibold text-slate-900 tabular-nums">
                      {formatCurrency(order.totalAmount)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs font-semibold text-emerald-700 tabular-nums">
                      {latestCancel ? formatCurrency(latestCancel.refundAmount) : '—'}
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
