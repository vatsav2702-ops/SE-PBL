import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Eye, Search, Trash2 } from 'lucide-react';
import { Order, OrderStatus, UserRole } from '../../types';
import * as db from '../../services/db';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  formatCurrency,
  formatDateTime,
  getAdvanceStatusButtonLabel,
  getNextOrderStatus,
} from '../../rules/cancellationRules';
import { OrderStatusBadge } from '../../components/StatusBadge';
import { ConfirmDialog } from '../../components/ConfirmDialog';

interface AllOrdersPageProps {
  onViewOrder: (orderId: string) => void;
}

export function AllOrdersPage({ onViewOrder }: AllOrdersPageProps) {
  const { user, dataVersion, triggerRefresh } = useAuth();
  const { showToast } = useToast();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [advancingId, setAdvancingId] = useState<string | null>(null);

  const [hardDeleteTarget, setHardDeleteTarget] = useState<Order | null>(null);
  const [deleting, setDeleting] = useState(false);

  const isAdmin = user?.role === UserRole.ADMIN;

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const list = await db.getOrders(user, true);
        if (active) setOrders(list);
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
    return orders.filter((o) => {
      const matchStatus = statusFilter === 'ALL' || o.status === statusFilter;
      const matchSearch =
        !q ||
        o.id.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        o.customerEmail.toLowerCase().includes(q);
      return matchStatus && matchSearch;
    });
  }, [orders, search, statusFilter]);

  const handleAdvance = async (order: Order) => {
    if (!user || advancingId) return;
    setAdvancingId(order.id);
    try {
      const updated = await db.advanceOrderStatus(order.id, user);
      triggerRefresh();
      showToast({
        type: 'success',
        title: `${order.id} updated to ${updated.status}`,
        description: `Notified ${order.customerName}.`,
      });
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Cannot advance status',
        description: err instanceof Error ? err.message : 'Status update failed.',
      });
    } finally {
      setAdvancingId(null);
    }
  };

  const handleConfirmHardDelete = async () => {
    if (!user || !hardDeleteTarget) return;
    setDeleting(true);
    try {
      await db.hardDeleteOrder(hardDeleteTarget.id, user);
      const removedId = hardDeleteTarget.id;
      setHardDeleteTarget(null);
      triggerRefresh();
      showToast({
        type: 'success',
        title: `Permanently deleted ${removedId}`,
        description: 'Order, linked payment, and cancellation records removed.',
      });
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Delete failed',
        description: err instanceof Error ? err.message : 'Unable to delete order.',
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by Order ID, customer name, or email..."
            className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <div className="flex items-center gap-2.5">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter orders by status"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 focus:border-blue-600 focus:outline-none"
          >
            <option value="ALL">All Statuses ({orders.length})</option>
            {Object.values(OrderStatus).map((st) => (
              <option key={st} value={st}>
                {st} ({orders.filter((o) => o.status === st).length})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {loading ? (
          <div className="p-8 text-sm text-slate-500">Loading orders...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm font-semibold text-slate-900">No matching orders</p>
            <p className="mt-1 text-xs text-slate-500">
              Try adjusting your search query or status filter.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="px-4 py-3">Order ID</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((order) => {
                  const next = getNextOrderStatus(order.status);
                  return (
                    <tr key={order.id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3.5 align-middle">
                        <span className="font-mono text-xs font-bold text-[#0f2547]">
                          {order.id}
                        </span>
                        {order.isDeleted && (
                          <span className="ml-2 text-[11px] text-slate-400">
                            (soft-deleted)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 align-middle">
                        <p className="text-xs font-semibold text-slate-900">
                          {order.customerName}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {order.items.length} item{order.items.length > 1 ? 's' : ''} ·{' '}
                          {order.paymentMethod}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 align-middle text-xs text-slate-600 whitespace-nowrap">
                        {formatDateTime(order.createdAt)}
                      </td>
                      <td className="px-4 py-3.5 align-middle">
                        <OrderStatusBadge status={order.status} />
                      </td>
                      <td className="px-4 py-3.5 align-middle text-right font-mono text-xs font-bold text-slate-900 tabular-nums whitespace-nowrap">
                        {formatCurrency(order.totalAmount)}
                      </td>
                      <td className="px-4 py-3.5 align-middle">
                        <div className="flex items-center justify-end gap-2">
                          {next && (
                            <button
                              type="button"
                              disabled={advancingId === order.id}
                              onClick={() => handleAdvance(order)}
                              className="inline-flex items-center gap-1 rounded-lg bg-[#0f2547] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#17345e] transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                            >
                              <span>
                                {advancingId === order.id
                                  ? 'Updating...'
                                  : getAdvanceStatusButtonLabel(next)}
                              </span>
                              <ArrowRight className="h-3 w-3" />
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => onViewOrder(order.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            View
                          </button>

                          {isAdmin && (
                            <button
                              type="button"
                              title="Permanently delete order"
                              onClick={() => setHardDeleteTarget(order)}
                              className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 cursor-pointer whitespace-nowrap"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Admin Hard Delete Confirmation (Must Type Exact Order ID) */}
      <ConfirmDialog
        open={Boolean(hardDeleteTarget)}
        title={`Permanently delete ${hardDeleteTarget?.id}?`}
        description="This permanently removes the order, its items, payment record, and cancellation records from storage. An audit log entry will be written."
        confirmLabel="Permanently Delete"
        variant="danger"
        requiredMatchText={hardDeleteTarget?.id}
        requiredMatchLabel={`Type ${hardDeleteTarget?.id} to confirm permanent deletion`}
        loading={deleting}
        onConfirm={handleConfirmHardDelete}
        onCancel={() => setHardDeleteTarget(null)}
      />
    </div>
  );
}
