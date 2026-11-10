import { Button, Logo } from '../components/ui'
import { go } from '../app/session'

const MODES = [
  ['Cuenta personal', 'Guarda archivos y recuerdos, organízalos en carpetas, etiquétalos, búscalos y consulta versiones anteriores.'],
  ['Cuenta de servicio', 'Usa Memory Task como memoria persistente de tu aplicación: espacios por usuario, sectores, API keys y consumo.'],
]

export function LandingPage() {
  return (
    <div className="min-h-screen bg-navy text-white">
      <header className="mx-auto flex max-w-5xl items-center justify-between p-6">
        <Logo light />
        <Button variant="ghost" className="!border-white/30 !bg-transparent !text-white hover:!bg-white/10" onClick={() => go('/login')}>Iniciar sesión</Button>
      </header>
      <section className="mx-auto max-w-5xl px-6 pb-16 pt-12">
        <p className="rise text-sm font-medium tracking-widest text-sky-400">TU INFORMACIÓN, TUS ESPACIOS, TU MEMORIA</p>
        <h1 className="rise mt-4 max-w-2xl text-4xl font-bold leading-tight md:text-5xl">Memoria y almacenamiento para personas y aplicaciones.</h1>
        <p className="rise mt-4 max-w-xl text-slate-300">Organiza tu información y conecta otras aplicaciones mediante una API propia.</p>
        <Button className="mt-8 px-6 py-3" onClick={() => go('/login')}>Comenzar</Button>
        <div className="mt-14 grid gap-4 md:grid-cols-2">
          {MODES.map(([t, d]) => (
            <div key={t} className="rise rounded-xl border border-white/10 bg-navy-800 p-5">
              <h2 className="font-semibold text-sky-300">{t}</h2>
              <p className="mt-2 text-sm text-slate-300">{d}</p>
            </div>
          ))}
        </div>
        <p className="mt-10 text-xs text-slate-400">Versión de desarrollo: funciona en tu navegador con datos de demostración. Aún no hay servidor ni cuentas reales, y el almacenamiento será limitado.</p>
      </section>
    </div>
  )
}
