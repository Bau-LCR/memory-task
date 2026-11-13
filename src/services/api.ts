// Datos personales persistidos en Supabase. El almacenamiento local solo queda para el modo demo sin Supabase.
import { localKV as kv } from './storage'
import { supabase } from '../lib/supabase'
import type { Activity, FileItem, Folder, Memory, MemoryInput, Mode, Session } from '../types'

export const SOURCE_LABEL = 'Datos locales de demostración'
export const QUOTA = 500 * 1024 * 1024
// Supabase Free limita el tamaño individual a 50 MiB por objeto.
export const MAX_FILE = 50 * 1024 * 1024
export const STORAGE_BUCKET = 'memory-task-private'
const BLOCKED = /\.(exe|dll|bat|cmd|ps1|msi|jar|apk|dmg|scr|com)$/i
const K = { session: 'session', folders: 'folders', files: 'files', memories: 'memories', activity: 'activity' }
const uid = () => crypto.randomUUID()
const now = () => new Date().toISOString()
const read = <T>(k: string, f: T) => kv.get<T>(k, f)
const isCloud = Boolean(supabase)
const demoBlobs = new Map<string, File>()

async function currentUser() {
  if (!supabase) throw new Error('Supabase no está configurado.')
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  if (!data.user) throw new Error('Tu sesión expiró. Volvé a iniciar sesión.')
  return data.user
}
function fail(error: { message: string } | null) { if (error) throw new Error(error.message) }
function folderFrom(row: any): Folder { return { id: row.id, name: row.name, parentId: row.parent_id ?? null } }
function fileFrom(row: any): FileItem { return { id: row.id, name: row.name, size: Number(row.size_bytes), type: row.content_type, folderId: row.folder_id ?? null, addedAt: row.created_at } }
function memoryFrom(row: any): Memory { return { id: row.id, title: row.title, body: row.body, category: row.category, tags: row.tags ?? [], createdAt: row.created_at, updatedAt: row.updated_at, versions: row.versions ?? [] } }
async function cloudLog(description: string) {
  if (!supabase) return
  const user = await currentUser()
  const { error } = await supabase.from('mt_activity').insert({ owner_id: user.id, description })
  if (error) console.warn('No se pudo registrar actividad:', error.message)
}
function localLog(description: string) {
  try { kv.set(K.activity, [{ id: uid(), text: description, at: now() }, ...read<Activity[]>(K.activity, [])].slice(0, 20)) } catch { /* registro informativo */ }
}

export const api = {
  async session() {
    if (supabase) {
      const { data, error } = await supabase.auth.getSession()
      fail(error)
      const user = data.session?.user
      if (!user) return null
      const metadata = user.user_metadata || {}
      const mode = metadata.memory_task_mode === 'personal' || metadata.memory_task_mode === 'service' ? metadata.memory_task_mode : null
      return { name: String(metadata.full_name || metadata.name || user.email || 'Usuario'), email: user.email || '', mode, demo: false } satisfies Session
    }
    return read<Session | null>(K.session, null)
  },
  async signInWithGoogle() {
    if (!supabase) throw new Error('Supabase no está configurado.')
    const redirectTo = new URL(window.location.pathname, window.location.origin).toString()
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })
    fail(error)
  },
  async signInDemo() {
    if (supabase) throw new Error('El modo demostración está desactivado en este entorno.')
    const previous = read<Session | null>(K.session, null)
    if (previous) return previous
    const session: Session = { name: 'Usuario Demo', email: 'demo@memorytask.local', mode: null, demo: true }
    kv.set(K.session, session)
    localLog('Sesión de demostración iniciada')
    return session
  },
  async setMode(mode: Mode) {
    if (supabase) {
      await currentUser()
      const { error } = await supabase.auth.updateUser({ data: { memory_task_mode: mode } })
      fail(error)
      return
    }
    const session = read<Session | null>(K.session, null)
    if (!session) throw new Error('No hay sesión')
    kv.set(K.session, { ...session, mode })
    localLog('Modalidad seleccionada: ' + mode)
  },
  async signOut() {
    if (supabase) { const { error } = await supabase.auth.signOut(); fail(error) }
    kv.remove(K.session)
  },
  async resetDemo() {
    if (supabase) throw new Error('No se pueden borrar datos de una cuenta conectada desde el reinicio local.')
    kv.clearAll()
    demoBlobs.clear()
  },

  async folders(): Promise<Folder[]> {
    if (supabase) {
      const user = await currentUser()
      const { data, error } = await supabase.from('mt_folders').select('id,name,parent_id').eq('owner_id', user.id).order('name')
      fail(error)
      return (data ?? []).map(folderFrom)
    }
    return read<Folder[]>(K.folders, [])
  },
  async createFolder(name: string, parentId: string | null) {
    const clean = name.trim()
    if (!clean || clean.length > 60 || /[\\/]/.test(clean)) throw new Error('Nombre inválido (máx. 60 caracteres, sin barras)')
    if (supabase) {
      const user = await currentUser()
      const siblingQuery = supabase.from('mt_folders').select('id,name').eq('owner_id', user.id)
      const { data: siblings, error: lookupError } = parentId ? await siblingQuery.eq('parent_id', parentId) : await siblingQuery.is('parent_id', null)
      fail(lookupError)
      if ((siblings ?? []).some((item) => item.name.toLowerCase() === clean.toLowerCase())) throw new Error('Ya existe una carpeta con ese nombre')
      const { error } = await supabase.from('mt_folders').insert({ owner_id: user.id, name: clean, parent_id: parentId })
      fail(error)
      await cloudLog('Carpeta creada: ' + clean)
      return
    }
    const folders = read<Folder[]>(K.folders, [])
    if (parentId && !folders.some((folder) => folder.id === parentId)) throw new Error('La carpeta superior no existe')
    if (folders.some((folder) => folder.parentId === parentId && folder.name.toLowerCase() === clean.toLowerCase())) throw new Error('Ya existe una carpeta con ese nombre')
    kv.set(K.folders, [...folders, { id: uid(), name: clean, parentId }])
    localLog('Carpeta creada: ' + clean)
  },

  async removeFolder(id: string) {
    if (supabase) {
      const user = await currentUser()
      const { data: allFolders, error: folderError } = await supabase.from('mt_folders').select('id,parent_id,name').eq('owner_id', user.id)
      fail(folderError)
      const descendants = new Set<string>([id])
      let changed = true
      while (changed) {
        changed = false
        for (const folder of allFolders ?? []) if (folder.parent_id && descendants.has(folder.parent_id) && !descendants.has(folder.id)) {
          descendants.add(folder.id); changed = true
        }
      }
      const selected = (allFolders ?? []).filter(folder => descendants.has(folder.id))
      if (!selected.some(folder => folder.id === id)) throw new Error('No se encontró la carpeta.')
      const { data: files, error: filesError } = await supabase.from('mt_files')
        .select('id,storage_path').eq('owner_id', user.id).in('folder_id', [...descendants])
      fail(filesError)
      const paths = (files ?? []).map(file => file.storage_path)
      for (let i = 0; i < paths.length; i += 100) {
        const { error } = await supabase.storage.from(STORAGE_BUCKET).remove(paths.slice(i, i + 100))
        fail(error)
      }
      if (files?.length) {
        const { error } = await supabase.from('mt_files').delete().eq('owner_id', user.id).in('folder_id', [...descendants])
        fail(error)
      }
      const depth = (folderId: string): number => {
        let n = 0, current = selected.find(folder => folder.id === folderId)
        while (current?.parent_id && descendants.has(current.parent_id)) {
          n++; current = selected.find(folder => folder.id === current?.parent_id)
        }
        return n
      }
      for (const folder of [...selected].sort((a, b) => depth(b.id) - depth(a.id))) {
        const { error } = await supabase.from('mt_folders').delete().eq('owner_id', user.id).eq('id', folder.id)
        fail(error)
      }
      await cloudLog('Carpeta y contenido eliminados')
      return
    }
    const folders = read<Folder[]>(K.folders, [])
    const descendants = new Set<string>([id])
    let changed = true
    while (changed) {
      changed = false
      for (const folder of folders) if (folder.parentId && descendants.has(folder.parentId) && !descendants.has(folder.id)) {
        descendants.add(folder.id); changed = true
      }
    }
    const removed = read<FileItem[]>(K.files, []).filter(file => file.folderId !== null && descendants.has(file.folderId))
    kv.set(K.folders, folders.filter(folder => !descendants.has(folder.id)))
    kv.set(K.files, read<FileItem[]>(K.files, []).filter(file => file.folderId === null || !descendants.has(file.folderId)))
    removed.forEach(file => demoBlobs.delete(file.id))
    localLog('Carpeta y contenido eliminados')
  },

  async files(): Promise<FileItem[]> {
    if (supabase) {
      const user = await currentUser()
      const { data, error } = await supabase.from('mt_files').select('id,name,size_bytes,content_type,folder_id,created_at').eq('owner_id', user.id).order('created_at', { ascending: false })
      fail(error)
      return (data ?? []).map(fileFrom)
    }
    return read<FileItem[]>(K.files, [])
  },
  hasFile: (id: string) => Boolean(supabase) || demoBlobs.has(id),
  async getFile(id: string): Promise<Blob | undefined> {
    if (supabase) {
      const user = await currentUser()
      const { data: row, error: rowError } = await supabase.from('mt_files').select('storage_path').eq('id', id).eq('owner_id', user.id).maybeSingle()
      fail(rowError)
      if (!row) throw new Error('No se encontró el archivo.')
      const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(row.storage_path)
      fail(error)
      if (!data) throw new Error('El archivo está registrado, pero no se encontró su contenido en el almacenamiento.')
      return data
    }
    return demoBlobs.get(id)
  },
  async addFiles(selected: File[], folderId: string | null): Promise<string[]> {
    const errors: string[] = []
    if (supabase) {
      const user = await currentUser()
      const current = await api.usage()
      let used = current.used
      for (const file of selected) {
        if (BLOCKED.test(file.name)) { errors.push(file.name + ': tipo de archivo no permitido'); continue }
        if (file.size > MAX_FILE) { errors.push(file.name + ': supera el máximo de 50 MiB por archivo'); continue }
        if (used + file.size > current.quota) { errors.push(file.name + ': supera la cuota de almacenamiento disponible en tu cuenta'); continue }
        const id = uid()
        const safeName = file.name.normalize('NFKC').replace(/[^\w.\-() ]/g, '_').slice(0, 180) || 'archivo'
        const storagePath = user.id + '/' + id + '/' + safeName
        const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(storagePath, file, { contentType: file.type || 'application/octet-stream', upsert: false })
        if (uploadError) { errors.push(file.name + ': ' + uploadError.message); continue }
        const { error: insertError } = await supabase.from('mt_files').insert({ id, owner_id: user.id, folder_id: folderId, storage_path: storagePath, name: file.name, size_bytes: file.size, content_type: file.type || 'application/octet-stream' })
        if (insertError) {
          await supabase.storage.from(STORAGE_BUCKET).remove([storagePath])
          errors.push(file.name + ': ' + insertError.message)
          continue
        }
        used += file.size
        await cloudLog('Archivo agregado: ' + file.name)
      }
      return errors
    }
    const files = read<FileItem[]>(K.files, [])
    let used = files.reduce((sum, item) => sum + item.size, 0)
    const addedIds: string[] = []
    for (const file of selected) {
      if (BLOCKED.test(file.name)) errors.push(file.name + ': tipo de archivo no permitido')
      else if (file.size > MAX_FILE) errors.push(file.name + ': supera el máximo de 50 MB por archivo')
      else if (used + file.size > QUOTA) errors.push(file.name + ': cuota de 500 MiB agotada')
      else { const id = uid(); files.unshift({ id, name: file.name, size: file.size, type: file.type || 'application/octet-stream', folderId, addedAt: now() }); demoBlobs.set(id, file); addedIds.push(id); used += file.size }
    }
    try { kv.set(K.files, files) } catch (error) { addedIds.forEach((id) => demoBlobs.delete(id)); throw error }
    return errors
  },
  async moveFile(id: string, folderId: string | null) {
    if (supabase) {
      const user = await currentUser()
      const { error } = await supabase.from('mt_files').update({ folder_id: folderId }).eq('id', id).eq('owner_id', user.id)
      fail(error)
      return
    }
    if (folderId && !read<Folder[]>(K.folders, []).some((folder) => folder.id === folderId)) throw new Error('La carpeta no existe')
    kv.set(K.files, read<FileItem[]>(K.files, []).map((file) => file.id === id ? { ...file, folderId } : file))
  },
  async removeFile(id: string) {
    if (supabase) {
      const user = await currentUser()
      const { data: row, error: lookupError } = await supabase.from('mt_files').select('storage_path,name').eq('id', id).eq('owner_id', user.id).maybeSingle()
      fail(lookupError)
      if (!row) throw new Error('No se encontró el archivo.')
      const { error: storageError } = await supabase.storage.from(STORAGE_BUCKET).remove([row.storage_path])
      fail(storageError)
      const { error: deleteError } = await supabase.from('mt_files').delete().eq('id', id).eq('owner_id', user.id)
      fail(deleteError)
      await cloudLog('Archivo eliminado: ' + row.name)
      return
    }
    kv.set(K.files, read<FileItem[]>(K.files, []).filter((file) => file.id !== id))
    demoBlobs.delete(id)
    localLog('Archivo eliminado')
  },

  async memories(): Promise<Memory[]> {
    if (supabase) {
      const user = await currentUser()
      const { data, error } = await supabase.from('mt_memories').select('*').eq('owner_id', user.id).order('updated_at', { ascending: false })
      fail(error)
      return (data ?? []).map(memoryFrom)
    }
    return read<Memory[]>(K.memories, [])
  },
  async saveMemory(input: MemoryInput) {
    const title = input.title.trim().slice(0, 120)
    if (!title) throw new Error('El título es obligatorio')
    const body = input.body.slice(0, 20000)
    const tags = [...new Set(input.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))].slice(0, 10)
    if (supabase) {
      const user = await currentUser()
      if (input.id) {
        const { data: previous, error: readError } = await supabase.from('mt_memories').select('title,body,updated_at,versions').eq('id', input.id).eq('owner_id', user.id).maybeSingle()
        fail(readError)
        if (!previous) throw new Error('No se encontró el recuerdo.')
        const versions = [{ title: previous.title, body: previous.body, at: previous.updated_at }, ...(previous.versions ?? [])].slice(0, 50)
        const { error } = await supabase.from('mt_memories').update({ title, body, category: input.category, tags, versions, updated_at: now() }).eq('id', input.id).eq('owner_id', user.id)
        fail(error)
      } else {
        const { error } = await supabase.from('mt_memories').insert({ owner_id: user.id, title, body, category: input.category, tags })
        fail(error)
      }
      await cloudLog((input.id ? 'Recuerdo editado: ' : 'Recuerdo creado: ') + title)
      return
    }
    const memories = read<Memory[]>(K.memories, [])
    const existing = memories.find((memory) => memory.id === input.id)
    if (existing) {
      existing.versions = [{ title: existing.title, body: existing.body, at: existing.updatedAt }, ...existing.versions].slice(0, 50)
      Object.assign(existing, { title, body, category: input.category, tags, updatedAt: now() })
    } else memories.unshift({ id: uid(), title, body, category: input.category, tags, createdAt: now(), updatedAt: now(), versions: [] })
    kv.set(K.memories, memories)
    localLog((input.id ? 'Recuerdo editado: ' : 'Recuerdo creado: ') + title)
  },
  async removeMemory(id: string) {
    if (supabase) {
      const user = await currentUser()
      const { error } = await supabase.from('mt_memories').delete().eq('id', id).eq('owner_id', user.id)
      fail(error)
      await cloudLog('Recuerdo eliminado')
      return
    }
    kv.set(K.memories, read<Memory[]>(K.memories, []).filter((memory) => memory.id !== id))
    localLog('Recuerdo eliminado')
  },

  async usage() {
    if (supabase) {
      const user = await currentUser()
      const [filesResult, foldersResult, memoriesResult, quotaResult] = await Promise.all([
        supabase.from('mt_files').select('size_bytes').eq('owner_id', user.id),
        supabase.from('mt_folders').select('id', { count: 'exact', head: true }).eq('owner_id', user.id),
        supabase.from('mt_memories').select('id', { count: 'exact', head: true }).eq('owner_id', user.id),
        supabase.rpc('mt_personal_quota_for', { p_user_id: user.id }),
      ])
      fail(filesResult.error); fail(foldersResult.error); fail(memoriesResult.error); fail(quotaResult.error)
      const files = filesResult.data ?? []
      return { used: files.reduce((sum, file) => sum + Number(file.size_bytes), 0), quota: Number(quotaResult.data ?? QUOTA), files: files.length, folders: foldersResult.count ?? 0, memories: memoriesResult.count ?? 0 }
    }
    const files = read<FileItem[]>(K.files, [])
    return { used: files.reduce((sum, file) => sum + file.size, 0), quota: QUOTA, files: files.length, folders: read<Folder[]>(K.folders, []).length, memories: read<Memory[]>(K.memories, []).length }
  },
  async setPersonalQuota(quotaBytes: number) {
    if (!supabase) throw new Error('La cuota personal solo está disponible con una cuenta conectada.')
    if (!Number.isSafeInteger(quotaBytes) || quotaBytes < QUOTA || quotaBytes > 5 * 1024 * 1024 * 1024) throw new Error('La cuota debe estar entre 50 MiB y 5 GiB.')
    const { data, error } = await supabase.rpc('mt_set_my_personal_quota', { p_quota_bytes: quotaBytes })
    fail(error)
    return Number(data)
  },
  async activity(): Promise<Activity[]> {
    if (supabase) {
      const user = await currentUser()
      const { data, error } = await supabase.from('mt_activity').select('id,description,created_at').eq('owner_id', user.id).order('created_at', { ascending: false }).limit(20)
      fail(error)
      return (data ?? []).map((row) => ({ id: row.id, text: row.description, at: row.created_at }))
    }
    return read<Activity[]>(K.activity, [])
  },
  async exportAll() {
    const [folders, files, memories, activity] = await Promise.all([api.folders(), api.files(), api.memories(), api.activity()])
    return { exportedAt: now(), source: isCloud ? 'supabase' : 'demo-local', folders, files, memories, activity, nota: isCloud ? 'Los archivos binarios se descargan individualmente desde la sección Archivos; esta exportación contiene sus metadatos.' : 'La exportación contiene los metadatos de tus datos locales; los archivos binarios no se incluyen.' }
  },
}
