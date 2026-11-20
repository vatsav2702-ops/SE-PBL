import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Cancellation,
  Order,
  OrderStatus,
  Payment,
  RefundStatus,
} from '../../types';
import * as db from '../../services/db';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency, formatDateTime } from '../../rules/cancellationRules';
import { OrderStatusBadge } from '../../components/StatusBadge';

interface AdminDashboardPageProps {
  onViewOrder: (orderId: string) => void;
}

const STATUS_COLORS: Record<OrderStatus, string> = {
  [OrderStatus.PLACED]: '#1d4ed8',
  [OrderStatus.CONFIRMED]: '#4338ca',
  [OrderStatus.PACKED]: '#d97706',
  [OrderStatus.SHIPPED]: '#0284c7',
  [OrderStatus.DELIVERED]: '#16a34a',
  [OrderStatus.CANCELLED]: '#dc2626',
};

export function AdminDashboardPage({ onViewOrder }: AdminDashboardPageProps) {
  const { user, dataVersion } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [cancellations, setCancellations] = useState<Cancellation[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const [ords, cancels, pays] = await Promise.all([
          db.getOrders(user, true),
          db.getCancellations(user),
          db.getPayments(user),
        ]);
        if (active) {
          setOrders(ords);
          setCancellations(cancels);
          setPayments(pays);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [user, dataVersion]);

  const metrics = useMemo(() => {
    const totalOrders = orders.length;
    const activeOrders = orders.filter(
      (o) =>
        o.status === OrderStatus.PLACED ||
        o.status === OrderStatus.CONFIRMED ||
        o.status === OrderStatus.PACKED ||
        o.status === OrderStatus.SHIPPED
    ).length;
    const totalCancellations = cancellations.length;
    const cancelledOrdersCount = orders.filter(
      (o) => o.status === OrderStatus.CANCELLED
    ).length;
    const cancellationRate =
      totalOrders > 0 ? (cancelledOrdersCount / totalOrders) * 100 : 0;

    const totalRefundedFromPayments = payments.reduce(
      (sum, p) => sum + p.refundedAmount,
      0
    );
    const pendingRefundCount = cancellations.filter(
      (c) => c.refundStatus === RefundStatus.REFUND_PENDING
    ).length;

    return {
      totalOrders,
      activeOrders,
      totalCancellations,
      cancellationRate,
      totalRefunded: totalRefundedFromPayments,
      pendingRefundCount,
    };
  }, [orders, cancellations, payments]);

  const ordersPerStatusData = useMemo(() => {
    return Object.values(OrderStatus).map((status) => ({
      status,
      count: orders.filter((o) => o.status === status).length,
      color: STATUS_COLORS[status],
    }));
  }, [orders]);

  const cancellationsByReasonData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of cancellations) {
      counts[c.reason] = (counts[c.reason] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);
  }, [cancellations]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-xl border border-slate-200 bg-white"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 5 KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-semibold text-slate-500">Total Orders</p>
          <p className="mt-2 font-mono text-2xl font-bold text-[#0f2547] tabular-nums">
            {metrics.totalOrders}
          </p>
          <p className="mt-1 text-xs text-slate-500">All recorded orders</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-semibold text-slate-500">Active Orders</p>
          <p className="mt-2 font-mono text-2xl font-bold text-blue-700 tabular-nums">
            {metrics.activeOrders}
          </p>
          <p className="mt-1 text-xs text-slate-500">Placed through Shipped</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-semibold text-slate-500">Cancellations</p>
          <p className="mt-2 font-mono text-2xl font-bold text-slate-900 tabular-nums">
            {metrics.totalCancellations}
          </p>
          <p className="mt-1 text-xs text-slate-500">Full & partial requests</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-semibold text-slate-500">Cancellation Rate</p>
          <p className="mt-2 font-mono text-2xl font-bold text-red-600 tabular-nums">
            {metrics.cancellationRate.toFixed(1)}%
          </p>
          <p className="mt-1 text-xs text-slate-500">Fully cancelled orders</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-semibold text-slate-500">Total Refunded</p>
          <p className="mt-2 font-mono text-2xl font-bold text-emerald-700 tabular-nums">
            {formatCurrency(metrics.totalRefunded)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {metrics.pendingRefundCount > 0
              ? `${metrics.pendingRefundCount} refund pending retry`
              : 'All refunds settled'}
          </p>
        </div>
      </div>

      {/* Recharts Analytics Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Orders per Status Chart */}
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="font-display text-sm font-bold text-slate-900">
            Orders per Status
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Current order distribution across the fulfillment lifecycle
          </p>
          <div className="mt-5 h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={ordersPerStatusData}
                margin={{ top: 8, right: 16, left: -12, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="status"
                  tick={{ fontSize: 11, fill: '#475569' }}
                  axisLine={{ stroke: '#cbd5e1' }}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: '#475569' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="count" name="Orders" radius={[6, 6, 0, 0]} maxBarSize={44}>
                  {ordersPerStatusData.map((entry) => (
                    <Cell key={entry.status} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Cancellations by Reason Chart */}
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="font-display text-sm font-bold text-slate-900">
            Cancellations by Reason
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Breakdown of customer-selected cancellation reasons
          </p>
          {cancellationsByReasonData.length === 0 ? (
            <div className="flex h-72 items-center justify-center text-sm text-slate-400">
              No cancellation data available yet.
            </div>
          ) : (
            <div className="mt-5 h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={cancellationsByReasonData}
                  layout="vertical"
                  margin={{ top: 8, right: 24, left: 16, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: '#475569' }}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="reason"
                    width={145}
                    tick={{ fontSize: 11, fill: '#334155' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                      fontSize: '12px',
                    }}
                  />
                  <Bar
                    dataKey="count"
                    name="Requests"
                    fill="#0f2547"
                    radius={[0, 6, 6, 0]}
                    maxBarSize={28}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Recent Orders Snapshot */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-display text-sm font-bold text-slate-900">
            Recent Orders
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="px-5 py-3">Order ID</th>
                <th className="px-5 py-3">Customer</th>
                <th className="px-5 py-3">Placed</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.slice(0, 6).map((ord) => (
                <tr
                  key={ord.id}
                  onClick={() => onViewOrder(ord.id)}
                  className="cursor-pointer hover:bg-slate-50"
                >
                  <td className="px-5 py-3 font-mono text-xs font-bold text-[#0f2547]">
                    {ord.id}
                  </td>
                  <td className="px-5 py-3 text-xs font-medium text-slate-800">
                    {ord.customerName}
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-500">
                    {formatDateTime(ord.createdAt)}
                  </td>
                  <td className="px-5 py-3">
                    <OrderStatusBadge status={ord.status} />
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-xs font-bold text-slate-900 tabular-nums">
                    {formatCurrency(ord.totalAmount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
