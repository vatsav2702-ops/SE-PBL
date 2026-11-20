import React, { useState } from 'react';
import {
  BarChart3,
  Bell,
  ClipboardList,
  FileSpreadsheet,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  ScrollText,
  Settings,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Store,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import { AppView, UserRole } from '../types';
import { useAuth } from '../context/AuthContext';
import { RoleBadge } from './StatusBadge';

interface NavItem {
  view: AppView;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

interface LayoutProps {
  currentView: AppView;
  pageTitle: string;
  onNavigate: (view: AppView) => void;
  children: React.ReactNode;
}

export function Layout({
  currentView,
  pageTitle,
  onNavigate,
  children,
}: LayoutProps) {
  const { user, cart, unreadCount, pendingRequestsCount, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  if (!user) return <>{children}</>;

  const totalCartItems = cart.reduce((sum, i) => sum + i.quantity, 0);

  const navItems: NavItem[] =
    user.role === UserRole.CUSTOMER
      ? [
          { view: 'shop', label: 'Shop', icon: Store },
          { view: 'cart', label: 'Cart', icon: ShoppingCart, badge: totalCartItems },
          { view: 'my-orders', label: 'My Orders', icon: ShoppingBag },
          { view: 'my-cancellations', label: 'My Cancellations', icon: XCircle },
          {
            view: 'notifications',
            label: 'Notifications',
            icon: Bell,
            badge: unreadCount,
          },
        ]
      : user.role === UserRole.AGENT
      ? [
          {
            view: 'agent-pending',
            label: 'Pending Requests',
            icon: ClipboardList,
            badge: pendingRequestsCount,
          },
          { view: 'all-orders', label: 'All Orders', icon: ShoppingBag },
          { view: 'all-cancellations', label: 'All Cancellations', icon: XCircle },
        ]
      : [
          { view: 'admin-dashboard', label: 'Dashboard', icon: LayoutDashboard },
          { view: 'all-orders', label: 'All Orders', icon: ShoppingBag },
          {
            view: 'all-cancellations',
            label: 'Cancellations',
            icon: XCircle,
            badge: pendingRequestsCount,
          },
          { view: 'admin-products', label: 'Manage Products', icon: Package },
          { view: 'admin-users', label: 'Manage Users', icon: Users },
          { view: 'admin-reports', label: 'Reports', icon: FileSpreadsheet },
          { view: 'admin-audit', label: 'Audit Log', icon: ScrollText },
          { view: 'admin-settings', label: 'Settings', icon: Settings },
        ];

  const handleNavClick = (view: AppView) => {
    onNavigate(view);
    setMobileMenuOpen(false);
  };

  const SidebarContent = (
    <div className="flex h-full flex-col bg-[#0f2547] text-slate-100">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <span className="block truncate font-display text-base font-bold tracking-tight text-white">
              COCS Portal
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          className="rounded-lg p-1 text-slate-300 hover:bg-white/10 lg:hidden cursor-pointer"
          aria-label="Close navigation"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            currentView === item.view ||
            (currentView === 'order-details' &&
              (item.view === 'my-orders' || item.view === 'all-orders')) ||
            (currentView === 'cancel-order' && item.view === 'my-orders');

          return (
            <button
              key={item.view}
              type="button"
              onClick={() => handleNavClick(item.view)}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-3 min-w-0">
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </span>
              {item.badge !== undefined && item.badge > 0 && (
                <span
                  className={`ml-2 inline-flex min-w-[20px] items-center justify-center rounded-md px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'bg-blue-500/25 text-blue-100'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-4">
        <div className="mb-3 rounded-lg bg-white/5 p-3">
          <p className="truncate text-sm font-semibold text-white">{user.name}</p>
          <p className="truncate text-xs text-slate-300">{user.email}</p>
          <div className="mt-2">
            <span className="inline-flex items-center rounded bg-white/15 px-2 py-0.5 text-[11px] font-medium text-blue-100">
              {user.role === UserRole.CUSTOMER
                ? 'Customer'
                : user.role === UserRole.AGENT
                ? 'Support Agent'
                : 'Administrator'}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={logout}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 shrink-0 lg:block">
        <div className="sticky top-0 h-screen">{SidebarContent}</div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/50"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative z-50 w-64 max-w-[80vw]">{SidebarContent}</div>
        </div>
      )}

      {/* Main Content Column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden cursor-pointer"
              aria-label="Open navigation menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="truncate font-display text-lg font-bold tracking-tight text-slate-900">
              {pageTitle}
            </h1>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {user.role === UserRole.CUSTOMER && (
              <>
                <button
                  type="button"
                  onClick={() => onNavigate('cart')}
                  className="relative inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <ShoppingCart className="h-4 w-4 text-[#0f2547]" />
                  <span className="hidden sm:inline">Cart</span>
                  {totalCartItems > 0 && (
                    <span className="ml-0.5 rounded bg-blue-700 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-white tabular-nums">
                      {totalCartItems}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('notifications')}
                  aria-label="Notifications"
                  className="relative rounded-lg border border-slate-200 bg-white p-2 text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <Bell className="h-4 w-4 text-[#0f2547]" />
                  {unreadCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 font-mono text-[10px] font-bold text-white tabular-nums">
                      {unreadCount}
                    </span>
                  )}
                </button>
              </>
            )}

            {user.role === UserRole.AGENT && (
              <button
                type="button"
                onClick={() => onNavigate('agent-pending')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
              >
                <ClipboardList className="h-4 w-4 text-amber-600" />
                <span>Pending Queue</span>
                <span className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-amber-900 tabular-nums">
                  {pendingRequestsCount}
                </span>
              </button>
            )}

            {user.role === UserRole.ADMIN && (
              <button
                type="button"
                onClick={() => onNavigate('admin-reports')}
                className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
              >
                <BarChart3 className="h-4 w-4 text-[#0f2547]" />
                <span>Reports & CSV</span>
              </button>
            )}

            <div className="hidden md:flex items-center gap-2 border-l border-slate-200 pl-3">
              <RoleBadge role={user.role} />
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1320px] flex-1 p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
