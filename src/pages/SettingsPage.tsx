import { useEffect, useState } from 'react'
import { api } from '../services/api'
import { useAsync } from '../hooks/useAsync'
import { go, useSession } from '../app/session'
import { Bar, Button, Card, Pending, inputCls } from '../components/ui'
import { download, fmtSize } from '../utils/format'
import type { Mode } from '../types'

export function SettingsPage() {
  const { session, refresh } = useSession()
  const [reduceMotion, setReduceMotion] = useState(() => {
    const saved = localStorage.getItem('mt_reduce_motion')
    return saved === null ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : saved === 'true'
  })
  const [largeText, setLargeText] = useState(() => localStorage.getItem('mt_large_text') === 'true')
  const [compact, setCompact] = useState(() => localStorage.getItem('mt_compact_layout') === 'true')
  const [highContrast, setHighContrast] = useState(() => localStorage.getItem('mt_high_contrast') === 'true')
  useEffect(() => {
    document.documentElement.classList.toggle('mt-reduced-motion', reduceMotion)
    localStorage.setItem('mt_reduce_motion', String(reduceMotion))
  }, [reduceMotion])
  useEffect(() => {
    document.documentElement.classList.toggle('mt-large-text', largeText)
    document.documentElement.classList.toggle('mt-compact-layout', compact)
    document.documentElement.classList.toggle('mt-high-contrast', highContrast)
    localStorage.setItem('mt_large_text', String(largeText))
    localStorage.setItem('mt_compact_layout', String(compact))
    localStorage.setItem('mt_high_contrast', String(highContrast))
  }, [largeText, compact, highContrast])
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
          {session.mode === 'service' ? <p className="text-sm text-slate-600">Cuota independiente inicial de 50 MiB, compartida entre las aplicaciones. El bucket privado ya está creado; todavía falta implementar y probar las operaciones de archivos de la API de servicio.</p> : u ? <><Bar value={(u.used / u.quota) * 100} /><p className="mt-2 text-sm">{fmtSize(u.used)} de {fmtSize(u.quota)} (cuota personal en la nube)</p></> : <p className="text-sm text-slate-500">Cargando…</p>}
        </Card>
        <Card title="Preferencias">
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={reduceMotion} onChange={e => setReduceMotion(e.target.checked)} /> Reducir animaciones</label>
            <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={largeText} onChange={e => setLargeText(e.target.checked)} /> Texto ligeramente más grande</label>
            <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={compact} onChange={e => setCompact(e.target.checked)} /> Diseño compacto (menos espacios)</label>
            <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={highContrast} onChange={e => setHighContrast(e.target.checked)} /> Mayor contraste de texto</label>
          </div>
          <p className="mt-3 text-xs text-slate-500">Las preferencias se guardan en este navegador y no modifican tus datos de cuenta. Reducir animaciones respeta inicialmente la preferencia del sistema.</p>
        </Card>
        <Card title="Seguridad">
          <p className="text-sm text-slate-600">La identidad se verifica con Google y las tablas personales aplican políticas RLS para aislar los datos por usuario. La seguridad debe seguir verificándose antes de almacenar información sensible.</p>
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
          <div className="mt-3 flex flex-wrap gap-2"><Button onClick={exportData}>Exportar datos</Button>{session.demo && <Button variant="danger" onClick={reset}>Reiniciar datos locales</Button>}</div>
        </Card>
      </div>
    </>
  )
}
