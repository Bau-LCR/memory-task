// Capa de servicios. Hoy usa datos locales de demostración; mañana puede hablar con la API REST
// (/v1) sin cambiar los componentes. IMPORTANTE: estas validaciones son de comodidad de interfaz.
// En el backend real se repiten y son las únicas que cuentan.
import { localKV as kv } from './storage'
import type { Activity, FileItem, Folder, Memory, MemoryInput, Mode, Session } from '../types'

export const SOURCE_LABEL = 'Datos locales de demostración'
export const QUOTA = 25 * 1024 * 1024
export const MAX_FILE = 10 * 1024 * 1024
const BLOCKED = /\.(exe|dll|bat|cmd|ps1|msi|jar|apk|dmg|scr|com)$/i
const K = { session: 'session', folders: 'folders', files: 'files', memories: 'memories', activity: 'activity' }

const blobs = new Map<string, File>() // el contenido solo vive en memoria de esta sesión
const uid = () => crypto.randomUUID()
const now = () => new Date().toISOString()
const read = <T>(k: string, f: T) => kv.get<T>(k, f)
const log = (text: string) =>
  kv.set(K.activity, [{ id: uid(), text, at: now() }, ...read<Activity[]>(K.activity, [])].slice(0, 20))

export const api = {
  async session() { return read<Session | null>(K.session, null) },
  async signInDemo() {
    const prev = read<Session | null>(K.session, null)
    if (prev) return prev
    const s: Session = { name: 'Usuario Demo', email: 'demo@memorytask.local', mode: null, demo: true }
    kv.set(K.session, s)
    log('Sesión de demostración iniciada')
    return s
  },
  async setMode(mode: Mode) {
    const s = read<Session | null>(K.session, null)
    if (!s) throw new Error('No hay sesión')
    kv.set(K.session, { ...s, mode })
    log(`Modalidad seleccionada: ${mode === 'personal' ? 'personal' : 'servicio'}`)
  },
  async signOut() { kv.remove(K.session) },
  async resetDemo() { kv.clearAll(); blobs.clear() },

  async folders() { return read<Folder[]>(K.folders, []) },
  async createFolder(name: string, parentId: string | null) {
    const n = name.trim()
    if (!n || n.length > 60 || /[\\/]/.test(n)) throw new Error('Nombre inválido (máx. 60 caracteres, sin barras)')
    const list = read<Folder[]>(K.folders, [])
    if (parentId && !list.some((f) => f.id === parentId)) throw new Error('La carpeta superior no existe')
    if (list.some((f) => f.parentId === parentId && f.name.toLowerCase() === n.toLowerCase()))
      throw new Error('Ya existe una carpeta con ese nombre')
    kv.set(K.folders, [...list, { id: uid(), name: n, parentId }])
    log(`Carpeta creada: ${n}`)
  },

  async files() { return read<FileItem[]>(K.files, []) },
  hasFile: (id: string) => blobs.has(id),
  async getFile(id: string) { return blobs.get(id) },
  async addFiles(list: File[], folderId: string | null) {
    const files = read<FileItem[]>(K.files, [])
    let used = files.reduce((a, f) => a + f.size, 0)
    const errors: string[] = []
    for (const f of list) {
      if (BLOCKED.test(f.name)) errors.push(`${f.name}: tipo de archivo no permitido`)
      else if (f.size > MAX_FILE) errors.push(`${f.name}: supera el máximo de 10 MB por archivo`)
      else if (used + f.size > QUOTA) errors.push(`${f.name}: cuota de 25 MB agotada`)
      else {
        const item: FileItem = { id: uid(), name: f.name, size: f.size, type: f.type || 'application/octet-stream', folderId, addedAt: now() }
        files.unshift(item)
        blobs.set(item.id, f)
        used += f.size
        log(`Archivo agregado: ${f.name}`)
      }
    }
    kv.set(K.files, files)
    return errors
  },
  async moveFile(id: string, folderId: string | null) {
    if (folderId && !read<Folder[]>(K.folders, []).some((f) => f.id === folderId)) throw new Error('La carpeta no existe')
    kv.set(K.files, read<FileItem[]>(K.files, []).map((f) => (f.id === id ? { ...f, folderId } : f)))
  },
  async removeFile(id: string) {
    const files = read<FileItem[]>(K.files, [])
    const f = files.find((x) => x.id === id)
    kv.set(K.files, files.filter((x) => x.id !== id))
    blobs.delete(id)
    if (f) log(`Archivo eliminado: ${f.name}`)
  },

  async memories() { return read<Memory[]>(K.memories, []) },
  async saveMemory(i: MemoryInput) {
    const title = i.title.trim().slice(0, 120)
    if (!title) throw new Error('El título es obligatorio')
    const body = i.body.slice(0, 20000)
    const tags = [...new Set(i.tags.map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 10)
    const list = read<Memory[]>(K.memories, [])
    const ex = list.find((m) => m.id === i.id)
    if (ex) {
      ex.versions = [{ title: ex.title, body: ex.body, at: ex.updatedAt }, ...ex.versions].slice(0, 50)
      Object.assign(ex, { title, body, category: i.category, tags, updatedAt: now() })
      log(`Recuerdo editado: ${title}`)
    } else {
      list.unshift({ id: uid(), title, body, category: i.category, tags, createdAt: now(), updatedAt: now(), versions: [] })
      log(`Recuerdo creado: ${title}`)
    }
    kv.set(K.memories, list)
  },
  async removeMemory(id: string) {
    kv.set(K.memories, read<Memory[]>(K.memories, []).filter((m) => m.id !== id))
    log('Recuerdo eliminado')
  },

  async usage() {
    const files = read<FileItem[]>(K.files, [])
    return {
      used: files.reduce((a, f) => a + f.size, 0), quota: QUOTA, files: files.length,
      folders: read<Folder[]>(K.folders, []).length, memories: read<Memory[]>(K.memories, []).length,
    }
  },
  async activity() { return read<Activity[]>(K.activity, []) },
  async exportAll() {
    return {
      exportedAt: now(), source: 'demo-local',
      nota: 'Los archivos se exportan solo como metadatos; su contenido no se almacena en modo demostración.',
      folders: read<Folder[]>(K.folders, []), files: read<FileItem[]>(K.files, []),
      memories: read<Memory[]>(K.memories, []),
    }
  },
}
