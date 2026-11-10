import { useState, type ReactNode } from 'react'
import { api } from '../../services/api'
import { go, useSession } from '../../app/session'
import { Button, DemoBadge, Logo, cx } from '../ui'
import type { Mode } from '../../types'

const NAV: Record<Mode, ReadonlyArray<readonly [string, string]>> = {
  personal: [['/panel', 'Panel'], ['/archivos', 'Archivos'], ['/recuerdos', 'Recuerdos'], ['/ajustes', 'Ajustes']],
  service: [['/servicio', 'Servicio'], ['/ajustes', 'Ajustes']],
}

export function Shell({ path, children }: { path: string; children: ReactNode }) {
  const { session, refresh } = useSession()
  const [open, setOpen] = useState(false)
  if (!session?.mode) return null
  const signOut = async () => { await api.signOut(); await refresh(); go('/') }
  return (
    <div className="min-h-screen md:flex">
      <aside className={cx(open ? 'block' : 'hidden', 'bg-navy p-4 text-slate-200 md:block md:w-60 md:shrink-0')}>
        <Logo light />
        <nav className="mt-6 space-y-1" aria-label="Principal">
          {NAV[session.mode].map(([to, label]) => (
            <a key={to} href={`#${to}`} onClick={() => setOpen(false)}
              className={cx('block rounded-lg px-3 py-2 text-sm transition motion-reduce:transition-none', path === to ? 'bg-brand text-white' : 'hover:bg-navy-800')}>
              {label}
            </a>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
          <button className="rounded-lg border px-3 py-1 text-sm md:hidden" onClick={() => setOpen((o) => !o)} aria-label="Menú">☰</button>
          <DemoBadge />
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden text-slate-600 sm:inline">{session.name}</span>
            <Button variant="ghost" onClick={signOut}>Salir</Button>
          </div>
        </header>
        <main className="mx-auto max-w-6xl space-y-5 p-4 md:p-6">{children}</main>
      </div>
    </div>
  )
}
