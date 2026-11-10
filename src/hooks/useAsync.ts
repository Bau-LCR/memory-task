import { useCallback, useEffect, useState } from 'react'

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T>()
  const [error, setError] = useState<string>()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reload = useCallback(() => { fn().then(setData).catch((e: Error) => setError(e.message)) }, deps)
  useEffect(() => { reload() }, [reload])
  return { data, error, reload }
}
