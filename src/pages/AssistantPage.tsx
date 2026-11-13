import { useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { Button, Card, inputCls } from '../components/ui'

type Conversation = { id: string; title: string; updated_at: string }
type Message = { id: string; role: 'user' | 'assistant'; content: string; created_at: string }

function inlineMarkdown(text: string): ReactNode[] {
  const token = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|\x60[^\x60]+\x60)/g
  return text.split(token).filter(Boolean).map((part, index) => {
    if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__'))) return <strong key={index}>{part.slice(2, -2)}</strong>
    if ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_'))) return <em key={index}>{part.slice(1, -1)}</em>
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index} className="rounded bg-slate-200 px-1.5 py-0.5 font-mono text-[0.9em]">{part.slice(1, -1)}</code>
    return <span key={index}>{part}</span>
  })
}

function MarkdownMessage({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) { i++; continue }
    if (line.trim().startsWith('```')) {
      const language = line.trim().slice(3).trim()
      i++
      const code: string[] = []
      while (i < lines.length && !lines[i].trim().startsWith('```')) code.push(lines[i++])
      if (i < lines.length) i++
      blocks.push(<pre key={blocks.length} className="my-2 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100"><code>{code.join('\n')}</code>{language && <span className="sr-only">{language}</span>}</pre>)
      continue
    }
    if (/^\s*([-*_])\s*\1\s*\1+\s*$/.test(line)) { blocks.push(<hr key={blocks.length} className="my-3 border-slate-300" />); i++; continue }
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1])) {
      const cells = (value: string) => value.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim())
      const headers = cells(line)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(cells(lines[i++]))
      blocks.push(<div key={blocks.length} className="my-3 overflow-x-auto rounded-lg border border-slate-200"><table className="min-w-full border-collapse text-left text-sm"><thead className="bg-slate-200"><tr>{headers.map((cell, n) => <th key={n} className="border-b border-slate-300 px-3 py-2 font-semibold">{inlineMarkdown(cell)}</th>)}</tr></thead><tbody>{rows.map((row, r) => <tr key={r} className="odd:bg-white even:bg-slate-50">{headers.map((_, c) => <td key={c} className="border-b border-slate-100 px-3 py-2 align-top">{inlineMarkdown(row[c] ?? '')}</td>)}</tr>)}</tbody></table></div>)
      continue
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/)
    if (heading) {
      const cls = heading[1].length === 1 ? 'text-lg' : heading[1].length === 2 ? 'text-base' : 'text-sm'
      blocks.push(<h3 key={blocks.length} className={`mb-2 mt-3 font-bold text-slate-900 ${cls}`}>{inlineMarkdown(heading[2])}</h3>)
      i++; continue
    }
    if (/^\s*>\s?/.test(line)) {
      const quote: string[] = []
      while (i < lines.length && /^\s*>/.test(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/, ''))
      blocks.push(<blockquote key={blocks.length} className="my-2 border-l-2 border-blue-300 pl-3 text-slate-600">{quote.map((q, n) => <p key={n}>{inlineMarkdown(q)}</p>)}</blockquote>)
      continue
    }
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*+]\s+/, ''))
      blocks.push(<ul key={blocks.length} className="my-2 list-disc space-y-1 pl-5">{items.map((item, n) => <li key={n}>{inlineMarkdown(item)}</li>)}</ul>)
      continue
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+[.)]\s+/, ''))
      blocks.push(<ol key={blocks.length} className="my-2 list-decimal space-y-1 pl-5">{items.map((item, n) => <li key={n}>{inlineMarkdown(item)}</li>)}</ol>)
      continue
    }
    const paragraph = [line]
    i++
    while (i < lines.length && lines[i].trim() && !/^(#{1,3})\s|^\s*([-*+]\s+|\d+[.)]\s+|>)/.test(lines[i]) && !lines[i].trim().startsWith('```')) paragraph.push(lines[i++])
    blocks.push(<p key={blocks.length} className="my-1.5 leading-6">{inlineMarkdown(paragraph.join(' '))}</p>)
  }
  return <div className="break-words">{blocks}</div>
}

export function AssistantPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selected, setSelected] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [remaining, setRemaining] = useState<number | null>(null)

  const loadConversations = async () => {
    if (!supabase) return
    const { data, error } = await supabase.from('mt_ai_conversations').select('id,title,updated_at').order('updated_at', { ascending: false })
    if (error) throw error
    setConversations(data ?? [])
    if (!selected && data?.[0]) setSelected(data[0].id)
  }
  const loadMessages = async (id: string) => {
    if (!supabase || !id) { setMessages([]); return }
    const { data, error } = await supabase.from('mt_ai_messages').select('id,role,content,created_at').eq('conversation_id', id).order('created_at')
    if (error) throw error
    setMessages(data ?? [])
  }
  useEffect(() => { void loadConversations().catch(e => setError(e.message)) }, [])
  useEffect(() => { void loadMessages(selected).catch(e => setError(e.message)) }, [selected])

  const newConversation = async () => {
    if (!supabase) return
    setError('')
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) { setError('Tu sesión expiró.'); return }
    const { data, error } = await supabase.from('mt_ai_conversations').insert({ owner_id: userData.user.id, title: 'Nueva conversación' }).select('id,title,updated_at').single()
    if (error) { setError(error.message); return }
    setConversations(items => [data, ...items]); setSelected(data.id); setMessages([])
  }
  const renameConversation = async (conversation: Conversation) => {
    if (!supabase) return
    const value = window.prompt('Escribí el nuevo nombre de la conversación:', conversation.title)
    if (value === null) return
    const title = value.trim()
    if (!title) { setError('El nombre no puede estar vacío.'); return }
    if (title.length > 120) { setError('El nombre puede tener hasta 120 caracteres.'); return }
    const { error } = await supabase.from('mt_ai_conversations').update({ title }).eq('id', conversation.id)
    if (error) { setError(error.message); return }
    setConversations(items => items.map(item => item.id === conversation.id ? { ...item, title } : item))
    setError('')
  }
  const deleteConversation = async (conversation: Conversation) => {
    if (!supabase) return
    if (!window.confirm(`¿Eliminar "${conversation.title}" y todos sus mensajes? Esta acción no se puede deshacer.`)) return
    const { error } = await supabase.from('mt_ai_conversations').delete().eq('id', conversation.id)
    if (error) { setError(error.message); return }
    const next = conversations.filter(item => item.id !== conversation.id)
    setConversations(next)
    if (selected === conversation.id) { setSelected(next[0]?.id ?? ''); setMessages([]) }
    setError('')
  }
  const send = async () => {
    const text = prompt.trim()
    if (!supabase || !selected || !text || busy) return
    setBusy(true); setError(''); setPrompt('')
    setMessages(items => [...items, { id: crypto.randomUUID(), role: 'user', content: text, created_at: new Date().toISOString() }])
    try {
      const { data, error } = await supabase.functions.invoke('memory-ai', { body: { conversationId: selected, message: text } })
      if (error) throw new Error(error.message || 'No se pudo contactar con el asistente.')
      if (data?.error) throw new Error(data.error)
      setRemaining(Number.isFinite(data.remainingDailyRequests) ? data.remainingDailyRequests : null)
      await loadMessages(selected); await loadConversations()
    } catch (e) { setError((e as Error).message); await loadMessages(selected) }
    finally { setBusy(false) }
  }

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold text-navy">Asistente de Memory Task</h1><p className="text-sm text-slate-500">Conversaciones privadas guardadas en tu cuenta.</p></div>
      <Button onClick={() => void newConversation()}>Nueva conversación</Button>
    </div>
    <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">Tenés hasta 15 consultas por día. Las respuestas se muestran con formato enriquecido y las conversaciones se pueden renombrar o eliminar.</p>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="grid gap-4 md:grid-cols-[260px_1fr]">
      <Card title="Conversaciones">
        {conversations.length ? <ul className="space-y-1">{conversations.map(c => <li key={c.id} className="group rounded-lg border border-transparent p-1 hover:border-slate-200 hover:bg-slate-50">
          <div className="flex items-center gap-1">
            <button onClick={() => setSelected(c.id)} className={`min-w-0 flex-1 rounded-lg px-2 py-2 text-left text-sm ${selected === c.id ? 'bg-blue-50 font-semibold text-navy' : 'hover:bg-white'}`}><span className="block truncate">{c.title}</span></button>
            <button type="button" title="Cambiar nombre" aria-label={`Cambiar nombre de ${c.title}`} onClick={() => void renameConversation(c)} className="rounded-md p-2 text-slate-500 hover:bg-white hover:text-blue-700">✎</button>
            <button type="button" title="Eliminar conversación" aria-label={`Eliminar ${c.title}`} onClick={() => void deleteConversation(c)} className="rounded-md p-2 text-slate-500 hover:bg-red-50 hover:text-red-700">×</button>
          </div>
        </li>)}</ul> : <p className="text-sm text-slate-500">Todavía no hay conversaciones.</p>}
      </Card>
      <Card>
        <div className="max-h-[55vh] min-h-72 space-y-3 overflow-y-auto">
          {messages.map(m => <div key={m.id} className={`max-w-[95%] rounded-xl p-3 text-sm md:max-w-[90%] ${m.role === 'user' ? 'ml-auto whitespace-pre-wrap bg-blue-50 text-slate-800' : 'bg-slate-100 text-slate-800'}`}>
            <p className="mb-1 text-xs font-semibold uppercase text-slate-500">{m.role === 'user' ? 'Vos' : 'Asistente'}</p>
            {m.role === 'assistant' ? <MarkdownMessage content={m.content} /> : m.content}
          </div>)}
          {!messages.length && <p className="pt-16 text-center text-sm text-slate-500">Elegí una conversación o creá una nueva para empezar.</p>}
          {busy && <p className="text-sm text-slate-500">El asistente está respondiendo…</p>}
        </div>
        <form className="mt-4 flex gap-2" onSubmit={e => { e.preventDefault(); void send() }}>
          <textarea className={inputCls + ' min-h-12 flex-1'} value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Escribí tu mensaje…" maxLength={8000} disabled={!selected || busy} />
          <Button type="submit" disabled={!selected || !prompt.trim() || busy}>Enviar</Button>
        </form>
        {remaining !== null && <p className="mt-2 text-xs text-slate-500">Consultas restantes hoy: {remaining} de 15</p>}
      </Card>
    </div>
  </div>
}
