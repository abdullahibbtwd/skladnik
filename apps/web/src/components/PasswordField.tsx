import { Eye, EyeOff, Lock } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { cn } from '../lib/cn';

const fieldClass =
  'w-full rounded-lg border border-slate-200 bg-ops-canvas py-[0.7rem] pr-11 pl-10 font-sans text-[0.88rem] text-ops-ink outline-none transition-colors placeholder:text-slate-400 focus:border-ops-teal/50 focus:bg-white focus:ring-1 focus:ring-ops-teal/30';

export const textFieldClass =
  'w-full rounded-lg border border-slate-200 bg-ops-canvas py-[0.7rem] pr-[0.85rem] pl-10 font-sans text-[0.88rem] text-ops-ink outline-none transition-colors placeholder:text-slate-400 focus:border-ops-teal/50 focus:bg-white focus:ring-1 focus:ring-ops-teal/30';

type PasswordFieldProps = {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  placeholder?: string;
  required?: boolean;
};

export function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  placeholder = 'At least 8 characters',
  required = true,
}: PasswordFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <label htmlFor={inputId} className="mb-[0.35rem] block font-display text-[0.78rem] font-medium text-slate-500">
        {label}
      </label>
      <div className="relative">
        <div className="pointer-events-none absolute top-1/2 left-[0.85rem] -translate-y-1/2 text-slate-400">
          <Lock size={16} />
        </div>
        <input
          id={inputId}
          type={visible ? 'text' : 'password'}
          required={required}
          minLength={8}
          value={value}
          autoComplete={autoComplete}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className={fieldClass}
        />
        <button
          type="button"
          onClick={() => setVisible((open) => !open)}
          className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-white hover:text-ops-ink"
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  );
}

export { fieldClass };

export function FieldLabel({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-[0.35rem] block font-display text-[0.78rem] font-medium text-slate-500">
      {children}
    </label>
  );
}

export function FieldError({ children }: { children: ReactNode }) {
  return <p className={cn('mt-1.5 font-sans text-[0.75rem] text-ops-danger')}>{children}</p>;
}
