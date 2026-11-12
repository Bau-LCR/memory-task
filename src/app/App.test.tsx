import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
vi.mock('../lib/supabase', () => ({ supabase: null, isSupabaseConfigured: false }))
import { isSupabaseConfigured } from '../lib/supabase'

const goTo = (hash: string) => { window.location.hash = hash }
const isDisabled = (el: HTMLElement) => (el as HTMLButtonElement | HTMLInputElement).disabled
const sidebarLink = (name: string) => within(screen.getByRole('navigation', { name: 'Principal' })).getByRole('link', { name })
const heading = (name: string | RegExp) => screen.findByRole('heading', { name, level: 1 })

async function loginAs(mode: 'personal' | 'service') {
  const user = userEvent.setup()
  goTo('/login')
  render(<App />)
  await user.click(await screen.findByRole('button', { name: 'Entrar en modo demostración' }))
  await heading('¿Cómo quieres usar Memory Task?')
  const choose = screen.getAllByRole('button', { name: 'Elegir' })
  await user.click(choose[mode === 'personal' ? 0 : 1])
  return user
}

describe('navegación y protección de rutas', () => {
  it('muestra la landing en la raíz', async () => {
    render(<App />)
    expect(await heading(/Memoria y almacenamiento/)).toBeTruthy()
  })
  it('sin sesión, una ruta privada redirige al login', async () => {
    goTo('/panel')
    render(<App />)
    expect(await heading('Iniciar sesión')).toBeTruthy()
    expect(window.location.hash).toBe('#/login')
  })
  it('el botón de Google refleja si Supabase está configurado', async () => {
    goTo('/login')
    render(<App />)
    const g = await screen.findByRole('button', { name: /Google/ })
    expect(isDisabled(g)).toBe(!isSupabaseConfigured)
    if (isSupabaseConfigured) {
      expect(g.textContent).toContain('Continuar con Google')
    } else {
      expect(g.textContent).toContain('pendiente')
    }
  })
  it('con sesión pero sin modalidad, redirige a elegir modalidad', async () => {
    const user = userEvent.setup()
    goTo('/login')
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Entrar en modo demostración' }))
    await heading('¿Cómo quieres usar Memory Task?')
    goTo('/archivos')
    await heading('¿Cómo quieres usar Memory Task?')
  })
  it('en modalidad personal, las rutas de servicio redirigen al panel', async () => {
    await loginAs('personal')
    await heading('Panel personal')
    goTo('/servicio')
    await heading('Panel personal')
  })
  it('cerrar sesión devuelve a la landing y vuelve a proteger las rutas', async () => {
    const user = await loginAs('personal')
    await heading('Panel personal')
    await user.click(screen.getByRole('button', { name: 'Salir' }))
    await heading(/Memoria y almacenamiento/)
    goTo('/panel')
    await heading('Iniciar sesión')
  })
})

describe('recuerdos (flujo completo)', () => {
  it('crea, busca, edita con versionado y elimina', async () => {
    const user = await loginAs('personal')
    await heading('Panel personal')
    await user.click(screen.getByRole('link', { name: 'Recuerdos' }))
    await heading('Recuerdos')
    expect(screen.getByText(/Aún no hay recuerdos/)).toBeTruthy()

    // crear
    await user.click(screen.getByRole('button', { name: 'Nuevo recuerdo' }))
    await user.type(screen.getByLabelText('Título'), 'Viaje a Mendoza')
    await user.type(screen.getByLabelText('Texto'), 'Vinos y montañas')
    await user.type(screen.getByLabelText('Etiquetas'), 'Viaje, vino')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('Viaje a Mendoza')).toBeTruthy()
    expect(screen.getByText('#viaje')).toBeTruthy()

    // título vacío muestra error y no guarda
    await user.click(screen.getByRole('button', { name: 'Nuevo recuerdo' }))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect((await screen.findByRole('alert')).textContent).toContain('título es obligatorio')
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    // buscar
    await user.type(screen.getByLabelText('Buscar recuerdos'), 'zzz')
    expect(await screen.findByText(/Ningún recuerdo coincide/)).toBeTruthy()
    await user.clear(screen.getByLabelText('Buscar recuerdos'))
    await user.type(screen.getByLabelText('Buscar recuerdos'), 'vino')
    expect(await screen.findByText('Viaje a Mendoza')).toBeTruthy()
    await user.clear(screen.getByLabelText('Buscar recuerdos'))

    // editar => versión previa
    await user.click(screen.getByRole('button', { name: 'Editar' }))
    const t = screen.getByLabelText('Título')
    await user.clear(t); await user.type(t, 'Viaje a Salta')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('Viaje a Salta')).toBeTruthy()
    expect(screen.getByText(/1 versiones previas/)).toBeTruthy()

    // eliminar (confirmación)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: 'Eliminar' }))
    expect(await screen.findByText(/Aún no hay recuerdos/)).toBeTruthy()
  })

  it('los datos persisten al "recargar" (nuevo montaje de la app)', async () => {
    const user = await loginAs('personal')
    await user.click(await screen.findByRole('link', { name: 'Recuerdos' }))
    await user.click(await screen.findByRole('button', { name: 'Nuevo recuerdo' }))
    await user.type(screen.getByLabelText('Título'), 'Persistente')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await screen.findByText('Persistente')
    document.body.innerHTML = ''
    goTo('/recuerdos')
    render(<App />)
    expect(await screen.findByText('Persistente')).toBeTruthy()
  })
})

describe('archivos (flujo completo)', () => {
  it('sube, rechaza ejecutables, crea carpeta, mueve y elimina', async () => {
    const user = await loginAs('personal')
    await user.click(await screen.findByRole('link', { name: 'Archivos' }))
    await heading('Archivos')
    const input = document.querySelector('input[type=file]') as HTMLInputElement

    await user.upload(input, new File(['hola'], 'nota.txt', { type: 'text/plain' }))
    expect(await screen.findByText('nota.txt')).toBeTruthy()

    await user.upload(input, new File(['x'], 'malo.exe'))
    expect((await screen.findByRole('alert')).textContent).toContain('tipo de archivo no permitido')
    expect(screen.queryByText('malo.exe', { selector: 'span' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Nueva carpeta' }))
    await user.type(screen.getByPlaceholderText('Nombre de la carpeta'), 'Docs')
    await user.click(screen.getByRole('button', { name: 'Crear' }))
    expect(await screen.findByRole('button', { name: /Docs/ })).toBeTruthy()

    await user.selectOptions(screen.getByLabelText('Mover nota.txt'), 'Docs')
    await waitFor(() => expect(screen.getByText('No hay archivos que mostrar.')).toBeTruthy()) // ya no está en la raíz
    await user.click(screen.getByRole('button', { name: /Docs/ }))
    expect(await screen.findByText('nota.txt')).toBeTruthy()

    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: 'Eliminar' }))
    expect(await screen.findByText('No hay archivos que mostrar.')).toBeTruthy()
  })
})

describe('cuenta de servicio', () => {
  it('muestra la consola en desarrollo y avisa cuando Supabase no está configurado', async () => {
    await loginAs('service')
    await heading('Cuenta de servicio')
    expect(screen.getByText(/El backend todavía no está desplegado/)).toBeTruthy()
    expect(screen.getByText('En desarrollo')).toBeTruthy()
    expect(await screen.findByRole('alert')).toHaveTextContent('Supabase no está configurado.')
    expect(screen.getByRole('button', { name: 'Crear aplicación' })).toBeDisabled()
  })
})

describe('ajustes', () => {
  it('"Borrar datos" pide confirmación y limpia todo', async () => {
    const user = await loginAs('personal')
    await heading('Panel personal')
    await user.click(sidebarLink('Ajustes'))
    await heading('Ajustes')
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: 'Reiniciar datos locales' }))
    await heading(/Memoria y almacenamiento/)
    expect(Object.keys(localStorage).filter((k) => k.startsWith('mt:demo:'))).toHaveLength(0)
  })
  it('la IA está desactivada y no se puede activar', async () => {
    const user = await loginAs('personal')
    await heading('Panel personal')
    await user.click(sidebarLink('Ajustes'))
    const card = (await screen.findByText('Inteligencia artificial')).closest('section')!
    expect(isDisabled(within(card).getByRole('checkbox'))).toBe(true)
  })
})
