import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export function Card({ children, className = '', onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={`hud-panel ${className} ${onClick ? 'cursor-pointer' : ''}`}>
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-[#e4e5e8]">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-[#6f747c]">{subtitle}</p>}
      </div>
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
    primary: 'bg-[#d7d8dc] hover:bg-white text-[#0b0c0e]',
    secondary: 'bg-white/5 hover:bg-white/8 text-[#c9cbd0]',
    ghost: 'hover:bg-white/5 text-[#8b8f96]',
    danger: 'bg-white/5 hover:bg-white/8 text-[#9a8f8f]',
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
      className={`w-full rounded-lg bg-white/4 px-3 py-2 text-sm text-[#e4e5e8] placeholder-[#5c6168] outline-none ring-0 focus:bg-white/6 ${className}`}
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
      className={`w-full rounded-lg bg-white/4 px-3 py-2 text-sm text-[#e4e5e8] outline-none ${className}`}
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
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-white/4">
        <Icon className="h-6 w-6 text-[#5c6168]" />
      </div>
      <p className="text-[#9aa0a6]">{title}</p>
      {subtitle && <p className="mt-1 max-w-sm text-sm text-[#5c6168]">{subtitle}</p>}
    </div>
  );
}

export function Badge({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'high' | 'mid' | 'low' | 'fail' }) {
  const tones: Record<string, string> = {
    default: 'bg-white/6 text-[#9aa0a6]',
    high: 'bg-[#d7d8dc] text-[#0b0c0e]',
    mid: 'bg-white/12 text-[#d7d8dc]',
    low: 'bg-white/8 text-[#8b8f96]',
    fail: 'bg-white/4 text-[#6f747c]',
  };
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${tones[tone] ?? tones.default}`}>
      {children}
    </span>
  );
}

export function SubjectBadge({ shortName }: { shortName: string }) {
  return (
    <span className="inline-flex items-center rounded-md bg-white/5 px-2 py-0.5 font-mono text-[11px] text-[#9aa0a6]">
      {shortName}
    </span>
  );
}

export function gradeColor(grade: number | null): string {
  if (grade === null) return 'text-[#3f4349]';
  if (grade >= 85) return 'text-[#e4e5e8]';
  if (grade >= 80) return 'text-[#c9cbd0]';
  if (grade >= 75) return 'text-[#8b8f96]';
  return 'text-[#6f747c]';
}
