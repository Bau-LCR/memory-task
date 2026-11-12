import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { Badge, Button, Card, inputCls } from '../components/ui'
import { fmtSize } from '../utils/format'

type ServiceApp = { id: string; name: string; description: string; status: string; created_at: string; objectCount: number; externalUserCount: number; usedBytes: number; categories: Record<string, { count: number; bytes: number }> }
type ServiceKey = { id: string; app_id: string; name: string; key_prefix: string; scopes: string[]; status: string; created_at: string; last_used_at: string | null }
type Overview = { account: { id: string; quotaBytes: number; usedBytes: number }; apps: ServiceApp[]; keys: ServiceKey[] }

async function callService<T>(body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Supabase no está configurado.')
  const { data, error } = await supabase.functions.invoke('service-console', { body })
  if (error) throw new Error(error.message || 'No se pudo contactar con el backend.')
  if (data?.error) throw new Error(data.error)
  return data as T
}

export function ServicesPage() {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [keyName, setKeyName] = useState('')
  const [keyAppId, setKeyAppId] = useState('')
  const [newSecret, setNewSecret] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [quotaInput, setQuotaInput] = useState('50')

  const load = useCallback(async () => {
    setBusy(true)
    setError('')
    try { const result = await callService<Overview>({ action: 'overview' }); setOverview(result); setQuotaInput(String(Math.round(result.account.quotaBytes / 1048576))) }
    catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  const saveQuota = async () => {
    const mb = Number(quotaInput)
    if (!Number.isInteger(mb) || mb < 50 || mb > 5120) { setError('La cuota debe estar entre 50 y 5120 MiB.'); return }
    if (!confirm(`¿Cambiar la cuota compartida de servicio a ${mb} MiB para todas tus aplicaciones?`)) return
    setBusy(true); setError(''); setNotice('')
    try {
      await callService({ action: 'set_quota', quotaBytes: mb * 1048576 })
      setNotice('Cuota compartida actualizada.')
      await load()
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }

  const createApp = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(''); setNotice('')
    try {
      await callService({ action: 'create_app', name, description })
      setName(''); setDescription(''); setNotice('Aplicación creada correctamente.')
      await load()
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }

  const createKey = async (e: FormEvent) => {
    e.preventDefault()
    if (!keyAppId) return
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await callService<{ secret: string }>({
        action: 'create_key', appId: keyAppId, name: keyName,
        scopes: ['records:read', 'records:write', 'files:read', 'files:write'],
      })
      setNewSecret(result.secret)
      setKeyName(''); setKeyAppId('')
      setNotice('Clave creada. Copiala ahora: no volverá a mostrarse.')
      await load()
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }

  const revokeKey = async (keyId: string) => {
    if (!confirm('¿Revocar esta clave? Las integraciones que la utilicen dejarán de autenticarse.')) return
    setBusy(true); setError('')
    try { await callService({ action: 'revoke_key', keyId }); setNotice('Clave revocada.'); await load() }
    catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }

  const copySecret = async () => {
    await navigator.clipboard.writeText(newSecret)
    setNotice('Clave copiada al portapapeles.')
  }

  const used = overview?.account.usedBytes ?? 0
  const quota = overview?.account.quotaBytes ?? 52428800
  const pct = quota ? Math.min(100, used / quota * 100) : 0

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold text-navy">Cuenta de servicio</h1><p className="mt-1 text-sm text-slate-500">Administrá tus aplicaciones, credenciales y consumo de almacenamiento.</p></div>
        <Badge tone="blue">Consola disponible</Badge>
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
      {newSecret && <Card title="Nueva clave API — guardala ahora">
        <p className="mb-2 text-sm text-amber-800">Esta es la única vez que se mostrará. No la compartas ni la publiques en código de navegador.</p>
        <code className="block break-all rounded bg-slate-100 p-3 text-sm">{newSecret}</code>
        <div className="mt-3 flex gap-2"><Button onClick={copySecret}>Copiar clave</Button><Button variant="ghost" onClick={() => setNewSecret('')}>Ya la guardé</Button></div>
      </Card>}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card><p className="text-xs text-slate-500">Aplicaciones</p><p className="text-2xl font-bold text-navy">{overview?.apps.length ?? '—'}</p></Card>
        <Card><p className="text-xs text-slate-500">Claves API activas</p><p className="text-2xl font-bold text-navy">{overview?.keys.filter(k => k.status === 'active').length ?? '—'}</p></Card>
        <Card><p className="text-xs text-slate-500">Almacenamiento compartido</p><p className="text-lg font-bold text-navy">{fmtSize(used)} / {fmtSize(quota)}</p><div className="mt-2 h-2 overflow-hidden rounded bg-slate-200"><div className="h-full bg-brand" style={{ width: pct + '%' }} /></div><div className="mt-3 flex flex-wrap items-end gap-2"><label className="text-xs text-slate-600">Cuota total en MiB<input className={inputCls + ' mt-1 w-32'} type="number" min="50" max="5120" step="1" value={quotaInput} onChange={e => setQuotaInput(e.target.value)} /></label><Button variant="ghost" onClick={() => void saveQuota()} disabled={busy}>Cambiar cuota</Button></div><p className="mt-2 text-xs text-slate-500">Límite lógico compartido entre todas tus aplicaciones. No amplía el espacio físico disponible en Supabase.</p></Card>
      </div>
      <Card title="Crear aplicación">
        <form onSubmit={createApp} className="grid gap-2 sm:grid-cols-2">
          <input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="Nombre de la aplicación" maxLength={80} required />
          <input className={inputCls} value={description} onChange={e => setDescription(e.target.value)} placeholder="Descripción (opcional)" maxLength={300} />
          <div><Button type="submit" disabled={busy || !name.trim()}>Crear aplicación</Button></div>
        </form>
      </Card>
      <Card title="Aplicaciones registradas" action={<Button variant="ghost" onClick={() => void load()} disabled={busy}>Actualizar</Button>}>
        {busy && !overview ? <p className="text-sm text-slate-500">Cargando…</p> : overview?.apps.length ? <ul className="divide-y divide-slate-100">{overview.apps.map(app => <li key={app.id} className="flex flex-wrap items-center gap-2 py-3"><div className="min-w-0 flex-1"><p className="font-medium text-navy">{app.name}</p><p className="text-xs text-slate-500">{app.description || 'Sin descripción'} · {app.id}</p><p className="mt-1 text-xs text-slate-600">{app.objectCount} registros · {app.externalUserCount} usuarios externos · {fmtSize(app.usedBytes)}</p>{Object.keys(app.categories || {}).length > 0 && <div className="mt-1 flex flex-wrap gap-2">{Object.entries(app.categories).map(([category, stat]) => <span key={category} className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">{category}: {stat.count} · {fmtSize(stat.bytes)}</span>)}</div>}</div><Badge tone={app.status === 'active' ? 'blue' : 'gray'}>{app.status}</Badge><Button variant="ghost" onClick={() => { setKeyAppId(app.id); setKeyName(app.name + ' — producción') }}>Generar clave</Button></li>)}</ul> : <p className="text-sm text-slate-500">Todavía no creaste aplicaciones.</p>}
      </Card>
      {keyAppId && <Card title="Generar clave API">
        <form onSubmit={createKey} className="flex flex-wrap gap-2">
          <input className={inputCls + ' min-w-48 flex-1'} value={keyName} onChange={e => setKeyName(e.target.value)} placeholder="Nombre de la clave" maxLength={80} required />
          <Button type="submit" disabled={busy || !keyName.trim()}>Generar</Button>
          <Button type="button" variant="ghost" onClick={() => setKeyAppId('')}>Cancelar</Button>
        </form>
        <p className="mt-2 text-xs text-slate-500">Permisos iniciales: lectura y escritura de registros y archivos. La clave se muestra una sola vez.</p>
      </Card>}
      <Card title="Claves API">
        {!overview?.keys.length ? <p className="text-sm text-slate-500">Todavía no hay claves generadas.</p> : <ul className="divide-y divide-slate-100">{overview.keys.map(key => <li key={key.id} className="flex flex-wrap items-center gap-2 py-3"><div className="min-w-0 flex-1"><p className="font-medium">{key.name}</p><p className="text-xs text-slate-500">{key.key_prefix}… · {key.scopes.join(', ')}</p></div><Badge tone={key.status === 'active' ? 'blue' : 'gray'}>{key.status === 'active' ? 'Activa' : 'Revocada'}</Badge>{key.status === 'active' && <Button variant="danger" onClick={() => void revokeKey(key.id)} disabled={busy}>Revocar</Button>}</li>)}</ul>}
      </Card>
      <Card title="API de registros">
        <p className="text-sm text-slate-600">La función de API ya está preparada en el repositorio. Después de desplegarla, tus servidores podrán guardar, consultar, listar y eliminar registros JSON por usuario externo y categoría.</p>
        <p className="mt-2 text-xs text-slate-500">Categorías previstas: usuarios, chats, documentos, imágenes (metadatos) y datos personalizados. Los archivos binarios tendrán un endpoint independiente.</p>
        <p className="mt-2 text-xs text-amber-800">Importante: la clave API debe permanecer en el backend de tu aplicación, nunca en una web pública ni en una APK. Tu servidor debe autenticar al usuario antes de enviar su identificador externo.</p>
      </Card>
      <p className="text-xs text-slate-500">La consola administra aplicaciones y credenciales. La API contempla carga y descarga privadas de archivos; esas operaciones quedarán activas al desplegar la función service-api y probarla.</p>
    </div>
  )
}
