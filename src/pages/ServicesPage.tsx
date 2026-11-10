import { Bar, Badge, Card, Pending } from '../components/ui'
import { SERVICE_SECTIONS, SERVICE_STATS, SERVICE_USAGE } from '../features/service-accounts/demoData'

export function ServicesPage() {
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-navy">Cuenta de servicio</h1>
        <Badge tone="amber">Ilustrativo: sin backend</Badge>
      </div>
      <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">Todo lo que ves aquí es de ejemplo. La cuenta de servicio todavía no tiene backend: no se crean espacios, usuarios ni claves reales, y los botones se activarán cuando exista la conexión.</p>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {SERVICE_STATS.map(([k, v]) => <Card key={k}><p className="text-xs text-slate-500">{k}</p><p className="text-2xl font-bold text-navy">{v}</p></Card>)}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {SERVICE_SECTIONS.map((s) => (
          <Card key={s.title} title={s.title} action={<Pending>{s.action}</Pending>}>
            <ul className="space-y-1 text-sm text-slate-600">{s.items.map((i) => <li key={i}>{i}</li>)}</ul>
          </Card>
        ))}
        <Card title="Consumo y estadísticas">
          <div className="space-y-3">{SERVICE_USAGE.map(([k, v]) => <div key={k}><p className="mb-1 text-xs text-slate-500">{k} · {v} %</p><Bar value={v} /></div>)}</div>
        </Card>
      </div>
    </>
  )
}
