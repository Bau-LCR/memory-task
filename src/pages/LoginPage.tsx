import { useEffect, useState } from 'react'
import { api } from '../services/api'
import { isSupabaseConfigured } from '../lib/supabase'
import { go, useSession } from '../app/session'
import { Button, Card, Logo } from '../components/ui'

export function LoginPage() {
  const { session, refresh } = useSession()
  useEffect(() => {
    if (session && !session.demo) go(session.mode ? (session.mode === 'personal' ? '/panel' : '/servicio') : '/modo')
  }, [session])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const enter = async () => {
    setBusy(true)
    setError('')
    try {
      await api.signInDemo()
      await refresh()
      go('/modo')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo iniciar la sesión.')
    } finally {
      setBusy(false)
    }
  }
  const google = async () => {
    setBusy(true)
    setError('')
    try {
      await api.signInWithGoogle()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo iniciar sesión con Google.')
      setBusy(false)
    }
  }
  return (
    <div className="grid min-h-screen place-items-center bg-slate-100 p-4">
      <Card className="w-full max-w-md space-y-4">
        <Logo />
        <h1 className="text-xl font-bold text-navy">Iniciar sesión</h1>
        <Button variant="ghost" disabled={busy || !isSupabaseConfigured} className="w-full" onClick={google} title={!isSupabaseConfigured ? 'Falta configurar Supabase en el entorno' : 'Continuar con Google'}>{isSupabaseConfigured ? 'Continuar con Google' : 'Google (pendiente de configuración)'}</Button>
        {!isSupabaseConfigured && <p className="text-xs text-slate-500">Google estará disponible cuando Supabase esté configurado en el entorno de publicación y el proveedor Google esté habilitado.</p>}
        <Button className="w-full" disabled={busy} onClick={enter}>Entrar en modo demostración</Button>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</p>}
        <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">Modo demostración: no se verifica ninguna identidad ni se guardan contraseñas. Los datos quedan solo en este navegador.</p>
        <a href="#/" className="block text-center text-sm text-brand hover:underline">Volver al inicio</a>
      </Card>
    </div>
  )
}
