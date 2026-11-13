import { useEffect, useState, type ReactElement } from 'react'
import { api } from '../services/api'
import type { Session } from '../types'
import { SessionCtx, go } from './session'
import { supabase } from '../lib/supabase'
import { Shell } from '../components/layout/Shell'
import { LandingPage } from '../pages/LandingPage'
import { LoginPage } from '../pages/LoginPage'
import { ModePage } from '../pages/ModePage'
import { DashboardPage } from '../pages/DashboardPage'
import { FilesPage } from '../pages/FilesPage'
import { MemoriesPage } from '../pages/MemoriesPage'
import { ServicesPage } from '../pages/ServicesPage'
import { SettingsPage } from '../pages/SettingsPage'
import { AdminPage } from '../pages/AdminPage'
import { AssistantPage } from '../pages/AssistantPage'

function useHash() {
  const read = () => window.location.hash.slice(1) || '/'
  const [h, setH] = useState(read)
  useEffect(() => {
    const f = () => setH(read())
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])
  return h
}

function Redirect({ to }: { to: string }) {
  useEffect(() => { go(to) }, [to])
  return null
}


type LegalDoc = { version: string; title: string; content: string }
type ConsentState = { terms: LegalDoc; privacy: LegalDoc }
function ConsentGate({ email, children }: { email: string; children: ReactElement }) {
  const [docs, setDocs] = useState<ConsentState | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [accepted, setAccepted] = useState(false)
  const [busy, setBusy] = useState(false)
  const load = async () => {
    setLoading(true); setError('')
    try {
      if (!supabase) throw new Error('Supabase no está configurado.')
      const { data, error } = await supabase.functions.invoke('account-consent', { body: { action: 'status' } })
      if (error) throw new Error(error.message || 'No se pudo verificar el consentimiento.')
      if (data?.error) throw new Error(data.error)
      setDocs(data.required ? { terms: data.terms, privacy: data.privacy } : null)
    } catch (e) { setError((e as Error).message) }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [email])
  const decline = async () => {
    if (supabase) await supabase.auth.signOut()
    go('/login')
  }
  const accept = async () => {
    if (!docs || !accepted || !supabase) return
    setBusy(true); setError('')
    try {
      const { data, error } = await supabase.functions.invoke('account-consent', {
        body: { action: 'accept', termsVersion: docs.terms.version, privacyVersion: docs.privacy.version },
      })
      if (error) throw new Error(error.message || 'No se pudo guardar la aceptación.')
      if (data?.error) throw new Error(data.error)
      setDocs(null)
    } catch (e) { setError((e as Error).message); await load() }
    finally { setBusy(false) }
  }
  if (loading) return <div className="grid min-h-screen place-items-center p-6 text-sm text-slate-500">Verificando términos y privacidad…</div>
  if (error && !docs) return <div className="grid min-h-screen place-items-center bg-slate-50 p-5"><div className="w-full max-w-lg rounded-xl border bg-white p-6"><h1 className="text-xl font-bold text-navy">No se pudo verificar tu aceptación</h1><p className="mt-2 text-sm text-red-700">{error}</p><div className="mt-4 flex flex-wrap gap-2"><button className="rounded-lg bg-brand px-4 py-2 text-sm text-white" onClick={() => void load()}>Reintentar</button><button className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700" onClick={() => void decline()}>Cerrar sesión</button></div></div></div>
  if (!docs) return children
  return <div className="fixed inset-0 z-[100] overflow-y-auto bg-slate-100 p-4 sm:p-8">
    <div className="mx-auto max-w-3xl space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xl sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-widest text-brand">Memory Task · Revisión requerida</p>
      <h1 className="text-2xl font-bold text-navy">Antes de continuar</h1>
      <p className="text-sm text-slate-600">Actualizamos la información sobre el uso del servicio y el tratamiento de los datos. Leé ambos documentos; la aceptación queda asociada a tu cuenta y a estas versiones.</p>
      <section className="rounded-xl border border-slate-200 p-4">
        <div className="flex items-center justify-between gap-2"><h2 className="font-semibold text-navy">{docs.terms.title}</h2><span className="text-xs text-slate-500">Versión {docs.terms.version}</span></div>
        <div className="mt-3 max-h-52 overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-slate-700">{docs.terms.content}</div>
      </section>
      <section className="rounded-xl border border-slate-200 p-4">
        <div className="flex items-center justify-between gap-2"><h2 className="font-semibold text-navy">{docs.privacy.title}</h2><span className="text-xs text-slate-500">Versión {docs.privacy.version}</span></div>
        <div className="mt-3 max-h-52 overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-slate-700">{docs.privacy.content}</div>
      </section>
      <label className="flex items-start gap-3 text-sm text-slate-700"><input type="checkbox" className="mt-1" checked={accepted} onChange={e => setAccepted(e.target.checked)} /><span>Leí y acepto los Términos de uso y el Aviso de privacidad de las versiones indicadas.</span></label>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap gap-2"><button disabled={!accepted || busy} onClick={() => void accept()} className="rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Guardando…' : 'Aceptar y continuar'}</button><button disabled={busy} onClick={() => void decline()} className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700">No aceptar y cerrar sesión</button></div>
      <p className="text-xs text-slate-500">Si no aceptás, podés cerrar sesión. Cuando publiquemos una nueva versión, volveremos a solicitar la aceptación.</p>
    </div>
  </div>
}

export default function App() {
  const path = useHash()
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const refresh = async () => setSession(await api.session())
  useEffect(() => {
    let active = true
    // Suscribirse antes de consultar la sesión evita perder un cambio de autenticación
    // que ocurra mientras Supabase procesa el retorno OAuth.
    const subscription = supabase?.auth.onAuthStateChange(() => {
      Promise.resolve().then(() => { if (active) void refresh() })
    }).data.subscription
    refresh().finally(() => { if (active) setReady(true) })
    return () => {
      active = false
      subscription?.unsubscribe()
    }
  }, [])

  let view: ReactElement
  if (!ready) view = <p className="p-8 text-slate-500">Cargando…</p>
  else if (path === '/' && session && !session.demo) view = <Redirect to={session.mode ? (session.mode === 'personal' ? '/panel' : '/servicio') : '/modo'} />
  else if (path === '/') view = <LandingPage />
  else if (path === '/login') view = <LoginPage />
  else if (!session) view = <Redirect to="/login" />
  else if (!session.mode) view = path === '/modo' ? <ModePage /> : <Redirect to="/modo" />
  else {
    const home = session.mode === 'personal' ? '/panel' : '/servicio'
    const pages: Record<string, ReactElement> =
      session.mode === 'personal'
        ? { '/panel': <DashboardPage />, '/archivos': <FilesPage />, '/recuerdos': <MemoriesPage />, '/ajustes': <SettingsPage />, '/asistente': <AssistantPage />, '/admin': <AdminPage /> }
        : { '/servicio': <ServicesPage />, '/ajustes': <SettingsPage />, '/asistente': <AssistantPage />, '/admin': <AdminPage /> }
    view = pages[path] ? <Shell path={path}>{pages[path]}</Shell> : <Redirect to={home} />
  }
  const content = session && !session.demo ? <ConsentGate key={session.email} email={session.email}>{view}</ConsentGate> : view
  return <SessionCtx.Provider value={{ session, refresh }}><div className="min-h-screen">{content}<footer className="border-t border-slate-200 bg-white px-4 py-4 text-center text-xs text-slate-500">© {new Date().getFullYear()} Memory Task. Todos los derechos reservados.</footer></div></SessionCtx.Provider>
}
