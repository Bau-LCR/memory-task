import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Badge, Button, Card, inputCls } from '../components/ui'
import { fmtDate, fmtSize } from '../utils/format'

type AdminUser = { id: string; email: string; name: string; created_at: string; last_sign_in_at: string | null; role: 'super_admin' | 'admin' | 'user' }
type Overview = { total: number; users: AdminUser[] }
type Details = {
  user: Pick<AdminUser, 'id' | 'email' | 'name' | 'created_at' | 'last_sign_in_at'>
  usage: { usedBytes: number; quotaBytes: number }
  memories: Array<{ id: string; title: string; body: string; category: string; tags: string[]; created_at: string; updated_at: string }>
  files: Array<{ id: string; name: string; size_bytes: number; content_type: string; folder_id: string | null; created_at: string }>
  folders: Array<{ id: string; name: string; parent_id: string | null; created_at: string }>
  activity: Array<{ id: string; description: string; created_at: string }>
}
type AuditEntry = { id: string; actor_id: string; target_user_id: string | null; action: string; details: Record<string, unknown>; created_at: string }

async function adminCall<T>(body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Supabase no está configurado.')
  const { data, error } = await supabase.functions.invoke('admin-console', { body })
  if (error) throw new Error(error.message || 'No se pudo contactar con el panel administrativo.')
  if (data?.error) throw new Error(data.error)
  return data as T
}

export function AdminPage() {
  const [role, setRole] = useState<string>('checking')
  const [users, setUsers] = useState<AdminUser[]>([])
  const [total, setTotal] = useState(0)
  const [selected, setSelected] = useState<Details | null>(null)
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [quotaInput, setQuotaInput] = useState('50')

  const load = useCallback(async () => {
    setBusy(true); setError('')
    try {
      const access = await adminCall<{ role: string }>({ action: 'check_access' })
      setRole(access.role)
      if (access.role !== 'admin' && access.role !== 'super_admin') return
      const result = await adminCall<Overview>({ action: 'overview' })
      setUsers(result.users); setTotal(result.total)
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return users.filter(u => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.id.toLowerCase().includes(q))
  }, [users, query])

  const openUser = async (id: string) => {
    setBusy(true); setError(''); setNotice('')
    try {
      const data = await adminCall<Details>({ action: 'user_details', userId: id })
      setSelected(data)
      setQuotaInput(String(Math.round(data.usage.quotaBytes / 1048576)))
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }

  const changeRole = async (user: AdminUser, nextRole: 'admin' | 'user') => {
    const action = nextRole === 'admin' ? 'promover a administrador' : 'quitar el rol de administrador'
    if (!confirm(`¿Querés ${action} a ${user.email}?`)) return
    setBusy(true); setError(''); setNotice('')
    try {
      await adminCall({ action: 'set_role', userId: user.id, role: nextRole })
      setNotice('Rol actualizado correctamente.')
      await load()
      if (selected?.user.id === user.id) setSelected(null)
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }

  const openPrivateFile = async (fileId: string, userId: string) => {
    const popup = window.open('about:blank', '_blank')
    if (!popup) { setError('El navegador bloqueó la ventana. Permití ventanas emergentes para abrir el archivo.'); return }
    popup.opener = null
    setBusy(true); setError('')
    try {
      const result = await adminCall<{ signedUrl: string }>({ action: 'create_file_link', fileId, userId })
      popup.location.href = result.signedUrl
    } catch (e) {
      popup.close()
      setError((e as Error).message)
    } finally { setBusy(false) }
  }

  const setQuota = async () => {
    if (!selected) return
    const mb = Number(quotaInput)
    if (!Number.isInteger(mb) || mb < 50 || mb > 5120) { setError('Ingresá una cuota entre 50 y 5120 MiB.'); return }
    if (!confirm(`¿Asignar ${mb} MiB de almacenamiento personal a ${selected.user.email}?`)) return
    setBusy(true); setError(''); setNotice('')
    try {
      await adminCall({ action: 'set_personal_quota', userId: selected.user.id, quotaBytes: mb * 1048576 })
      setNotice('Cuota personal actualizada.')
      await openUser(selected.user.id)
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }

  const deleteMemory = async (memoryId: string, title: string) => {
    if (!selected || !confirm(`¿Eliminar definitivamente el recuerdo «${title}» de ${selected.user.email}?`)) return
    setBusy(true); setError('')
    try { await adminCall({ action: 'delete_user_memory', userId: selected.user.id, memoryId }); await openUser(selected.user.id); setNotice('Recuerdo eliminado y acción auditada.') }
    catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }

  const deleteUserFile = async (fileId: string, fileName: string) => {
    if (!selected || !confirm(`¿Eliminar definitivamente el archivo «${fileName}» de ${selected.user.email}?`)) return
    setBusy(true); setError('')
    try { await adminCall({ action: 'delete_user_file', userId: selected.user.id, fileId }); await openUser(selected.user.id); setNotice('Archivo eliminado y acción auditada.') }
    catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }

  const loadAudit = async () => {
    setBusy(true); setError('')
    try { const data = await adminCall<{ entries: AuditEntry[] }>({ action: 'audit_log' }); setAudit(data.entries) }
    catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }

  if (role === 'checking') return <p className="text-slate-500">Verificando permisos administrativos…</p>
  if (role !== 'admin' && role !== 'super_admin') return <Card title="Acceso restringido"><p className="text-sm text-slate-600">Tu cuenta no tiene permisos para acceder al panel administrativo.</p></Card>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold text-navy">Administración</h1><p className="mt-1 text-sm text-slate-500">Gestión de usuarios y datos con registro de auditoría.</p></div>
        <Badge tone={role === 'super_admin' ? 'blue' : 'gray'}>{role === 'super_admin' ? 'Administrador principal' : 'Administrador'}</Badge>
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card><p className="text-xs text-slate-500">Usuarios registrados</p><p className="text-2xl font-bold text-navy">{total}</p></Card>
        <Card><p className="text-xs text-slate-500">Administradores</p><p className="text-2xl font-bold text-navy">{users.filter(u => u.role === 'admin' || u.role === 'super_admin').length}</p></Card>
        <Card><p className="text-xs text-slate-500">Tu nivel</p><p className="text-lg font-bold text-navy">{role === 'super_admin' ? 'Principal' : 'Administrador'}</p></Card>
      </div>
      <Card title="Usuarios" action={<Button variant="ghost" onClick={() => void load()} disabled={busy}>Actualizar</Button>}>
        <input className={inputCls + ' mb-3'} value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar por nombre, correo o ID…" />
        <p className="mb-2 text-xs text-slate-500">Mostrando {visible.length} de {total} usuarios cargados.</p>
        {visible.length === 0 ? <p className="text-sm text-slate-500">No hay usuarios para mostrar.</p> : <ul className="divide-y divide-slate-100">{visible.map(user => (
          <li key={user.id} className="flex flex-wrap items-center gap-2 py-3">
            <div className="min-w-0 flex-1"><p className="font-medium text-navy">{user.name}</p><p className="truncate text-xs text-slate-500">{user.email} · Alta: {fmtDate(user.created_at)}</p></div>
            <Badge tone={user.role === 'super_admin' ? 'blue' : user.role === 'admin' ? 'amber' : 'gray'}>{user.role === 'super_admin' ? 'Principal' : user.role === 'admin' ? 'Admin' : 'Usuario'}</Badge>
            <Button variant="ghost" onClick={() => void openUser(user.id)} disabled={busy}>Ver datos</Button>
            {role === 'super_admin' && user.role !== 'super_admin' && (user.role === 'admin'
              ? <Button variant="danger" onClick={() => void changeRole(user, 'user')} disabled={busy}>Quitar admin</Button>
              : <Button onClick={() => void changeRole(user, 'admin')} disabled={busy}>Promover</Button>)}
          </li>
        ))}</ul>}
      </Card>
      {selected && <Card title={`Datos de ${selected.user.name}`} action={<Button variant="ghost" onClick={() => setSelected(null)}>Cerrar</Button>}>
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <p><strong>Correo:</strong> {selected.user.email}</p><p><strong>Alta:</strong> {fmtDate(selected.user.created_at)}</p>
          <p><strong>ID:</strong> <code className="break-all">{selected.user.id}</code></p>
          <p><strong>Último acceso:</strong> {selected.user.last_sign_in_at ? fmtDate(selected.user.last_sign_in_at) : 'Sin datos'}</p>
        </div>
        <div className="mt-4 rounded-lg bg-slate-50 p-3"><p className="font-semibold">Almacenamiento personal</p><p className="text-sm">{fmtSize(selected.usage.usedBytes)} de {fmtSize(selected.usage.quotaBytes)}</p>{role === 'super_admin' && <div className="mt-3 flex flex-wrap items-end gap-2"><label className="text-xs text-slate-600">Cuota en MiB<input className={inputCls + ' mt-1 w-32'} type="number" min="50" max="5120" step="1" value={quotaInput} onChange={e => setQuotaInput(e.target.value)} /></label><Button onClick={() => void setQuota()} disabled={busy}>Guardar cuota</Button></div>}<p className="mt-2 text-xs text-slate-500">La cuota es un límite lógico; no amplía el almacenamiento físico contratado por el proyecto.</p></div>
        <div className="mt-4"><h3 className="font-semibold">Recuerdos ({selected.memories.length})</h3>{selected.memories.length ? <ul className="mt-2 space-y-2">{selected.memories.map(m => <li key={m.id} className="rounded-lg border border-slate-200 p-3"><p className="font-medium">{m.title}</p><p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{m.body}</p><p className="mt-1 text-xs text-slate-400">{m.category} · {fmtDate(m.updated_at)}</p><Button variant="danger" className="mt-2" disabled={busy} onClick={() => void deleteMemory(m.id, m.title)}>Eliminar recuerdo</Button></li>)}</ul> : <p className="text-sm text-slate-500">No hay recuerdos.</p>}</div>
        <div className="mt-4"><h3 className="font-semibold">Archivos ({selected.files.length})</h3>{selected.files.length ? <ul className="mt-2 divide-y divide-slate-100">{selected.files.map(f => <li key={f.id} className="flex justify-between gap-2 py-2 text-sm"><span className="min-w-0 truncate">{f.name}</span><span className="shrink-0 text-slate-500">{fmtSize(Number(f.size_bytes))}</span><Button variant="ghost" onClick={() => void openPrivateFile(f.id, selected.user.id)} disabled={busy}>Abrir archivo</Button><Button variant="danger" onClick={() => void deleteUserFile(f.id, f.name)} disabled={busy}>Eliminar</Button></li>)}</ul> : <p className="text-sm text-slate-500">No hay archivos.</p>}</div>
        <div className="mt-4"><h3 className="font-semibold">Carpetas ({selected.folders.length})</h3><p className="text-sm text-slate-600">{selected.folders.map(f => f.name).join(' · ') || 'Sin carpetas'}</p></div>
        <div className="mt-4"><h3 className="font-semibold">Actividad reciente</h3><ul className="mt-2 space-y-1 text-sm text-slate-600">{selected.activity.map(a => <li key={a.id}>{a.description} · {fmtDate(a.created_at)}</li>)}</ul></div>
        <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">Esta consulta administrativa queda registrada en el historial de auditoría. Los archivos se muestran como metadatos; su contenido binario no se descarga desde esta vista.</p>
      </Card>}
      <Card title="Auditoría" action={<Button variant="ghost" onClick={() => void loadAudit()} disabled={busy}>Consultar registro</Button>}>
        {audit.length ? <ul className="divide-y divide-slate-100">{audit.map(entry => <li key={entry.id} className="py-2 text-sm"><p className="font-medium">{entry.action}</p><p className="text-xs text-slate-500">{fmtDate(entry.created_at)} · Actor: {entry.actor_id} · Usuario: {entry.target_user_id ?? '—'}</p></li>)}</ul> : <p className="text-sm text-slate-500">Consultá el registro para ver las últimas acciones administrativas.</p>}
      </Card>
    </div>
  )
}
