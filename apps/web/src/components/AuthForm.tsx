import React, { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, FileSpreadsheet, Mail, ShieldCheck, Store } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { SampleInvoice } from './HeroSection';
import { FieldError, FieldLabel, PasswordField, textFieldClass } from './PasswordField';
import { useLoginMutation, useSignupMutation } from '../lib/auth-session';

type AuthMode = 'signup' | 'login';

interface AuthFormProps {
  mode: AuthMode;
  onModeChange?: (mode: AuthMode) => void;
  pendingInvoice?: SampleInvoice | null;
  onSuccess: () => void;
  idPrefix: string;
  variant: 'page' | 'modal';
}

export const AuthForm: React.FC<AuthFormProps> = ({
  mode,
  onModeChange,
  pendingInvoice = null,
  onSuccess,
  idPrefix,
  variant,
}) => {
  const [storeName, setStoreName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const login = useLoginMutation();
  const signup = useSignupMutation();
  const loading = login.isPending || signup.isPending;

  useEffect(() => {
    setPassword('');
    setConfirmPassword('');
    setError(null);
  }, [mode]);

  const mismatch = mode === 'signup' && confirmPassword.length > 0 && password !== confirmPassword;
  const totalPcs = pendingInvoice ? pendingInvoice.items.reduce((sum, item) => sum + item.qty, 0) : 0;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (mode === 'signup' && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    try {
      if (mode === 'signup') {
        await signup.mutateAsync({
          email: email.trim(),
          password,
          name: storeName.trim(),
          companyName: storeName.trim(),
        });
      } else {
        await login.mutateAsync({ email: email.trim(), password });
      }
      onSuccess();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Something went wrong.');
    }
  };

  return (
    <div>
      <div className="mb-6">
        {mode === 'signup' ? (
          pendingInvoice ? (
            <>
              <h2 className="mb-1.5 font-display text-[1.35rem] leading-tight font-semibold tracking-tight text-ops-ink md:text-[1.5rem]">
                Save this inventory to your store
              </h2>
              <p className="font-sans text-[0.9rem] text-slate-500">Create your free account to continue.</p>
            </>
          ) : (
            <>
              <h2 className="mb-1.5 font-display text-[1.35rem] leading-tight font-semibold tracking-tight text-ops-ink md:text-[1.5rem]">
                Create your store account
              </h2>
              <p className="font-sans text-[0.9rem] text-slate-500">
                Digitize paper invoices and keep live stock in one place.
              </p>
            </>
          )
        ) : (
          <>
            <h2 className="mb-1.5 font-display text-[1.35rem] leading-tight font-semibold tracking-tight text-ops-ink md:text-[1.5rem]">
              Log in to your store
            </h2>
            <p className="font-sans text-[0.9rem] text-slate-500">Access inventory, FEFO alerts, and Annex 38 audits.</p>
          </>
        )}
      </div>

      {mode === 'signup' && pendingInvoice && (
        <div className="mb-6 rounded-[0.65rem] border border-ops-teal/20 bg-teal-50 px-4 py-[0.85rem]">
          <div className="mb-[0.35rem] flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <FileSpreadsheet size={15} color="#0D9488" />
              <span className="font-display text-[0.78rem] font-medium text-ops-teal">Scanned demo preserved</span>
            </div>
            <span className="rounded bg-white px-1.5 py-0.5 font-mono text-[0.7rem] font-medium text-ops-teal">
              {pendingInvoice.total}
            </span>
          </div>
          <div className="font-sans text-[0.78rem] font-medium text-ops-ink">
            {pendingInvoice.supplier} &bull; Inv: {pendingInvoice.invNumber}
          </div>
          <div className="mt-[0.35rem] flex items-center gap-1.5 font-sans text-[0.72rem] text-slate-500">
            <CheckCircle2 size={13} color="#0D9488" />
            <span>
              {pendingInvoice.items.length} lines ({totalPcs} units) will import into your dashboard.
            </span>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {mode === 'signup' && (
          <div>
            <FieldLabel htmlFor={`${idPrefix}-storeName`}>Store or business name</FieldLabel>
            <div className="relative">
              <div className="pointer-events-none absolute top-1/2 left-[0.85rem] -translate-y-1/2 text-slate-400">
                <Store size={16} />
              </div>
              <input
                id={`${idPrefix}-storeName`}
                type="text"
                required
                value={storeName}
                autoComplete="organization"
                placeholder="e.g. Metro Corner Grocery"
                onChange={(event) => setStoreName(event.target.value)}
                className={textFieldClass}
              />
            </div>
          </div>
        )}

        <div>
          <FieldLabel htmlFor={`${idPrefix}-email`}>Email address</FieldLabel>
          <div className="relative">
            <div className="pointer-events-none absolute top-1/2 left-[0.85rem] -translate-y-1/2 text-slate-400">
              <Mail size={16} />
            </div>
            <input
              id={`${idPrefix}-email`}
              type="email"
              required
              value={email}
              autoComplete="email"
              placeholder="manager@store.com"
              onChange={(event) => setEmail(event.target.value)}
              className={textFieldClass}
            />
          </div>
        </div>

        <PasswordField
          id={`${idPrefix}-password`}
          label="Password"
          value={password}
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          onChange={setPassword}
        />

        {mode === 'signup' && (
          <div>
            <PasswordField
              id={`${idPrefix}-confirm`}
              label="Confirm password"
              value={confirmPassword}
              autoComplete="new-password"
              placeholder="Re-enter your password"
              onChange={setConfirmPassword}
            />
            {mismatch && <FieldError>Passwords do not match.</FieldError>}
          </div>
        )}

        {error && <FieldError>{error}</FieldError>}

        <button
          type="submit"
          disabled={loading || mismatch}
          className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-ops-teal px-5 py-3 font-display text-[0.95rem] font-medium text-white shadow-[0_10px_24px_rgba(13,148,136,0.22)] transition-all hover:bg-ops-teal-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? (
            <span>{mode === 'signup' ? 'Creating your store…' : 'Signing in…'}</span>
          ) : mode === 'signup' ? (
            pendingInvoice ? (
              <>
                <FileSpreadsheet size={16} />
                Save inventory and open store
              </>
            ) : (
              <>
                <ArrowRight size={16} />
                Create free store account
              </>
            )
          ) : (
            <>
              <ShieldCheck size={16} />
              Log in to dashboard
            </>
          )}
        </button>
      </form>

      <div className="mt-5 border-t border-slate-100 pt-4 text-center font-sans text-[0.82rem] text-slate-500">
        {mode === 'signup' ? (
          <p>
            Already have an account?{' '}
            {onModeChange ? (
              <button type="button" onClick={() => onModeChange('login')} className="p-0 font-display font-medium text-ops-teal hover:underline">
                Log in
              </button>
            ) : (
              <Link to="/login" className="font-display font-medium text-ops-teal hover:underline">
                Log in
              </Link>
            )}
          </p>
        ) : (
          <p>
            Don&apos;t have an account yet?{' '}
            {onModeChange ? (
              <button type="button" onClick={() => onModeChange('signup')} className="p-0 font-display font-medium text-ops-teal hover:underline">
                Sign up free
              </button>
            ) : (
              <Link to="/signup" className="font-display font-medium text-ops-teal hover:underline">
                Sign up free
              </Link>
            )}
          </p>
        )}

        {variant === 'modal' && (
          <p className="mt-2.5">
            Prefer a full page?{' '}
            <Link to={mode === 'login' ? '/login' : '/signup'} className="font-display font-medium text-ops-accent hover:underline">
              Open {mode === 'login' ? 'login' : 'sign up'}
            </Link>
          </p>
        )}
      </div>
    </div>
  );
};
