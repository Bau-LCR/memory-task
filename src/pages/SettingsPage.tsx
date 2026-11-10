import { api } from '../services/api'
import { useAsync } from '../hooks/useAsync'
import { go, useSession } from '../app/session'
import { Bar, Button, Card, Pending, inputCls } from '../components/ui'
import { download, fmtSize } from '../utils/format'
import type { Mode } from '../types'

export function SettingsPage() {
  const { session, refresh } = useSession()
  const { data: u } = useAsync(() => api.usage())
  if (!session?.mode) return null
  const other: Mode = session.mode === 'personal' ? 'service' : 'personal'
  const switchMode = async () => { await api.setMode(other); await refresh(); go(other === 'personal' ? '/panel' : '/servicio') }
  const exportData = async () => download(new Blob([JSON.stringify(await api.exportAll(), null, 2)], { type: 'application/json' }), 'memory-task-export.json')
  const reset = async () => { if (confirm('Esta acción solo reinicia datos locales de demostración. Los datos de la nube no se borrarán. ¿Continuar?')) { await api.resetDemo(); await refresh(); go('/') } }
  const signOut = async () => { await api.signOut(); await refresh(); go('/') }
  return (
    <>
      <h1 className="text-2xl font-bold text-navy">Ajustes</h1>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Perfil">
          <input className={inputCls} readOnly value={session.name} aria-label="Nombre" />
          <input className={`${inputCls} mt-2`} readOnly value={session.email} aria-label="Correo" />
          <p className="mt-2 text-xs text-slate-500">Perfil autenticado con Google.</p>
        </Card>
        <Card title="Modalidad de cuenta">
          <p className="text-sm">Actual: <strong>{session.mode === 'personal' ? 'Cuenta personal' : 'Cuenta de servicio'}</strong></p>
          <Button variant="ghost" className="mt-3" onClick={switchMode}>Cambiar a {other === 'personal' ? 'cuenta personal' : 'cuenta de servicio'}</Button>
        </Card>
        <Card title="Almacenamiento">
          {u ? <><Bar value={(u.used / u.quota) * 100} /><p className="mt-2 text-sm">{fmtSize(u.used)} de {fmtSize(u.quota)} (cuota personal en la nube)</p></> : <p className="text-sm text-slate-500">Cargando…</p>}
        </Card>
        <Card title="Preferencias">
          <p className="text-sm text-slate-600">Las animaciones respetan la preferencia del sistema (<code>prefers-reduced-motion</code>). No hay más preferencias por ahora.</p>
        </Card>
        <Card title="Seguridad">
          <p className="text-sm text-slate-600">Sin autenticación real: la sesión es de demostración y no hay contraseñas. El aislamiento entre cuentas, la autorización y las pruebas de seguridad se implementan en el backend antes de usar datos reales.</p>
        </Card>
        <Card title="Sesiones">
          <p className="text-sm text-slate-600">Sesión autenticada.</p>
          <Button variant="ghost" className="mt-3" onClick={signOut}>Cerrar sesión</Button>
        </Card>
        <Card title="Inteligencia artificial">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled /> Activar asistente de IA</label>
          <p className="mt-2 text-xs text-slate-500">Desactivada: no hay proveedor configurado. Se habilitará con una interfaz de proveedores intercambiables y límites de uso.</p>
          <div className="mt-2"><Pending>Configurar proveedor</Pending></div>
        </Card>
        <Card title="Exportación y datos">
          <p className="text-sm text-slate-600">Exporta tus recuerdos y los metadatos de tus archivos en JSON.</p>
          <div className="mt-3 flex flex-wrap gap-2"><Button onClick={exportData}>Exportar datos</Button><Button variant="danger" onClick={reset}>Reiniciar datos locales</Button></div>
        </Card>
      </div>
    </>
  )
}
