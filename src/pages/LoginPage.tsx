import { useState } from 'react'
import { api } from '../services/api'
import { go, useSession } from '../app/session'
import { Button, Card, Logo } from '../components/ui'

export function LoginPage() {
  const { refresh } = useSession()
  const [busy, setBusy] = useState(false)
  const enter = async () => {
    setBusy(true)
    await api.signInDemo()
    await refresh()
    go('/modo')
  }
  return (
    <div className="grid min-h-screen place-items-center bg-slate-100 p-4">
      <Card className="w-full max-w-md space-y-4">
        <Logo />
        <h1 className="text-xl font-bold text-navy">Iniciar sesión</h1>
        <Button variant="ghost" disabled className="w-full" title="La autenticación con Google aún no está conectada">Continuar con Google · pendiente de conexión</Button>
        <Button className="w-full" disabled={busy} onClick={enter}>Entrar en modo demostración</Button>
        <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">Modo demostración: no se verifica ninguna identidad ni se guardan contraseñas. Los datos quedan solo en este navegador.</p>
        <a href="#/" className="block text-center text-sm text-brand hover:underline">Volver al inicio</a>
      </Card>
    </div>
  )
}
