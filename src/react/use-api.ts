import { useCallback, useEffect, useRef, useState } from "react"
import { useSanctumContext } from "./context"
import type { SanctumError, SanctumRequestInit } from "../core"

export interface UseApiOptions extends SanctumRequestInit {
  /** Run automatically on mount / when the path changes (default true). */
  enabled?: boolean
}

export interface UseApiResult<T> {
  data: T | undefined
  error: SanctumError | null
  isLoading: boolean
  refetch: () => Promise<void>
}

/**
 * Authenticated fetch on the client. Minimal but sufficient for most cases;
 * SWR/TanStack Query adapters can be built on top of `useSanctumContext().client`.
 */
export function useApi<T = unknown>(
  path: string,
  options: UseApiOptions = {},
): UseApiResult<T> {
  const { client } = useSanctumContext()
  const { enabled = true, ...init } = options
  const initRef = useRef(init)
  initRef.current = init

  // Serialize the request shape so option changes (method/json/body) trigger a refetch,
  // not just `path`. Header changes are intentionally not part of the key (Headers
  // aren't reliably serializable) — encode dynamic values into `path`/`json`.
  const requestKey = JSON.stringify({
    method: init.method ?? "GET",
    json: init.json ?? null,
    body: typeof init.body === "string" ? init.body : null,
  })

  const [data, setData] = useState<T | undefined>(undefined)
  const [error, setError] = useState<SanctumError | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(enabled)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setData(await client.request<T>(path, initRef.current))
    } catch (err) {
      setError(err as SanctumError)
    } finally {
      setIsLoading(false)
    }
  }, [client, path, requestKey])

  useEffect(() => {
    if (!enabled) return
    let active = true
    setIsLoading(true)
    setError(null)
    client
      .request<T>(path, initRef.current)
      .then((result) => {
        if (active) setData(result)
      })
      .catch((err) => {
        if (active) setError(err as SanctumError)
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })
    return () => {
      active = false
    }
  }, [client, path, enabled, requestKey])

  return { data, error, isLoading, refetch }
}
