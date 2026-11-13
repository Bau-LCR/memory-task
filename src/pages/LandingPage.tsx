import { Button, Logo } from '../components/ui'
import { go } from '../app/session'

const MODES = [
  { title: 'Cuenta personal', text: 'Un espacio privado para guardar archivos, organizar carpetas, crear recuerdos y consultar tu información cuando la necesites.', icon: '◫' },
  { title: 'Cuenta de servicio', text: 'Conectá aplicaciones mediante credenciales propias y almacená datos separados por aplicación y usuario externo.', icon: '⌘' },
  { title: 'Asistente inteligente', text: 'Una ayuda conversacional para pensar, organizar información y trabajar con tus ideas, con límites de uso configurables.', icon: '✳' },
]

const STEPS = [
  ['01', 'Conectá tu cuenta', 'Ingresá de forma segura y elegí si querés usar un espacio personal o conectar una aplicación.'],
  ['02', 'Organizá tus datos', 'Guardá archivos y recuerdos o enviá registros desde tu aplicación mediante una integración.'],
  ['03', 'Explorá y consultá', 'Encontrá contenido, revisá vistas previas y administrá los datos que tenés permiso para gestionar.'],
]

export function LandingPage() {
  return (
    <div className="min-h-screen overflow-hidden bg-[#07152f] text-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Logo light />
        <Button variant="ghost" className="!border-white/25 !bg-transparent !text-white hover:!bg-white/10" onClick={() => go('/login')}>Iniciar sesión</Button>
      </header>
      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-20 pt-12 md:grid-cols-[1.05fr_.95fr] md:pt-20">
          <div>
            <p className="text-xs font-semibold tracking-[.25em] text-sky-300">TU INFORMACIÓN, TUS ESPACIOS, TU MEMORIA</p>
            <h1 className="mt-5 max-w-2xl text-4xl font-bold leading-tight md:text-6xl">Una memoria digital para personas y aplicaciones.</h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-slate-300">Memory Task reúne almacenamiento privado, organización de información e integración para aplicaciones en una plataforma clara y flexible.</p>
            <div className="mt-8 flex flex-wrap gap-3"><Button className="px-6 py-3" onClick={() => go('/login')}>Comenzar</Button><a href="#como-funciona" className="rounded-lg border border-white/20 px-5 py-3 text-sm font-medium text-white hover:bg-white/10">Conocer cómo funciona</a></div>
            <div className="mt-10 flex flex-wrap gap-5 text-xs text-slate-400"><span>Almacenamiento privado</span><span>Integraciones API</span><span>Control de acceso</span></div>
          </div>
          <div className="relative mx-auto w-full max-w-lg">
            <div className="absolute -inset-8 rounded-full bg-sky-500/10 blur-3xl" />
            <div className="relative rounded-3xl border border-white/10 bg-white/[.06] p-5 shadow-2xl backdrop-blur">
              <div className="flex items-center justify-between border-b border-white/10 pb-4"><div><p className="text-sm font-semibold">Memory Task</p><p className="text-xs text-slate-400">Centro de información</p></div><span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs text-emerald-200">Espacio privado</span></div>
              <div className="my-5 grid grid-cols-2 gap-3"><div className="rounded-xl bg-sky-300/10 p-4"><p className="text-2xl">▤</p><p className="mt-2 text-sm font-semibold">Archivos</p><p className="mt-1 text-xs text-slate-400">Documentos y medios</p></div><div className="rounded-xl bg-violet-300/10 p-4"><p className="text-2xl">✧</p><p className="mt-2 text-sm font-semibold">Recuerdos</p><p className="mt-1 text-xs text-slate-400">Notas y conocimiento</p></div></div>
              <div className="rounded-xl border border-white/10 bg-[#0b2042] p-4"><div className="flex items-center gap-2 text-xs text-slate-400"><span className="h-2 w-2 rounded-full bg-sky-300" /> Flujo de información</div><div className="mt-4 grid grid-cols-3 items-center gap-2 text-center text-xs"><div className="rounded-lg bg-white/5 p-3">Persona</div><div className="text-sky-300">→</div><div className="rounded-lg bg-white/5 p-3">Memory Task</div><div className="col-span-3 text-sky-300">↓</div><div className="rounded-lg bg-white/5 p-3">Archivos</div><div className="rounded-lg bg-white/5 p-3">Recuerdos</div><div className="rounded-lg bg-white/5 p-3">Apps</div></div></div>
              <p className="mt-4 text-center text-[11px] text-slate-500">Ilustración conceptual · no representa datos reales</p>
            </div>
          </div>
        </section>
        <section className="border-y border-white/10 bg-white/[.03]">
          <div className="mx-auto max-w-6xl px-6 py-16"><div className="max-w-2xl"><p className="text-xs font-semibold tracking-[.2em] text-sky-300">UNA PLATAFORMA, DISTINTOS USOS</p><h2 className="mt-3 text-3xl font-bold">Un lugar para organizar y conectar información.</h2><p className="mt-3 text-sm leading-6 text-slate-300">Cada modalidad tiene sus propios controles y espacios. Los datos se mantienen separados según la cuenta y los permisos asignados.</p></div><div className="mt-8 grid gap-4 md:grid-cols-3">{MODES.map(mode => <article key={mode.title} className="rounded-2xl border border-white/10 bg-[#0b2042] p-6"><span className="text-3xl text-sky-300">{mode.icon}</span><h3 className="mt-4 font-semibold text-white">{mode.title}</h3><p className="mt-2 text-sm leading-6 text-slate-300">{mode.text}</p></article>)}</div></div>
        </section>
        <section id="como-funciona" className="mx-auto max-w-6xl px-6 py-16"><div className="max-w-2xl"><p className="text-xs font-semibold tracking-[.2em] text-sky-300">CÓMO FUNCIONA</p><h2 className="mt-3 text-3xl font-bold">De la conexión a la consulta.</h2><p className="mt-3 text-sm leading-6 text-slate-300">El recorrido es sencillo: tu cuenta define el espacio, las herramientas organizan los datos y los permisos determinan qué se puede consultar o modificar.</p></div><div className="mt-9 grid gap-4 md:grid-cols-3">{STEPS.map((step, index) => <article key={step[0]} className="relative rounded-2xl border border-white/10 bg-white/[.04] p-6"><p className="text-sm font-bold tracking-widest text-sky-300">{step[0]}</p><h3 className="mt-3 font-semibold">{step[1]}</h3><p className="mt-2 text-sm leading-6 text-slate-300">{step[2]}</p>{index < 2 && <p className="mt-5 hidden text-sky-300 md:block">Siguiente paso →</p>}</article>)}</div></section>
        <section className="mx-auto max-w-6xl px-6 pb-20"><div className="rounded-3xl border border-sky-300/20 bg-gradient-to-br from-sky-400/10 to-violet-400/10 p-8 md:flex md:items-center md:justify-between md:p-10"><div><h2 className="text-2xl font-bold">Tu información, organizada en un solo lugar.</h2><p className="mt-2 max-w-xl text-sm text-slate-300">Empezá con tu cuenta y elegí la modalidad que mejor se adapte a tu proyecto.</p></div><Button className="mt-6 px-6 py-3 md:mt-0" onClick={() => go('/login')}>Entrar a Memory Task</Button></div><p className="mt-8 text-center text-xs text-slate-500">Memory Task · Almacenamiento privado y herramientas de organización. Las funciones disponibles dependen de la configuración del servicio.</p></section>
      </main>
    </div>
  )
}
