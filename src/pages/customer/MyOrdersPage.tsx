import { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpDown,
  Eye,
  Search,
  ShoppingBag,
  Trash2,
  XCircle,
} from 'lucide-react';
import { AppSettings, Order, OrderStatus } from '../../types';
import * as db from '../../services/db';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  canCustomerSoftDeleteOrder,
  DEFAULT_SETTINGS,
  evaluateCancellationEligibility,
  formatCurrency,
  formatDateTime,
} from '../../rules/cancellationRules';
import { OrderStatusBadge } from '../../components/StatusBadge';
import { ConfirmDialog } from '../../components/ConfirmDialog';

interface MyOrdersPageProps {
  onViewOrder: (orderId: string) => void;
  onCancelOrder: (orderId: string) => void;
  onGoToShop: () => void;
}

export function MyOrdersPage({
  onViewOrder,
  onCancelOrder,
  onGoToShop,
}: MyOrdersPageProps) {
  const { user, dataVersion, triggerRefresh } = useAuth();
  const { showToast } = useToast();

  const [orders, setOrders] = useState<Order[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

  const [deleteTarget, setDeleteTarget] = useState<Order | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const [list, cfg] = await Promise.all([
          db.getOrders(user),
          db.getSettings(),
        ]);
        if (active) {
          setOrders(list);
          setSettings(cfg);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [user, dataVersion]);

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = orders.filter((o) => {
      const matchesStatus = statusFilter === 'ALL' || o.status === statusFilter;
      const matchesSearch =
        !q ||
        o.id.toLowerCase().includes(q) ||
        o.items.some((i) => i.productName.toLowerCase().includes(q));
      return matchesStatus && matchesSearch;
    });

    return [...list].sort((a, b) => {
      const diff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return sortOrder === 'newest' ? diff : -diff;
    });
  }, [orders, search, statusFilter, sortOrder]);

  const handleConfirmSoftDelete = async () => {
    if (!user || !deleteTarget) return;
    const removedId = deleteTarget.id;
    setDeleting(true);
    try {
      await db.softDeleteOrder(removedId, user);
      setDeleteTarget(null);
      triggerRefresh();
      showToast({
        type: 'info',
        title: `Removed ${removedId} from your order history`,
        description: 'This record remains safely preserved for store audit & reporting.',
        durationMs: 5000,
        action: {
          label: 'Undo',
          onClick: async () => {
            await db.restoreSoftDeletedOrder(removedId, user);
            triggerRefresh();
            showToast({
              type: 'success',
              title: `Restored ${removedId}`,
              description: 'The order is back in your My Orders list.',
            });
          },
        },
      });
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Unable to delete order',
        description: err instanceof Error ? err.message : 'Action not permitted.',
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Search, Filter & Sort Controls */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 md:flex-row md:items-center md:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by Order ID (e.g. ORD-10001) or item name..."
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by order status"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 focus:border-blue-600 focus:outline-none"
          >
            <option value="ALL">All Statuses</option>
            {Object.values(OrderStatus).map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() =>
              setSortOrder((prev) => (prev === 'newest' ? 'oldest' : 'newest'))
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            Date: {sortOrder === 'newest' ? 'Newest First' : 'Oldest First'}
          </button>
        </div>
      </div>

      {/* Orders List */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-xl border border-slate-200 bg-white"
            />
          ))}
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
            <ShoppingBag className="h-6 w-6" />
          </div>
          <h2 className="mt-4 font-display text-base font-bold text-slate-900">
            {orders.length === 0 ? 'No orders yet' : 'No orders match your filters'}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {orders.length === 0
              ? 'Place your first order from the shop catalog.'
              : 'Try adjusting your search or status filter.'}
          </p>
          {orders.length === 0 && (
            <button
              type="button"
              onClick={onGoToShop}
              className="mt-4 rounded-lg bg-[#0f2547] px-4 py-2 text-xs font-semibold text-white hover:bg-[#17345e] cursor-pointer"
            >
              Visit Shop
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3.5">
          {filteredOrders.map((order) => {
            const cancelCheck = evaluateCancellationEligibility(order, settings);
            const canSoftDelete = canCustomerSoftDeleteOrder(order);

            return (
              <div
                key={order.id}
                className="rounded-xl border border-slate-200 bg-white p-5 transition-colors hover:border-slate-300"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="font-mono text-sm font-bold text-[#0f2547]">
                        {order.id}
                      </span>
                      <OrderStatusBadge status={order.status} />
                      <span className="text-xs text-slate-500">
                        {formatDateTime(order.createdAt)} · {order.paymentMethod}
                      </span>
                    </div>

                    <p className="mt-2 truncate text-sm text-slate-700">
                      {order.items
                        .map((i) => `${i.productName} ×${i.quantity}`)
                        .join(', ')}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                    <div className="mr-2 text-left sm:text-right">
                      <p className="font-mono text-base font-bold text-slate-900 tabular-nums">
                        {formatCurrency(order.totalAmount)}
                      </p>
                      {order.activeAmount !== order.totalAmount && (
                        <p className="font-mono text-[11px] text-slate-500 tabular-nums">
                          Active: {formatCurrency(order.activeAmount)}
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => onViewOrder(order.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Details
                    </button>

                    {cancelCheck.allowed && (
                      <button
                        type="button"
                        onClick={() => onCancelOrder(order.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Cancel Order
                      </button>
                    )}

                    {canSoftDelete && (
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(order)}
                        title="Remove from my order history"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Remove ${deleteTarget?.id} from your history?`}
        description="This hides the completed or cancelled order from your personal order list. You will have 5 seconds to undo this action, and audit records remain intact."
        confirmLabel="Remove from History"
        variant="danger"
        loading={deleting}
        onConfirm={handleConfirmSoftDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
