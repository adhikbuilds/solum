import { useQuery } from '@tanstack/react-query'
import type { Study } from './types'

async function get<T>(url: string): Promise<T> {
  const r = await fetch(url)
  if (!r.ok) {
    // The service distinguishes a bad plot number (400), an unknown plot (404) and an upstream
    // DDA failure (502). Surfacing the difference is what lets the UI say something useful
    // instead of "something went wrong".
    const body = await r.json().catch(() => ({}))
    throw new Error(body.detail ?? `Request failed (${r.status})`)
  }
  return r.json()
}

export function useStudy(plot: string | null, optimistic: boolean) {
  return useQuery({
    queryKey: ['study', plot ?? 'demo', optimistic],
    queryFn: () => {
      const q = optimistic ? '?optimistic=true' : ''
      return get<Study>(plot ? `/api/plot/${plot}${q}` : `/api/demo${q}`)
    },
    // A plot's regulatory record does not change while someone is looking at it.
    staleTime: 5 * 60_000,
    retry: 1,
  })
}
