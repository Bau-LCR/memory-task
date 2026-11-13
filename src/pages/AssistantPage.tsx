import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Button, Card, inputCls } from '../components/ui'

type Conversation = { id: string; title: string; updated_at: string }
type Message = { id: string; role: 'user' | 'assistant'; content: string; created_at: string }

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
    const { data, error } = await supabase.from('mt_ai_conversations')
      .insert({ owner_id: userData.user.id, title: 'Nueva conversación' })
      .select('id,title,updated_at').single()
    if (error) { setError(error.message); return }
    setConversations(items => [data, ...items])
    setSelected(data.id)
    setMessages([])
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
      await loadMessages(selected)
      await loadConversations()
    } catch (e) {
      setError((e as Error).message)
      await loadMessages(selected)
    } finally { setBusy(false) }
  }
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold text-navy">Asistente de Memory Task</h1><p className="text-sm text-slate-500">Conversaciones privadas guardadas en tu cuenta.</p></div>
      <Button onClick={() => void newConversation()}>Nueva conversación</Button>
    </div>
    <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">Límite inicial: 20 consultas por día. El proveedor y el modelo se configuran en el servidor; la clave API nunca se expone al navegador. El asistente solo recibe el texto que enviás en el chat.</p>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="grid gap-4 md:grid-cols-[240px_1fr]">
      <Card title="Conversaciones">
        {conversations.length ? <ul className="space-y-1">{conversations.map(c => <li key={c.id}><button onClick={() => setSelected(c.id)} className={`w-full rounded-lg px-3 py-2 text-left text-sm ${selected === c.id ? 'bg-slate-100 font-semibold text-navy' : 'hover:bg-slate-50'}`}>{c.title}</button></li>)}</ul> : <p className="text-sm text-slate-500">Todavía no hay conversaciones.</p>}
      </Card>
      <Card>
        <div className="max-h-[55vh] min-h-72 space-y-3 overflow-y-auto">
          {messages.map(m => <div key={m.id} className={`max-w-[90%] whitespace-pre-wrap rounded-xl p-3 text-sm ${m.role === 'user' ? 'ml-auto bg-blue-50 text-slate-800' : 'bg-slate-100 text-slate-800'}`}><p className="mb-1 text-xs font-semibold uppercase text-slate-500">{m.role === 'user' ? 'Vos' : 'Asistente'}</p>{m.content}</div>)}
          {!messages.length && <p className="pt-16 text-center text-sm text-slate-500">Elegí una conversación o creá una nueva para empezar.</p>}
          {busy && <p className="text-sm text-slate-500">El asistente está respondiendo…</p>}
        </div>
        <form className="mt-4 flex gap-2" onSubmit={e => { e.preventDefault(); void send() }}>
          <textarea className={inputCls + ' min-h-12 flex-1'} value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Escribí tu mensaje…" maxLength={8000} disabled={!selected || busy} />
          <Button type="submit" disabled={!selected || !prompt.trim() || busy}>Enviar</Button>
        </form>
        {remaining !== null && <p className="mt-2 text-xs text-slate-500">Consultas restantes hoy (estimado): {remaining}</p>}
      </Card>
    </div>
  </div>
}
