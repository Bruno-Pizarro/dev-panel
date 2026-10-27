import type { InputHTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn';

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label: string;
  help?: string;
  value: string | number;
  onChange: (value: string) => void;
  mono?: boolean;
  status?: ReactNode;
}

export const Field = ({ label, help, value, onChange, mono = true, status, className, ...rest }: FieldProps) => (
  <label className="block">
    <span className="mb-1 flex items-center justify-between gap-3 font-medium">
      {label}
      {status}
    </span>
    {help && <span className="mb-2 block text-sm text-muted">{help}</span>}
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={cn('h-11 w-full rounded-lg border border-line bg-bg px-3.5 text-sm outline-none transition-colors placeholder:text-muted focus:border-accent/60', mono && 'font-mono', className)}
      {...rest}
    />
  </label>
);
