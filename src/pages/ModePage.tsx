import { api } from '../services/api'
import { go, useSession } from '../app/session'
import { Button, Card, Logo } from '../components/ui'
import type { Mode } from '../types'

const OPTIONS: Array<{ mode: Mode; title: string; text: string }> = [
  { mode: 'personal', title: 'Cuenta personal', text: 'Archivos, carpetas, recuerdos, búsqueda y versiones.' },
  { mode: 'service', title: 'Cuenta de servicio', text: 'Espacios, usuarios externos, sectores y API keys para tu aplicación.' },
]

export function ModePage() {
  const { refresh } = useSession()
  const pick = async (m: Mode) => {
    await api.setMode(m)
    await refresh()
    go(m === 'personal' ? '/panel' : '/servicio')
  }
  return (
    <div className="grid min-h-screen place-items-center bg-slate-100 p-4">
      <div className="w-full max-w-2xl space-y-4">
        <Logo />
        <h1 className="text-2xl font-bold text-navy">¿Cómo quieres usar Memory Task?</h1>
        <div className="grid gap-4 sm:grid-cols-2">
          {OPTIONS.map((o) => (
            <Card key={o.mode} title={o.title} className="flex flex-col gap-4">
              <p className="flex-1 text-sm text-slate-600">{o.text}</p>
              <Button onClick={() => pick(o.mode)}>Elegir</Button>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
