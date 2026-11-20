import { useEffect, useState } from 'react';
import { AppView, UserRole } from './types';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider, useToast } from './context/ToastContext';
import {
  getDefaultViewForRole,
  ROLE_ALLOWED_VIEWS,
} from './rules/cancellationRules';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { ShopPage } from './pages/customer/ShopPage';
import { CartPage } from './pages/customer/CartPage';
import { MyOrdersPage } from './pages/customer/MyOrdersPage';
import { CancelOrderPage } from './pages/customer/CancelOrderPage';
import { MyCancellationsPage } from './pages/customer/MyCancellationsPage';
import { NotificationsPage } from './pages/customer/NotificationsPage';
import { OrderDetailsPage } from './pages/shared/OrderDetailsPage';
import { PendingRequestsPage } from './pages/agent/PendingRequestsPage';
import { AllOrdersPage } from './pages/shared/AllOrdersPage';
import { AllCancellationsPage } from './pages/shared/AllCancellationsPage';
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage';
import { ManageProductsPage } from './pages/admin/ManageProductsPage';
import { ManageUsersPage } from './pages/admin/ManageUsersPage';
import { ReportsPage } from './pages/admin/ReportsPage';
import { AuditLogPage } from './pages/admin/AuditLogPage';
import { SettingsPage } from './pages/admin/SettingsPage';

const VIEW_TITLES: Record<AppView, string> = {
  shop: 'Store Catalog',
  cart: 'Shopping Cart & Checkout',
  'my-orders': 'My Orders',
  'order-details': 'Order Details',
  'cancel-order': 'Cancel Order',
  'my-cancellations': 'My Cancellations',
  notifications: 'Notifications',
  'agent-pending': 'Pending Cancellation Requests',
  'all-orders': 'All Orders',
  'all-cancellations': 'All Cancellations & Refunds',
  'admin-dashboard': 'Executive Dashboard',
  'admin-products': 'Manage Products',
  'admin-users': 'Manage Users',
  'admin-reports': 'Reports & CSV Export',
  'admin-audit': 'System Audit Log',
  'admin-settings': 'Cancellation Policy & Settings',
};

function AppShell() {
  const { user, authLoading } = useAuth();
  const { showToast } = useToast();

  const [currentView, setCurrentView] = useState<AppView>('shop');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  // Sync default landing screen whenever logged-in user or role changes
  useEffect(() => {
    if (!user) return;
    const allowed = ROLE_ALLOWED_VIEWS[user.role];
    if (!allowed.includes(currentView)) {
      setCurrentView(getDefaultViewForRole(user.role));
      setSelectedOrderId(null);
    }
  }, [user, currentView]);

  // Enforce strict Role-Based Access Control on every navigation attempt
  const navigateTo = (view: AppView) => {
    if (!user) return;
    const allowed = ROLE_ALLOWED_VIEWS[user.role];
    if (!allowed.includes(view)) {
      showToast({
        type: 'error',
        title: 'Access restricted',
        description: `Your ${user.role} role does not have permission to access that screen.`,
      });
      setCurrentView(getDefaultViewForRole(user.role));
      return;
    }
    setCurrentView(view);
  };

  const openOrderDetails = (orderId: string) => {
    setSelectedOrderId(orderId);
    navigateTo('order-details');
  };

  const openCancelOrder = (orderId: string) => {
    setSelectedOrderId(orderId);
    navigateTo('cancel-order');
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm font-medium text-slate-600">
        Initializing Customer Order Cancellation System...
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  // Defensive RBAC guard
  const safeView: AppView = ROLE_ALLOWED_VIEWS[user.role].includes(currentView)
    ? currentView
    : getDefaultViewForRole(user.role);

  const renderPage = () => {
    switch (safeView) {
      case 'shop':
        return <ShopPage onGoToCart={() => navigateTo('cart')} />;
      case 'cart':
        return (
          <CartPage
            onGoToShop={() => navigateTo('shop')}
            onViewOrder={openOrderDetails}
          />
        );
      case 'my-orders':
        return (
          <MyOrdersPage
            onViewOrder={openOrderDetails}
            onCancelOrder={openCancelOrder}
            onGoToShop={() => navigateTo('shop')}
          />
        );
      case 'order-details':
        return selectedOrderId ? (
          <OrderDetailsPage
            orderId={selectedOrderId}
            onBack={() =>
              navigateTo(
                user.role === UserRole.CUSTOMER ? 'my-orders' : 'all-orders'
              )
            }
            onCancelOrder={openCancelOrder}
          />
        ) : (
          <MyOrdersPage
            onViewOrder={openOrderDetails}
            onCancelOrder={openCancelOrder}
            onGoToShop={() => navigateTo('shop')}
          />
        );
      case 'cancel-order':
        return selectedOrderId ? (
          <CancelOrderPage
            orderId={selectedOrderId}
            onBack={() => openOrderDetails(selectedOrderId)}
            onCompleted={(id) => openOrderDetails(id)}
          />
        ) : (
          <MyOrdersPage
            onViewOrder={openOrderDetails}
            onCancelOrder={openCancelOrder}
            onGoToShop={() => navigateTo('shop')}
          />
        );
      case 'my-cancellations':
        return <MyCancellationsPage onViewOrder={openOrderDetails} />;
      case 'notifications':
        return <NotificationsPage onViewOrder={openOrderDetails} />;
      case 'agent-pending':
        return <PendingRequestsPage onViewOrder={openOrderDetails} />;
      case 'all-orders':
        return <AllOrdersPage onViewOrder={openOrderDetails} />;
      case 'all-cancellations':
        return <AllCancellationsPage onViewOrder={openOrderDetails} />;
      case 'admin-dashboard':
        return <AdminDashboardPage onViewOrder={openOrderDetails} />;
      case 'admin-products':
        return <ManageProductsPage />;
      case 'admin-users':
        return <ManageUsersPage />;
      case 'admin-reports':
        return <ReportsPage />;
      case 'admin-audit':
        return <AuditLogPage />;
      case 'admin-settings':
        return <SettingsPage />;
      default:
        return null;
    }
  };

  return (
    <Layout
      currentView={safeView}
      pageTitle={VIEW_TITLES[safeView]}
      onNavigate={navigateTo}
    >
      {renderPage()}
    </Layout>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </ToastProvider>
  );
}
