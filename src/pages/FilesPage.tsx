import { useState, type FormEvent } from 'react'
import { api, MAX_FILE } from '../services/api'
import { useAsync } from '../hooks/useAsync'
import { Badge, Button, Card, inputCls } from '../components/ui'
import { FILE_CATEGORIES, categoryOf, download, fmtSize } from '../utils/format'
import type { Folder } from '../types'

export function FilesPage() {
  const [folderId, setFolderId] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('Todas')
  const [errors, setErrors] = useState<string[]>([])
  const [newName, setNewName] = useState<string | null>(null)
  const { data, reload } = useAsync(() => Promise.all([api.files(), api.folders()]))
  if (!data) return <p className="text-slate-500">Cargando…</p>
  const [files, folders] = data

  const path: Folder[] = []
  let cur = folders.find((x) => x.id === folderId)
  while (cur) { path.unshift(cur); const pid: string | null = cur.parentId; cur = folders.find((x) => x.id === pid) }

  const s = q.trim().toLowerCase()
  const visible = files.filter((f) => (s ? true : f.folderId === folderId) && (cat === 'Todas' || categoryOf(f.name, f.type) === cat) && f.name.toLowerCase().includes(s))
  const subs = s ? [] : folders.filter((f) => f.parentId === folderId)

  const run = async (fn: () => Promise<unknown>) => {
    try { await fn(); setErrors([]) } catch (e) { setErrors([(e as Error).message]) }
    reload()
  }
  const pick = async (input: HTMLInputElement) => {
    try {
      setErrors(await api.addFiles(Array.from(input.files ?? []), folderId))
    } catch (e) {
      setErrors([(e as Error).message])
    }
    input.value = ''
    reload()
  }
  const create = (e: FormEvent) => {
    e.preventDefault()
    run(async () => { await api.createFolder(newName ?? '', folderId); setNewName(null) })
  }
  const open = async (id: string, name: string) => { try { const b = await api.getFile(id); if (b) download(b, name) } catch (e) { setErrors([(e as Error).message]) } }

  return (
    <>
      <h1 className="text-2xl font-bold text-navy">Archivos</h1>
      <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">Los archivos se guardan en tu espacio privado de la nube. Cuota personal: 50 MB en total. Máximo {fmtSize(MAX_FILE)} por archivo.</p>
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <label className="cursor-pointer rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600">
            Seleccionar archivos
            <input type="file" multiple className="sr-only" onChange={(e) => pick(e.target)} />
          </label>
          <Button variant="ghost" onClick={() => setNewName('')}>Nueva carpeta</Button>
          <input className={`${inputCls} sm:ml-auto sm:max-w-xs`} placeholder="Buscar archivos…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar archivos" />
          <select className={`${inputCls} sm:w-44`} value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Categoría">
            {['Todas', ...FILE_CATEGORIES].map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        {newName !== null && (
          <form onSubmit={create} className="mt-3 flex gap-2">
            <input autoFocus className={inputCls} placeholder="Nombre de la carpeta" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <Button type="submit">Crear</Button>
            <Button type="button" variant="ghost" onClick={() => setNewName(null)}>Cancelar</Button>
          </form>
        )}
        {errors.length > 0 && <ul className="mt-3 space-y-1 text-sm text-red-600" role="alert">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
      </Card>
      <Card>
        <nav className="mb-3 flex flex-wrap items-center gap-1 text-sm" aria-label="Ruta">
          <button className="text-brand hover:underline" onClick={() => setFolderId(null)}>Raíz</button>
          {path.map((p) => <span key={p.id}>/ <button className="text-brand hover:underline" onClick={() => setFolderId(p.id)}>{p.name}</button></span>)}
        </nav>
        {subs.length > 0 && <div className="mb-3 flex flex-wrap gap-2">{subs.map((f) => <button key={f.id} onClick={() => setFolderId(f.id)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm transition hover:bg-slate-50">📁 {f.name}</button>)}</div>}
        {visible.length === 0 ? <p className="text-sm text-slate-500">No hay archivos que mostrar.</p> : (
          <ul className="divide-y divide-slate-100">
            {visible.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium">{f.name}</span>
                <Badge tone="gray">{categoryOf(f.name, f.type)}</Badge>
                <span className="w-20 text-right text-slate-500">{fmtSize(f.size)}</span>
                <select className="rounded border border-slate-300 px-2 py-1 text-xs" aria-label={`Mover ${f.name}`} value={f.folderId ?? ''} onChange={(e) => run(() => api.moveFile(f.id, e.target.value || null))}>
                  <option value="">Raíz</option>
                  {folders.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <Button variant="ghost" disabled={!api.hasFile(f.id)} title={api.hasFile(f.id) ? '' : 'El contenido no se conserva tras recargar la página'} onClick={() => open(f.id, f.name)}>Descargar</Button>
                <Button variant="danger" onClick={() => { if (confirm(`¿Eliminar "${f.name}"?`)) run(() => api.removeFile(f.id)) }}>Eliminar</Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}
