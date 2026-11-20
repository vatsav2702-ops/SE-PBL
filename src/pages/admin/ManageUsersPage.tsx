import { useEffect, useState } from 'react';
import { Search, Trash2 } from 'lucide-react';
import { Order, User, UserRole } from '../../types';
import * as db from '../../services/db';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatShortDate } from '../../rules/cancellationRules';
import { RoleBadge } from '../../components/StatusBadge';
import { ConfirmDialog } from '../../components/ConfirmDialog';

export function ManageUsersPage() {
  const { user, dataVersion, triggerRefresh } = useAuth();
  const { showToast } = useToast();

  const [users, setUsers] = useState<User[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const [uList, oList] = await Promise.all([
          db.getUsers(user),
          db.getOrders(user, true),
        ]);
        if (active) {
          setUsers(uList);
          setOrders(oList);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [user, dataVersion]);

  const filtered = users.filter((u) => {
    const q = search.trim().toLowerCase();
    const matchRole = roleFilter === 'ALL' || u.role === roleFilter;
    const matchSearch =
      !q ||
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.phone.toLowerCase().includes(q);
    return matchRole && matchSearch;
  });

  const handleConfirmDelete = async () => {
    if (!user || !deleteTarget) return;
    setDeleting(true);
    try {
      await db.deleteUser(deleteTarget.id, user);
      const removedName = deleteTarget.name;
      setDeleteTarget(null);
      triggerRefresh();
      showToast({
        type: 'success',
        title: 'User deleted',
        description: `Account for ${removedName} was permanently removed.`,
      });
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Cannot delete user',
        description: err instanceof Error ? err.message : 'Action failed.',
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users by name, email, or phone..."
            className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
          />
        </div>

        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          aria-label="Filter by user role"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
        >
          <option value="ALL">All Roles ({users.length})</option>
          {Object.values(UserRole).map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {loading ? (
          <div className="p-8 text-sm text-slate-500">Loading user directory...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3 text-right">Orders</th>
                  <th className="px-4 py-3">Joined</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((u) => {
                  const orderCount = orders.filter(
                    (o) => o.customerId === u.id
                  ).length;
                  const isSelf = u.id === user?.id;

                  return (
                    <tr key={u.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3.5">
                        <p className="text-xs font-semibold text-slate-900">
                          {u.name} {isSelf && <span className="text-slate-400">(You)</span>}
                        </p>
                        <p className="text-[11px] text-slate-500">{u.email}</p>
                      </td>
                      <td className="px-4 py-3.5">
                        <RoleBadge role={u.role} />
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs text-slate-600">
                        {u.phone}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-xs font-semibold text-slate-800 tabular-nums">
                        {orderCount}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-500">
                        {formatShortDate(u.createdAt)}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <button
                          type="button"
                          disabled={isSelf}
                          onClick={() => setDeleteTarget(u)}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Delete user ${deleteTarget?.name}?`}
        description="This removes the user account from local storage. Historical orders and audit logs remain preserved."
        confirmLabel="Delete User"
        variant="danger"
        loading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
