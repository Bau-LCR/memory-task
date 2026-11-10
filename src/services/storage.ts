// ÚNICO lugar que toca localStorage. Los componentes nunca lo usan directamente.
// Cuando exista backend, se reemplaza este adaptador (o api.ts completo) sin tocar la interfaz.
export interface KV {
  get<T>(key: string, fallback: T): T
  set<T>(key: string, value: T): void
  remove(key: string): void
  clearAll(): void
}

const NS = 'mt:demo:' // prefijo que separa los datos de demostración de cualquier dato real

export const localKV: KV = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(NS + key)
      return raw ? (JSON.parse(raw) as T) : fallback
    } catch {
      return fallback
    }
  },
  set<T>(key: string, value: T) {
    localStorage.setItem(NS + key, JSON.stringify(value))
  },
  remove(key: string) {
    localStorage.removeItem(NS + key)
  },
  clearAll() {
    Object.keys(localStorage).filter((k) => k.startsWith(NS)).forEach((k) => localStorage.removeItem(k))
  },
}
