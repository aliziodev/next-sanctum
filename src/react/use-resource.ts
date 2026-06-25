import { useMemo } from "react"
import { useSanctumContext } from "./context"
import type { SanctumRequestInit } from "../core"

export interface ResourceClient<T = unknown, TList = T[]> {
  /** `GET {base}` */
  list(init?: SanctumRequestInit): Promise<TList>
  /** `GET {base}/{id}` */
  get(id: string | number, init?: SanctumRequestInit): Promise<T>
  /** `POST {base}` */
  create(data: unknown, init?: SanctumRequestInit): Promise<T>
  /** `PUT {base}/{id}` */
  update(id: string | number, data: unknown, init?: SanctumRequestInit): Promise<T>
  /** `PATCH {base}/{id}` */
  patch(id: string | number, data: unknown, init?: SanctumRequestInit): Promise<T>
  /** `DELETE {base}/{id}` */
  delete(id: string | number, init?: SanctumRequestInit): Promise<void>
}

/**
 * A typed REST resource over the authenticated client — convenience sugar for CRUD.
 * Credentials (CSRF/cookie or Bearer) are attached automatically. `TList` defaults to
 * `T[]`; set it (e.g. `{ data: T[]; meta: … }`) for paginated Laravel resources.
 *
 * ```ts
 * const posts = useResource<Post>("/api/posts")
 * await posts.list()             // GET    /api/posts
 * await posts.create({ title })  // POST   /api/posts
 * await posts.update(1, { title })// PUT   /api/posts/1
 * await posts.delete(1)          // DELETE /api/posts/1
 * ```
 */
export function useResource<T = unknown, TList = T[]>(
  basePath: string,
): ResourceClient<T, TList> {
  const { client } = useSanctumContext()
  return useMemo(() => {
    const base = basePath.replace(/\/+$/, "")
    const at = (id: string | number) =>
      `${base}/${encodeURIComponent(String(id))}`
    return {
      list: (init) => client.request<TList>(base, { ...init, method: "GET" }),
      get: (id, init) => client.request<T>(at(id), { ...init, method: "GET" }),
      create: (data, init) =>
        client.request<T>(base, { ...init, method: "POST", json: data }),
      update: (id, data, init) =>
        client.request<T>(at(id), { ...init, method: "PUT", json: data }),
      patch: (id, data, init) =>
        client.request<T>(at(id), { ...init, method: "PATCH", json: data }),
      delete: (id, init) =>
        client.request<void>(at(id), { ...init, method: "DELETE" }),
    }
  }, [client, basePath])
}
