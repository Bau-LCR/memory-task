import { createContext, useContext } from 'react'
import type { Session } from '../types'

export const SessionCtx = createContext<{ session: Session | null; refresh: () => Promise<void> }>({
  session: null,
  refresh: async () => {},
})
export const useSession = () => useContext(SessionCtx)
export const go = (path: string) => { window.location.hash = path }
