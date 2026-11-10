import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { SOURCE_LABEL } from '../services/api'

export const cx = (...c: Array<string | false | undefined>) => c.filter(Boolean).join(' ')
export const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20'

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }
export function Button({ variant = 'primary', className, ...p }: BtnProps) {
  const v = {
    primary: 'bg-brand text-white hover:bg-brand-600',
    ghost: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100',
    danger: 'bg-red-600 text-white hover:bg-red-700',
  }[variant]
  return (
    <button
      {...p}
      className={cx('rounded-lg px-4 py-2 text-sm font-medium transition active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none', v, className)}
    />
  )
}

export const Pending = ({ children = 'Pendiente de conexión' }: { children?: ReactNode }) => (
  <Button variant="ghost" disabled title="Requiere backend: todavía no está conectado">{children}</Button>
)

export function Card({ title, action, children, className }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('rise rounded-xl border border-slate-200 bg-white p-5 shadow-sm', className)}>
      {(title || action) && (
        <header className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-navy">{title}</h2>
          {action}
        </header>
      )}
      {children}
    </section>
  )
}

export function Badge({ children, tone = 'blue' }: { children: ReactNode; tone?: 'blue' | 'amber' | 'gray' }) {
  const t = { blue: 'bg-sky-100 text-brand', amber: 'bg-amber-100 text-amber-800', gray: 'bg-slate-100 text-slate-600' }[tone]
  return <span className={cx('inline-block rounded-full px-2.5 py-0.5 text-xs font-medium', t)}>{children}</span>
}
export const DemoBadge = () => <Badge tone="amber">{SOURCE_LABEL}</Badge>

export function Bar({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value))
  return (
    <div className="h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx('h-full rounded-full transition-all duration-500 motion-reduce:transition-none', v > 90 ? 'bg-red-500' : v > 80 ? 'bg-amber-500' : 'bg-brand')} style={{ width: `${v}%` }} />
    </div>
  )
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/60 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className="rise max-h-[90vh] w-full max-w-lg overflow-auto rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-navy">{title}</h2>
          <button onClick={onClose} aria-label="Cerrar" className="text-slate-400 hover:text-slate-700">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Logo({ light }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="#1D4ED8" />
        <path d="M8 23V9l8 8 8-8v14" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className={cx('text-lg font-semibold tracking-tight', light ? 'text-white' : 'text-navy')}>Memory Task</span>
    </div>
  )
}
