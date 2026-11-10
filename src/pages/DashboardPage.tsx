import type { ReactNode } from 'react'
import { api } from '../services/api'
import { useAsync } from '../hooks/useAsync'
import { Bar, Card } from '../components/ui'
import { fmtDate, fmtSize } from '../utils/format'

const link = 'block rounded-lg border border-slate-200 px-3 py-2 text-sm text-brand transition hover:bg-slate-50'
const Empty = ({ children }: { children: ReactNode }) => <p className="text-sm text-slate-500">{children}</p>

export function DashboardPage() {
  const { data } = useAsync(() => Promise.all([api.usage(), api.files(), api.memories(), api.activity()]))
  if (!data) return <p className="text-slate-500">Cargando…</p>
  const [u, files, mems, act] = data
  const pct = (u.used / u.quota) * 100
  return (
    <>
      <h1 className="text-2xl font-bold text-navy">Panel personal</h1>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Almacenamiento" className="lg:col-span-2">
          <Bar value={pct} />
          <p className="mt-2 text-sm">{fmtSize(u.used)} de {fmtSize(u.quota)} · disponible {fmtSize(u.quota - u.used)}</p>
          <p className="mt-1 text-xs text-slate-500">{u.files} archivos · {u.folders} carpetas · {u.memories} recuerdos</p>
          {pct >= 80 && <p className="mt-2 text-sm text-amber-700">Superaste el 80 % de la cuota. Al llegar al 100 % no se podrán agregar archivos.</p>}
        </Card>
        <Card title="Accesos rápidos" className="space-y-2">
          <a className={link} href="#/archivos">Administrar archivos</a>
          <a className={link} href="#/recuerdos">Crear un recuerdo</a>
          <a className={link} href="#/ajustes">Ajustes y exportación</a>
        </Card>
        <Card title="Archivos recientes">
          {files.length ? <ul className="space-y-1 text-sm">{files.slice(0, 5).map((f) => <li key={f.id} className="flex justify-between gap-2"><span className="truncate">{f.name}</span><span className="text-slate-500">{fmtSize(f.size)}</span></li>)}</ul> : <Empty>Aún no hay archivos.</Empty>}
        </Card>
        <Card title="Recuerdos recientes">
          {mems.length ? <ul className="space-y-1 text-sm">{mems.slice(0, 5).map((m) => <li key={m.id} className="truncate">{m.title}</li>)}</ul> : <Empty>Aún no hay recuerdos.</Empty>}
        </Card>
        <Card title="Actividad reciente">
          {act.length ? <ul className="space-y-1 text-xs">{act.slice(0, 6).map((a) => <li key={a.id}>{a.text} <span className="text-slate-400">· {fmtDate(a.at)}</span></li>)}</ul> : <Empty>Sin actividad.</Empty>}
        </Card>
        <Card title="Asistente de IA" className="lg:col-span-3">
          <Empty>Desactivado: no hay ningún proveedor de IA configurado. Es una función opcional y se configura en <a className="text-brand underline" href="#/ajustes">Ajustes</a>.</Empty>
        </Card>
      </div>
    </>
  )
}
