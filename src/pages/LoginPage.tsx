import React, { useState } from 'react';
import {
  ArrowRight,
  Headset,
  ShieldCheck,
  ShoppingBag,
  UserCheck,
} from 'lucide-react';
import { UserRole } from '../types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export function LoginPage() {
  const { loginWithCredentials, loginDemo, registerAccount } = useAuth();
  const { showToast } = useToast();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Login fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Register fields
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regPhone, setRegPhone] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError('Please enter both your email address and password.');
      return;
    }
    setSubmitting(true);
    try {
      const user = await loginWithCredentials(email, password);
      showToast({
        type: 'success',
        title: `Signed in as ${user.name}`,
        description: `Welcome back to the Customer Order Cancellation System.`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const created = await registerAccount({
        name: regName,
        email: regEmail,
        password: regPassword,
        phone: regPhone,
      });
      showToast({
        type: 'success',
        title: 'Account created',
        description: `Welcome, ${created.name}. You are now signed in as a Customer.`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDemoLogin = async (role: UserRole) => {
    setError('');
    setSubmitting(true);
    try {
      const user = await loginDemo(role);
      showToast({
        type: 'success',
        title: `Signed in as ${user.name}`,
        description: `Demo session active (${role}).`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Demo login failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* Left Brand Panel */}
      <div className="bg-[#0f2547] text-white lg:w-[46%] xl:w-[44%] flex flex-col justify-between p-8 sm:p-12 lg:p-14">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600">
              <ShieldCheck className="h-6 w-6 text-white" />
            </div>
            <span className="font-display text-lg font-bold tracking-tight">
              COCS Storefront & Operations
            </span>
          </div>

          <h1 className="mt-10 max-w-md font-display text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl [text-wrap:balance]">
            Customer Order Cancellation System
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-300 sm:text-base">
            End-to-end e-commerce order management, policy-enforced partial and full
            cancellations, automated inventory restocking, mock payment refund settlement,
            and complete audit traceability.
          </p>

          <div className="mt-10 space-y-4 border-t border-white/10 pt-8">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-blue-200">
                <ShoppingBag className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Customer Self-Service</p>
                <p className="text-xs leading-relaxed text-slate-300">
                  Shop catalog, manage cart, edit address on Placed/Confirmed orders, submit
                  full or partial cancellations, and track refunds.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-blue-200">
                <Headset className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Support Agent Queue</p>
                <p className="text-xs leading-relaxed text-slate-300">
                  Review Packed cancellation requests, advance order statuses step-by-step,
                  and retry failed payment gateway refunds.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-blue-200">
                <UserCheck className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Administrator Governance</p>
                <p className="text-xs leading-relaxed text-slate-300">
                  Analytics charts, product inventory CRUD, CSV/JSON exports, immutable audit
                  logs, and live policy rule switches.
                </p>
              </div>
            </div>
          </div>
        </div>

        <p className="mt-10 text-xs text-slate-400">
          All data persists locally in browser storage under <code className="font-mono text-slate-300">cocs_*</code> keys.
        </p>
      </div>

      {/* Right Auth Panel */}
      <div className="flex flex-1 items-center justify-center p-6 sm:p-10 lg:p-14">
        <div className="w-full max-w-md space-y-6">
          {/* Quick One-Click Demo Logins */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-bold text-slate-900">One-Click Demo Access</h2>
            <p className="mt-1 text-xs text-slate-500">
              Switch immediately into any pre-seeded role to test the complete workflow.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleDemoLogin(UserRole.CUSTOMER)}
                className="flex flex-col items-start rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-left hover:border-blue-600 hover:bg-blue-50/50 transition-colors cursor-pointer disabled:opacity-50"
              >
                <span className="text-xs font-bold text-[#0f2547]">Customer</span>
                <span className="mt-0.5 text-[11px] text-slate-500">Aarav Mehta</span>
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleDemoLogin(UserRole.AGENT)}
                className="flex flex-col items-start rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-left hover:border-blue-600 hover:bg-blue-50/50 transition-colors cursor-pointer disabled:opacity-50"
              >
                <span className="text-xs font-bold text-[#0f2547]">Support Agent</span>
                <span className="mt-0.5 text-[11px] text-slate-500">Maya Lin</span>
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleDemoLogin(UserRole.ADMIN)}
                className="flex flex-col items-start rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-left hover:border-blue-600 hover:bg-blue-50/50 transition-colors cursor-pointer disabled:opacity-50"
              >
                <span className="text-xs font-bold text-[#0f2547]">Administrator</span>
                <span className="mt-0.5 text-[11px] text-slate-500">Nathaniel Cole</span>
              </button>
            </div>
          </div>

          {/* Standard Sign In / Register Card */}
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError('');
                }}
                className={`flex-1 rounded-md py-2 text-xs font-semibold transition-colors cursor-pointer ${
                  mode === 'login'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setError('');
                }}
                className={`flex-1 rounded-md py-2 text-xs font-semibold transition-colors cursor-pointer ${
                  mode === 'register'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                New Customer Registration
              </button>
            </div>

            {error && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700">
                {error}
              </div>
            )}

            {mode === 'login' ? (
              <form onSubmit={handleLogin} className="mt-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="aarav.mehta@example.com"
                    className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Password
                  </label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password (demo: password123)"
                    className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0f2547] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#17345e] transition-colors cursor-pointer disabled:opacity-50"
                >
                  <span>{submitting ? 'Signing in...' : 'Sign In'}</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </form>
            ) : (
              <form onSubmit={handleRegister} className="mt-5 space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder="Jordan Hayes"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="jordan@example.com"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    required
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    placeholder="+1 (415) 555-0199"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Password
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0f2547] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#17345e] transition-colors cursor-pointer disabled:opacity-50"
                >
                  <span>{submitting ? 'Creating Account...' : 'Create Customer Account'}</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
