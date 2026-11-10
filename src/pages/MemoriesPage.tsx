import { useState } from 'react'
import { api } from '../services/api'
import { useAsync } from '../hooks/useAsync'
import { Badge, Button, Card, inputCls } from '../components/ui'
import { MemoryForm } from '../components/memories/MemoryForm'
import { fmtDate } from '../utils/format'
import type { Memory } from '../types'

export function MemoriesPage() {
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Memory | 'new' | null>(null)
  const { data, reload } = useAsync(() => api.memories())
  if (!data) return <p className="text-slate-500">Cargando…</p>
  const s = q.trim().toLowerCase()
  const list = data.filter((m) => !s || `${m.title} ${m.body} ${m.tags.join(' ')}`.toLowerCase().includes(s))
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-navy">Recuerdos</h1>
        <input className={`${inputCls} ml-auto max-w-xs`} placeholder="Buscar recuerdos…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar recuerdos" />
        <Button onClick={() => setEditing('new')}>Nuevo recuerdo</Button>
      </div>
      {list.length === 0 && <Card><p className="text-sm text-slate-500">{data.length ? 'Ningún recuerdo coincide con la búsqueda.' : 'Aún no hay recuerdos. Crea el primero.'}</p></Card>}
      <div className="grid gap-4 md:grid-cols-2">
        {list.map((m) => (
          <Card key={m.id} title={m.title} action={<Badge>{m.category}</Badge>}>
            <p className="line-clamp-3 whitespace-pre-wrap text-sm text-slate-600">{m.body || 'Sin descripción'}</p>
            <div className="mt-2 flex flex-wrap gap-1">{m.tags.map((t) => <Badge key={t} tone="gray">#{t}</Badge>)}</div>
            <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
              <span>{fmtDate(m.updatedAt)} · {m.versions.length} versiones previas</span>
              <Button variant="ghost" className="ml-auto" onClick={() => setEditing(m)}>Editar</Button>
              <Button variant="danger" onClick={async () => { if (confirm(`¿Eliminar "${m.title}"?`)) { await api.removeMemory(m.id); reload() } }}>Eliminar</Button>
            </div>
          </Card>
        ))}
      </div>
      {editing && <MemoryForm memory={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload() }} />}
    </>
  )
}
