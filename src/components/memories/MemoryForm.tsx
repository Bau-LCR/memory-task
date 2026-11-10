import { useState, type FormEvent } from 'react'
import { api } from '../../services/api'
import { Button, Modal, inputCls } from '../ui'
import { fmtDate } from '../../utils/format'
import type { Memory } from '../../types'

export const MEMORY_CATEGORIES = ['Recuerdo', 'Nota', 'Idea', 'Proyecto', 'Decisión']

export function MemoryForm({ memory, onClose, onSaved }: { memory?: Memory; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(memory?.title ?? '')
  const [body, setBody] = useState(memory?.body ?? '')
  const [category, setCategory] = useState(memory?.category ?? MEMORY_CATEGORIES[0])
  const [tags, setTags] = useState(memory?.tags.join(', ') ?? '')
  const [error, setError] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    try {
      await api.saveMemory({ id: memory?.id, title, body, category, tags: tags.split(',') })
      onSaved()
    } catch (err) {
      setError((err as Error).message)
    }
  }
  return (
    <Modal title={memory ? 'Editar recuerdo' : 'Nuevo recuerdo'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <input className={inputCls} placeholder="Título" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} aria-label="Título" autoFocus />
        <textarea className={inputCls} rows={6} placeholder="Descripción o texto" value={body} onChange={(e) => setBody(e.target.value)} aria-label="Texto" />
        <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Categoría">
          {MEMORY_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <input className={inputCls} placeholder="Etiquetas separadas por coma" value={tags} onChange={(e) => setTags(e.target.value)} aria-label="Etiquetas" />
        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
        {memory && memory.versions.length > 0 && (
          <details className="rounded-lg border border-slate-200 p-3 text-sm">
            <summary className="cursor-pointer font-medium">Versiones anteriores ({memory.versions.length})</summary>
            <ul className="mt-2 space-y-2">
              {memory.versions.map((v) => (
                <li key={v.at} className="border-t border-slate-100 pt-2"><span className="text-xs text-slate-500">{fmtDate(v.at)}</span><p className="font-medium">{v.title}</p><p className="whitespace-pre-wrap text-slate-600">{v.body}</p></li>
              ))}
            </ul>
          </details>
        )}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit">Guardar</Button></div>
      </form>
    </Modal>
  )
}
