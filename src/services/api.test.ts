import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('../lib/supabase', () => ({ supabase: null }))

import { api, MAX_FILE, QUOTA } from './api'

const file = (name: string, bytes = 10, type = 'text/plain') => new File([new Uint8Array(bytes)], name, { type })
const sizedFile = (name: string, size: number) => {
  const result = new File([], name, { type: 'application/octet-stream' })
  Object.defineProperty(result, 'size', { value: size })
  return result
}

beforeEach(async () => { await api.resetDemo() })

describe('sesión de demostración', () => {
  it('crea una sesión marcada como demo, sin modalidad, y la conserva', async () => {
    expect(await api.session()).toBeNull()
    const s = await api.signInDemo()
    expect(s).toMatchObject({ demo: true, mode: null })
    expect((await api.signInDemo()).email).toBe(s.email)
  })
  it('guarda la modalidad y cierra sesión', async () => {
    await api.signInDemo()
    await api.setMode('service')
    expect((await api.session())?.mode).toBe('service')
    await api.signOut()
    expect(await api.session()).toBeNull()
  })
  it('setMode sin sesión falla', async () => {
    await expect(api.setMode('personal')).rejects.toThrow('No hay sesión')
  })
})

describe('carpetas', () => {
  it.each([['', 'vacío'], ['   ', 'solo espacios'], ['a/b', 'barra'], ['a\\b', 'barra invertida'], ['x'.repeat(61), '61 caracteres']])(
    'rechaza nombre inválido: %s (%s)', async (name) => {
      await expect(api.createFolder(name, null)).rejects.toThrow('Nombre inválido')
    })
  it('crea carpetas y evita duplicados sin distinguir mayúsculas', async () => {
    await api.createFolder('Fotos', null)
    await expect(api.createFolder('fotos', null)).rejects.toThrow('Ya existe')
    expect(await api.folders()).toHaveLength(1)
  })
  it('permite el mismo nombre bajo carpetas superiores distintas', async () => {
    await api.createFolder('A', null); await api.createFolder('B', null)
    const [a, b] = await api.folders()
    await api.createFolder('Sub', a.id); await api.createFolder('Sub', b.id)
    expect(await api.folders()).toHaveLength(4)
  })
  it('rechaza una carpeta superior inexistente', async () => {
    await expect(api.createFolder('X', 'no-existe')).rejects.toThrow('no existe')
  })
})

describe('archivos', () => {
  it('agrega, lista, mueve y elimina', async () => {
    await api.createFolder('Docs', null)
    const [folder] = await api.folders()
    expect(await api.addFiles([file('nota.txt')], null)).toEqual([])
    const [f] = await api.files()
    expect(f).toMatchObject({ name: 'nota.txt', folderId: null })
    expect(api.hasFile(f.id)).toBe(true)
    await api.moveFile(f.id, folder.id)
    expect((await api.files())[0].folderId).toBe(folder.id)
    await api.removeFile(f.id)
    expect(await api.files()).toHaveLength(0)
    expect(api.hasFile(f.id)).toBe(false)
  })
  it('bloquea extensiones ejecutables', async () => {
    const errs = await api.addFiles([file('virus.EXE'), file('ok.txt')], null)
    expect(errs).toEqual(['virus.EXE: tipo de archivo no permitido'])
    expect((await api.files()).map((x) => x.name)).toEqual(['ok.txt'])
  })
  it('rechaza archivos de más de 50 MB', async () => {
    const errs = await api.addFiles([file('grande.bin', MAX_FILE + 1)], null)
    expect(errs[0]).toContain('50 MB')
    expect(await api.files()).toHaveLength(0)
  })
  it('respeta la cuota total de 500 MiB sin superar el límite individual', async () => {
    expect(QUOTA).toBe(500 * 1024 * 1024)
    const batch = Array.from({ length: 10 }, (_, i) => sizedFile(`parte-${i}.bin`, MAX_FILE))
    expect(await api.addFiles(batch, null)).toEqual([])
    const errs = await api.addFiles([sizedFile('extra.bin', 1024 * 1024)], null)
    expect(errs[0]).toContain('cuota')
    const u = await api.usage()
    expect(u.used).toBe(QUOTA)
    expect(u.used).toBeLessThanOrEqual(QUOTA)
  })
  it('no permite mover a una carpeta inexistente', async () => {
    await api.addFiles([file('a.txt')], null)
    const [f] = await api.files()
    await expect(api.moveFile(f.id, 'fantasma')).rejects.toThrow('no existe')
  })
})

describe('recuerdos', () => {
  const base = { title: 'Título', body: 'Texto', category: 'Nota', tags: [] as string[] }
  it('exige título', async () => {
    await expect(api.saveMemory({ ...base, title: '   ' })).rejects.toThrow('título es obligatorio')
  })
  it('normaliza etiquetas: minúsculas, sin vacías, sin duplicados, máximo 10', async () => {
    await api.saveMemory({ ...base, tags: ['  Viaje ', 'viaje', '', ...Array.from({ length: 15 }, (_, i) => `t${i}`)] })
    const [m] = await api.memories()
    expect(m.tags[0]).toBe('viaje')
    expect(new Set(m.tags).size).toBe(m.tags.length)
    expect(m.tags).toHaveLength(10)
  })
  it('recorta título (120) y texto (20000)', async () => {
    await api.saveMemory({ ...base, title: 'x'.repeat(200), body: 'y'.repeat(25000) })
    const [m] = await api.memories()
    expect(m.title).toHaveLength(120)
    expect(m.body).toHaveLength(20000)
  })
  it('al editar guarda la versión anterior', async () => {
    await api.saveMemory({ ...base, title: 'v1', body: 'uno' })
    const [m] = await api.memories()
    await api.saveMemory({ ...base, id: m.id, title: 'v2', body: 'dos' })
    const [e] = await api.memories()
    expect(await api.memories()).toHaveLength(1)
    expect(e).toMatchObject({ title: 'v2', body: 'dos' })
    expect(e.versions[0]).toMatchObject({ title: 'v1', body: 'uno' })
  })
  it('conserva como máximo 50 versiones', async () => {
    await api.saveMemory({ ...base, title: 'v0' })
    const [m] = await api.memories()
    for (let i = 1; i <= 55; i++) await api.saveMemory({ ...base, id: m.id, title: `v${i}` })
    expect((await api.memories())[0].versions).toHaveLength(50)
  })
  it('elimina', async () => {
    await api.saveMemory(base)
    await api.removeMemory((await api.memories())[0].id)
    expect(await api.memories()).toHaveLength(0)
  })
})

describe('uso, exportación y reinicio', () => {
  it('cuenta recursos y exporta metadatos con aviso', async () => {
    await api.createFolder('F', null)
    await api.addFiles([file('a.txt', 100)], null)
    await api.saveMemory({ title: 'M', body: '', category: 'Nota', tags: [] })
    expect(await api.usage()).toMatchObject({ used: 100, files: 1, folders: 1, memories: 1, quota: QUOTA })
    const ex = await api.exportAll()
    expect(ex.source).toBe('demo-local')
    expect(ex.nota).toContain('metadatos')
    expect(ex.memories).toHaveLength(1)
  })
  it('resetDemo borra todo, incluidos los contenidos en memoria', async () => {
    await api.addFiles([file('a.txt')], null)
    const [f] = await api.files()
    await api.resetDemo()
    expect(await api.files()).toEqual([])
    expect(api.hasFile(f.id)).toBe(false)
  })
})

describe('fallos del almacenamiento del navegador', () => {
  it('informa un error comprensible si localStorage no permite escribir', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('lleno', 'QuotaExceededError') })
    await expect(api.saveMemory({ title: 'T', body: '', category: 'Nota', tags: [] })).rejects.toThrow('No se pudo guardar')
  })
  it('si falla al guardar archivos no deja contenido huérfano en memoria', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('lleno', 'QuotaExceededError') })
    await expect(api.addFiles([file('a.txt')], null)).rejects.toThrow('No se pudo guardar')
    vi.restoreAllMocks()
    expect(await api.files()).toEqual([])
  })
  it('un fallo del registro de actividad no invalida una operación ya guardada', async () => {
    const real = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (k.endsWith('activity')) throw new DOMException('lleno', 'QuotaExceededError')
      return real.call(this, k, v)
    })
    await expect(api.saveMemory({ title: 'T', body: '', category: 'Nota', tags: [] })).resolves.toBeUndefined()
    expect(await api.memories()).toHaveLength(1)
  })
})
