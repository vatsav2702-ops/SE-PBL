import { useEffect, useState } from 'react';
import { Bell, Check, CheckCheck, Eye } from 'lucide-react';
import { AppNotification } from '../../types';
import * as db from '../../services/db';
import { useAuth } from '../../context/AuthContext';
import { formatDateTime } from '../../rules/cancellationRules';

interface NotificationsPageProps {
  onViewOrder: (orderId: string) => void;
}

export function NotificationsPage({ onViewOrder }: NotificationsPageProps) {
  const { user, dataVersion, triggerRefresh } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const list = await db.getNotifications(user.id);
        if (active) setNotifications(list);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [user, dataVersion]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleMarkRead = async (id: string) => {
    if (!user) return;
    await db.markNotificationRead(id, user.id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    triggerRefresh();
  };

  const handleMarkAllRead = async () => {
    if (!user) return;
    await db.markAllNotificationsRead(user.id);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    triggerRefresh();
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
        Loading notifications...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-4">
        <div>
          <h2 className="font-display text-sm font-bold text-slate-900">
            Notifications Inbox
          </h2>
          <p className="text-xs text-slate-500">
            {unreadCount} unread of {notifications.length} total alerts
          </p>
        </div>

        {unreadCount > 0 && (
          <button
            type="button"
            onClick={handleMarkAllRead}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
          >
            <CheckCheck className="h-4 w-4 text-blue-700" />
            Mark All as Read
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
          <Bell className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-3 text-sm font-semibold text-slate-900">
            You are all caught up
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Order confirmations, cancellation decisions, and refund updates will appear here.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between ${
                n.read ? 'bg-white' : 'bg-blue-50/40'
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-slate-900">
                    {n.title}
                  </p>
                  {!n.read && (
                    <span className="text-xs font-semibold text-blue-700">
                      · Unread
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  {n.message}
                </p>
                <p className="mt-1.5 text-xs text-slate-400">
                  {formatDateTime(n.createdAt)}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {n.orderId && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!n.read) handleMarkRead(n.id);
                      onViewOrder(n.orderId!);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    View Order
                  </button>
                )}
                {!n.read && (
                  <button
                    type="button"
                    onClick={() => handleMarkRead(n.id)}
                    className="inline-flex items-center gap-1 rounded-lg bg-[#0f2547] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#17345e] cursor-pointer whitespace-nowrap"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Mark Read
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
