import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { AppNotification, CartItem, Product, User, UserRole } from '../types';
import * as db from '../services/db';

interface AuthContextValue {
  user: User | null;
  authLoading: boolean;
  cart: CartItem[];
  unreadCount: number;
  pendingRequestsCount: number;
  dataVersion: number;
  triggerRefresh: () => void;
  loginWithCredentials: (email: string, password: string) => Promise<User>;
  loginDemo: (role: UserRole) => Promise<User>;
  registerAccount: (input: {
    name: string;
    email: string;
    password: string;
    phone: string;
  }) => Promise<User>;
  logout: () => Promise<void>;
  addToCart: (product: Product, qty?: number) => Promise<void>;
  updateCartQuantity: (productId: string, qty: number, maxStock: number) => Promise<void>;
  removeFromCart: (productId: string) => Promise<void>;
  clearCart: () => Promise<void>;
  refreshBadges: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  const [dataVersion, setDataVersion] = useState(0);

  const refreshBadges = useCallback(async (activeUser?: User | null) => {
    const target = activeUser !== undefined ? activeUser : user;
    if (!target) {
      setUnreadCount(0);
      setPendingRequestsCount(0);
      return;
    }
    if (target.role === UserRole.CUSTOMER) {
      const notifs: AppNotification[] = await db.getNotifications(target.id);
      setUnreadCount(notifs.filter((n) => !n.read).length);
      const savedCart = await db.getCart(target.id);
      setCart(savedCart);
    } else {
      const cancellations = await db.getCancellations(target);
      setPendingRequestsCount(cancellations.filter((c) => c.status === 'PENDING').length);
      setUnreadCount(0);
      setCart([]);
    }
  }, [user]);

  const triggerRefresh = useCallback(() => {
    setDataVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await db.initDatabase();
        const existing = await db.getCurrentUser();
        if (mounted) {
          setUser(existing);
          await refreshBadges(existing);
        }
      } finally {
        if (mounted) setAuthLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (user) {
      refreshBadges(user);
    }
  }, [user, dataVersion, refreshBadges]);

  const loginWithCredentials = async (email: string, password: string) => {
    const loggedIn = await db.login(email, password);
    setUser(loggedIn);
    await refreshBadges(loggedIn);
    triggerRefresh();
    return loggedIn;
  };

  const loginDemo = async (role: UserRole) => {
    const loggedIn = await db.loginByDemoRole(role);
    setUser(loggedIn);
    await refreshBadges(loggedIn);
    triggerRefresh();
    return loggedIn;
  };

  const registerAccount = async (input: {
    name: string;
    email: string;
    password: string;
    phone: string;
  }) => {
    const created = await db.registerCustomer(input);
    setUser(created);
    await refreshBadges(created);
    triggerRefresh();
    return created;
  };

  const logout = async () => {
    await db.logout();
    setUser(null);
    setCart([]);
    setUnreadCount(0);
    setPendingRequestsCount(0);
  };

  const addToCart = async (product: Product, qty = 1) => {
    if (!user || user.role !== UserRole.CUSTOMER) return;
    if (product.stock <= 0) {
      throw new Error('This item is currently out of stock.');
    }
    const existing = cart.find((c) => c.productId === product.id);
    const nextQty = (existing ? existing.quantity : 0) + qty;
    if (nextQty > product.stock) {
      throw new Error(`Only ${product.stock} unit(s) of "${product.name}" available.`);
    }
    const nextCart = existing
      ? cart.map((c) => (c.productId === product.id ? { ...c, quantity: nextQty } : c))
      : [...cart, { productId: product.id, quantity: qty }];
    await db.saveCart(user.id, nextCart);
    setCart(nextCart);
  };

  const updateCartQuantity = async (
    productId: string,
    qty: number,
    maxStock: number
  ) => {
    if (!user) return;
    if (qty <= 0) {
      const nextCart = cart.filter((c) => c.productId !== productId);
      await db.saveCart(user.id, nextCart);
      setCart(nextCart);
      return;
    }
    const clamped = Math.min(qty, maxStock);
    const nextCart = cart.map((c) =>
      c.productId === productId ? { ...c, quantity: clamped } : c
    );
    await db.saveCart(user.id, nextCart);
    setCart(nextCart);
  };

  const removeFromCart = async (productId: string) => {
    if (!user) return;
    const nextCart = cart.filter((c) => c.productId !== productId);
    await db.saveCart(user.id, nextCart);
    setCart(nextCart);
  };

  const clearCart = async () => {
    if (!user) return;
    await db.saveCart(user.id, []);
    setCart([]);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        authLoading,
        cart,
        unreadCount,
        pendingRequestsCount,
        dataVersion,
        triggerRefresh,
        loginWithCredentials,
        loginDemo,
        registerAccount,
        logout,
        addToCart,
        updateCartQuantity,
        removeFromCart,
        clearCart,
        refreshBadges: () => refreshBadges(user),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
