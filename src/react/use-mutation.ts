import { useCallback, useRef, useState } from "react"
import type { SanctumError } from "../core"

export interface UseMutationOptions<TData, TVars> {
  /** Runs just before the request. Return `false` to cancel it. */
  onBefore?: (vars: TVars) => boolean | void | Promise<boolean | void>
  onSuccess?: (data: TData, vars: TVars) => void
  onError?: (error: SanctumError, vars: TVars) => void
  /** Always runs after success or error (not when cancelled in onBefore). */
  onFinish?: (vars: TVars) => void
}

export interface UseMutationResult<TData, TVars> {
  /** Fire-and-forget (rejections are swallowed; read them from `error`). */
  mutate: (vars: TVars) => void
  /** Awaitable; resolves with the data or throws the SanctumError. */
  mutateAsync: (vars: TVars) => Promise<TData>
  isPending: boolean
  error: SanctumError | null
  data: TData | undefined
  reset: () => void
}

/**
 * A lightweight mutation hook (Inertia-style lifecycle) for imperative requests —
 * pair it with `useClient` / `useResource`. Manages `isPending` / `error` / `data`
 * and fires `onBefore` / `onSuccess` / `onError` / `onFinish`.
 *
 * ```tsx
 * const { request } = useClient()
 * const create = useMutation(
 *   (vars: { title: string }) => request<Post>("/api/posts", { method: "POST", json: vars }),
 *   { onSuccess: (post) => toast("Created"), onError: (e) => toast(e.message) },
 * )
 * <button disabled={create.isPending} onClick={() => create.mutate({ title })}>Save</button>
 * ```
 */
export function useMutation<TData = unknown, TVars = void>(
  mutationFn: (vars: TVars) => Promise<TData>,
  options: UseMutationOptions<TData, TVars> = {},
): UseMutationResult<TData, TVars> {
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<SanctumError | null>(null)
  const [data, setData] = useState<TData | undefined>(undefined)

  const fnRef = useRef(mutationFn)
  fnRef.current = mutationFn
  const optionsRef = useRef(options)
  optionsRef.current = options

  const mutateAsync = useCallback(async (vars: TVars): Promise<TData> => {
    const opts = optionsRef.current
    if ((await opts.onBefore?.(vars)) === false) {
      throw new Error("Mutation cancelled in onBefore")
    }
    setIsPending(true)
    setError(null)
    try {
      const result = await fnRef.current(vars)
      setData(result)
      opts.onSuccess?.(result, vars)
      return result
    } catch (err) {
      const sanctumError = err as SanctumError
      setError(sanctumError)
      opts.onError?.(sanctumError, vars)
      throw sanctumError
    } finally {
      setIsPending(false)
      opts.onFinish?.(vars)
    }
  }, [])

  const mutate = useCallback(
    (vars: TVars) => {
      void mutateAsync(vars).catch(() => {})
    },
    [mutateAsync],
  )

  const reset = useCallback(() => {
    setIsPending(false)
    setError(null)
    setData(undefined)
  }, [])

  return { mutate, mutateAsync, isPending, error, data, reset }
}
