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

export default function App() {
  const path = useHash()
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const refresh = async () => setSession(await api.session())
  useEffect(() => {
    let active = true
    refresh().finally(() => { if (active) setReady(true) })
    const subscription = supabase?.auth.onAuthStateChange(() => {
      Promise.resolve().then(() => { if (active) void refresh() })
    }).data.subscription
    return () => {
      active = false
      subscription?.unsubscribe()
    }
  }, [])

  let view: ReactElement
  if (!ready) view = <p className="p-8 text-slate-500">Cargando…</p>
  else if (path === '/') view = <LandingPage />
  else if (path === '/login') view = <LoginPage />
  else if (!session) view = <Redirect to="/login" />
  else if (!session.mode) view = path === '/modo' ? <ModePage /> : <Redirect to="/modo" />
  else {
    const home = session.mode === 'personal' ? '/panel' : '/servicio'
    const pages: Record<string, ReactElement> =
      session.mode === 'personal'
        ? { '/panel': <DashboardPage />, '/archivos': <FilesPage />, '/recuerdos': <MemoriesPage />, '/ajustes': <SettingsPage /> }
        : { '/servicio': <ServicesPage />, '/ajustes': <SettingsPage /> }
    view = pages[path] ? <Shell path={path}>{pages[path]}</Shell> : <Redirect to={home} />
  }
  return <SessionCtx.Provider value={{ session, refresh }}>{view}</SessionCtx.Provider>
}
