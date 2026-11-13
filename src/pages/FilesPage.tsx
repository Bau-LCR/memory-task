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
  const [preview, setPreview] = useState<{ name: string; type: string; url: string; text?: string; note?: string } | null>(null)
  const [previewBusy, setPreviewBusy] = useState(false)
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
  const previewFile = async (id: string, name: string, type: string) => {
    setPreviewBusy(true); setErrors([])
    try {
      const blob = await api.getFile(id)
      if (!blob) throw new Error('No se pudo obtener el archivo.')
      const lower = name.toLowerCase()
      const mime = type || blob.type || 'application/octet-stream'
      if (lower.endsWith('.docx')) {
        const buffer = await blob.arrayBuffer()
        const view = new DataView(buffer)
        let offset = 0, xml = ''
        while (offset + 30 < view.byteLength) {
          if (view.getUint32(offset, true) !== 0x04034b50) break
          const method = view.getUint16(offset + 8, true)
          const compressedSize = view.getUint32(offset + 18, true)
          const nameLength = view.getUint16(offset + 26, true)
          const extraLength = view.getUint16(offset + 28, true)
          const fileName = new TextDecoder().decode(new Uint8Array(buffer, offset + 30, nameLength))
          const dataStart = offset + 30 + nameLength + extraLength
          if (fileName === 'word/document.xml') {
            const compressed = new Uint8Array(buffer, dataStart, compressedSize)
            let raw: Uint8Array
            if (method === 0) raw = compressed
            else if (method === 8) raw = new Uint8Array(await new Response(new Blob([compressed.buffer.slice(compressed.byteOffset, compressed.byteOffset + compressed.byteLength) as ArrayBuffer]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer())
            else throw new Error('Este tipo de compresión DOCX no es compatible con la vista previa.')
            xml = new TextDecoder().decode(raw); break
          }
          offset = dataStart + compressedSize
        }
        if (!xml) throw new Error('No se encontró el texto principal del documento Word.')
        const doc = new DOMParser().parseFromString(xml, 'application/xml')
        const paragraphs = Array.from(doc.getElementsByTagName('w:p')).map(p => Array.from(p.getElementsByTagName('w:t')).map(t => t.textContent ?? '').join('')).filter(Boolean)
        setPreview({ name, type: mime, url: '', text: paragraphs.join('\n\n') || 'El documento no contiene texto extraíble.', note: 'Vista de lectura del texto del documento. El formato visual original puede variar.' })
      } else if (/^image\//.test(mime) || /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(name) || /^video\//.test(mime) || /\.(mp4|webm|ogg|mov)$/i.test(name) || mime === 'application/pdf' || lower.endsWith('.pdf')) {
        setPreview({ name, type: mime, url: URL.createObjectURL(blob) })
      } else if (/^(text\/|application\/(json|xml|javascript))/.test(mime) || /\.(txt|md|json|js|ts|tsx|jsx|css|html|xml|csv|yml|yaml|sql|log|py|java|c|cpp|h|sh)$/i.test(name)) {
        setPreview({ name, type: mime, url: '', text: (await blob.text()).slice(0, 500000), note: blob.size > 500000 ? 'Se muestran los primeros 500 KB.' : undefined })
      } else {
        setPreview({ name, type: mime, url: '', note: 'Este formato no se puede previsualizar directamente en el navegador. Podés descargarlo para abrirlo con su aplicación.' })
      }
    } catch (e) { setErrors([(e as Error).message]) }
    finally { setPreviewBusy(false) }
  }

  return (
    <>
      <h1 className="text-2xl font-bold text-navy">Archivos</h1>
      <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">Los archivos se guardan en tu espacio privado de la nube. Cuota personal: {fmtSize(500 * 1024 * 1024)} en total. Máximo {fmtSize(MAX_FILE)} por archivo. Se admiten videos, imágenes, PDF, documentos y otros formatos seguros.</p>
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
        {subs.length > 0 && <div className="mb-3 flex flex-wrap gap-2">{subs.map((f) => <div key={f.id} className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1"><button onClick={() => setFolderId(f.id)} className="px-1 py-1 text-sm hover:text-brand">📁 {f.name}</button><button title="Eliminar carpeta" className="px-1 text-xs text-red-600" onClick={() => { if (confirm("¿Eliminar la carpeta " + f.name + ", sus subcarpetas y todos los archivos que contiene?")) run(() => api.removeFolder(f.id)) }}>Eliminar</button></div>)}</div>}
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
                <Button variant="ghost" onClick={() => void previewFile(f.id, f.name, f.type)} disabled={previewBusy}>Previsualizar</Button><Button variant="ghost" onClick={() => open(f.id, f.name)}>Descargar</Button>
                <Button variant="danger" onClick={() => { if (confirm(`¿Eliminar "${f.name}"?`)) run(() => api.removeFile(f.id)) }}>Eliminar</Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {preview && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3" role="dialog" aria-modal="true" aria-label="Previsualización">
        <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
          <div className="flex items-center gap-3 border-b p-3"><div className="min-w-0 flex-1 truncate text-sm font-semibold text-navy">{preview.name}</div><Button variant="ghost" onClick={() => { if (preview.url) URL.revokeObjectURL(preview.url); setPreview(null) }}>Cerrar</Button></div>
          <div className="min-h-0 flex-1 overflow-auto bg-slate-50 p-3">
            {preview.note && <p className="mb-3 text-xs text-slate-500">{preview.note}</p>}
            {preview.type.startsWith('image/') && <img src={preview.url} alt={preview.name} className="mx-auto max-h-[75vh] max-w-full object-contain" />}
            {preview.type.startsWith('video/') && <video src={preview.url} controls className="mx-auto max-h-[75vh] max-w-full" />}
            {(preview.type === 'application/pdf' || preview.name.toLowerCase().endsWith('.pdf')) && <iframe src={preview.url} title={preview.name} className="h-[75vh] w-full rounded border bg-white" />}
            {preview.text !== undefined && <pre className="whitespace-pre-wrap break-words rounded bg-white p-4 text-sm text-slate-800">{preview.text}</pre>}
            {!preview.url && preview.text === undefined && <div className="py-16 text-center text-sm text-slate-600">Vista previa no disponible para este formato.</div>}
          </div>
        </div>
      </div>}
    </>
  )
}
