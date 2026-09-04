import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export function Card({ children, className = '', onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={`glass rounded-2xl ${className} ${onClick ? 'cursor-pointer' : ''}`}>
      {children}
    </div>
  );
}

export function PageHeader({ title, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
      {title ? <h2 className="text-xl font-semibold tracking-tight text-zinc-800">{title}</h2> : <div />}
      {action}
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  type = 'button',
  className = '',
  disabled = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  type?: 'button' | 'submit';
  className?: string;
  disabled?: boolean;
}) {
  const variants = {
    primary: 'bg-zinc-900 hover:bg-zinc-800 text-white shadow-sm',
    secondary: 'glass glass-hover text-zinc-700',
    ghost: 'hover:bg-zinc-200/50 text-zinc-600',
    danger: 'bg-zinc-100 hover:bg-zinc-200 text-zinc-600',
  };
  const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm' };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors ${variants[variant]} ${sizes[size]} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
    >
      {children}
    </button>
  );
}

export function Input({
  value,
  onChange,
  placeholder,
  type = 'text',
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  className?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full min-h-14 h-14 rounded-xl px-3.5 py-3 text-lg font-semibold leading-normal text-zinc-900 placeholder-zinc-400 glass-input ${className}`}
    />
  );
}

export function Select({
  value,
  onChange,
  options,
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full rounded-xl px-3 py-2 text-sm text-zinc-800 glass-input ${className}`}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

export function EmptyState({ icon: Icon, title, subtitle }: { icon: LucideIcon; title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl glass">
        <Icon className="h-6 w-6 text-zinc-400" />
      </div>
      <p className="font-medium text-zinc-600">{title}</p>
      {subtitle && <p className="mt-1 max-w-sm text-sm text-zinc-400">{subtitle}</p>}
    </div>
  );
}

export function Badge({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'high' | 'mid' | 'low' | 'fail' }) {
  const tones: Record<string, string> = {
    default: 'bg-zinc-100 text-zinc-600',
    high: 'bg-zinc-900 text-white',
    mid: 'bg-zinc-200 text-zinc-700',
    low: 'bg-zinc-100 text-zinc-500',
    fail: 'bg-zinc-100 text-zinc-400',
  };
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${tones[tone] ?? tones.default}`}>
      {children}
    </span>
  );
}

export function SubjectBadge({ shortName }: { shortName: string }) {
  return (
    <span className="inline-flex items-center rounded-md bg-zinc-200/60 px-2 py-0.5 text-xs font-medium text-zinc-600">
      {shortName}
    </span>
  );
}

export function gradeColor(grade: number | null): string {
  if (grade === null) return 'text-zinc-300';
  if (grade >= 85) return 'text-zinc-900';
  if (grade >= 80) return 'text-zinc-700';
  if (grade >= 75) return 'text-zinc-500';
  return 'text-zinc-400';
}
