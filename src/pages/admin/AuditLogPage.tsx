import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { AuditLogEntry } from '../../types';
import * as db from '../../services/db';
import { useAuth } from '../../context/AuthContext';
import { formatDateTime } from '../../rules/cancellationRules';
import { RoleBadge } from '../../components/StatusBadge';

export function AuditLogPage() {
  const { user, dataVersion } = useAuth();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [entityFilter, setEntityFilter] = useState('ALL');

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const list = await db.getAuditLogs(user);
        if (active) setLogs(list);
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
    return logs.filter((entry) => {
      const matchEntity =
        entityFilter === 'ALL' || entry.entityType === entityFilter;
      const matchSearch =
        !q ||
        entry.action.toLowerCase().includes(q) ||
        entry.entityId.toLowerCase().includes(q) ||
        entry.actorName.toLowerCase().includes(q) ||
        entry.details.toLowerCase().includes(q);
      return matchEntity && matchSearch;
    });
  }, [logs, search, entityFilter]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search audit log by action, Order ID, actor, or details..."
            className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
          />
        </div>

        <select
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value)}
          aria-label="Filter by entity type"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
        >
          <option value="ALL">All Entities ({logs.length})</option>
          <option value="ORDER">Orders</option>
          <option value="CANCELLATION">Cancellations</option>
          <option value="PAYMENT">Payments</option>
          <option value="PRODUCT">Products</option>
          <option value="USER">Users</option>
          <option value="SETTINGS">Settings</option>
          <option value="SYSTEM">System</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {loading ? (
          <div className="p-8 text-sm text-slate-500">Loading audit log...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">
            No audit events match your search criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Actor</th>
                  <th className="px-4 py-3">Action / Entity</th>
                  <th className="px-4 py-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 align-top font-mono text-[11px] text-slate-500 whitespace-nowrap">
                      {formatDateTime(entry.timestamp)}
                    </td>
                    <td className="px-4 py-3 align-top whitespace-nowrap">
                      <p className="text-xs font-semibold text-slate-900">
                        {entry.actorName}
                      </p>
                      <div className="mt-1">
                        <RoleBadge role={entry.actorRole} />
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top whitespace-nowrap">
                      <p className="font-mono text-xs font-semibold text-[#0f2547]">
                        {entry.action}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {entry.entityType} ·{' '}
                        <span className="font-mono">{entry.entityId}</span>
                      </p>
                    </td>
                    <td className="px-4 py-3 align-top text-xs leading-relaxed text-slate-700">
                      {entry.details}
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
