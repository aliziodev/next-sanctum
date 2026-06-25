import { act, renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  SanctumProvider,
  useApi,
  useAuth,
  useClient,
  useMutation,
  usePasskeys,
  useResource,
  useTwoFactor,
  useUser,
  ValidationError,
} from "../src"
import type { SanctumConfig } from "../src"
import { makeFetch, type MockRoute } from "./helpers"

const BASE = "https://api.test"

function wrap(config: SanctumConfig, initialUser?: unknown) {
  return ({ children }: { children: ReactNode }) => (
    <SanctumProvider config={config} initialUser={initialUser}>
      {children}
    </SanctumProvider>
  )
}

function setup(routes: MockRoute[], extra: Partial<SanctumConfig> = {}) {
  const { fn, calls } = makeFetch(routes)
  const config: SanctumConfig = { baseUrl: BASE, fetch: fn, ...extra }
  return { config, calls }
}

beforeEach(() => {
  document.cookie = "XSRF-TOKEN=tok"
})

describe("SanctumProvider + hooks", () => {
  it("throws when a hook is used outside the provider", () => {
    expect(() => renderHook(() => useAuth())).toThrow(/SanctumProvider/)
  })

  it("seeds initialUser (authenticated, no mount fetch)", () => {
    const { config, calls } = setup([])
    const { result } = renderHook(() => useAuth(), {
      wrapper: wrap(config, { id: 1, name: "Budi" }),
    })
    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.user).toEqual({ id: 1, name: "Budi" })
    expect(calls.some((c) => c.url.endsWith("/api/user"))).toBe(false)
  })

  it("login() transitions to authenticated", async () => {
    const { config } = setup(
      [
        { method: "POST", path: "/login", body: { two_factor: false } },
        { method: "GET", path: "/api/user", body: { id: 1, name: "Budi" } },
      ],
      { initialRequest: false },
    )
    const { result } = renderHook(() => useAuth(), { wrapper: wrap(config) })
    expect(result.current.isAuthenticated).toBe(false)

    await act(async () => {
      const r = await result.current.login({ email: "a@b.com", password: "x" })
      expect(r.status).toBe("authenticated")
    })

    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.user).toEqual({ id: 1, name: "Budi" })
  })

  it("login() returns two-factor-required without authenticating", async () => {
    const { config } = setup(
      [{ method: "POST", path: "/login", body: { two_factor: true } }],
      { initialRequest: false },
    )
    const { result } = renderHook(() => useAuth(), { wrapper: wrap(config) })
    await act(async () => {
      const r = await result.current.login({ email: "a@b.com", password: "x" })
      expect(r.status).toBe("two-factor-required")
    })
    expect(result.current.isAuthenticated).toBe(false)
  })

  it("logout() clears the user", async () => {
    const { config } = setup([{ method: "POST", path: "/logout" }])
    const { result } = renderHook(() => useAuth(), {
      wrapper: wrap(config, { id: 1 }),
    })
    expect(result.current.isAuthenticated).toBe(true)
    await act(async () => {
      await result.current.logout()
    })
    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.user).toBeNull()
  })

  it("de-duplicates concurrent login() calls (double-submit)", async () => {
    const { config, calls } = setup(
      [
        { method: "POST", path: "/login", body: { two_factor: false } },
        { method: "GET", path: "/api/user", body: { id: 1 } },
      ],
      { initialRequest: false },
    )
    const { result } = renderHook(() => useAuth(), { wrapper: wrap(config) })
    await act(async () => {
      await Promise.all([
        result.current.login({ email: "a@b.com", password: "x" }),
        result.current.login({ email: "a@b.com", password: "x" }),
      ])
    })
    expect(calls.filter((c) => c.url.endsWith("/login")).length).toBe(1)
  })

  it("useUser reflects the seeded user", () => {
    const { config } = setup([])
    const { result } = renderHook(() => useUser<{ name: string }>(), {
      wrapper: wrap(config, { name: "Budi" }),
    })
    expect(result.current?.name).toBe("Budi")
  })

  it("useTwoFactor / usePasskeys expose their APIs", () => {
    const { config } = setup([])
    const tf = renderHook(() => useTwoFactor(), {
      wrapper: wrap(config, { id: 1 }),
    })
    expect(typeof tf.result.current.challenge).toBe("function")
    expect(typeof tf.result.current.enable).toBe("function")

    const pk = renderHook(() => usePasskeys(), {
      wrapper: wrap(config, { id: 1 }),
    })
    expect(typeof pk.result.current.register).toBe("function")
    expect(typeof pk.result.current.login).toBe("function")
  })

  it("useApi fetches authenticated data", async () => {
    const { config } = setup(
      [{ method: "GET", path: "/api/posts", body: [{ id: 1 }] }],
      { initialRequest: false },
    )
    const { result } = renderHook(() => useApi<{ id: number }[]>("/api/posts"), {
      wrapper: wrap(config),
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).toEqual([{ id: 1 }])
  })

  it("fetches the user on mount when not prefetched (initialRequest)", async () => {
    const { config } = setup([{ method: "GET", path: "/api/user", body: { id: 9 } }])
    const { result } = renderHook(() => useAuth(), { wrapper: wrap(config) })
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true))
    expect(result.current.user).toEqual({ id: 9 })
  })

  it("reactive logout when an authenticated request returns 401", async () => {
    const { config } = setup([
      {
        method: "GET",
        path: "/api/secret",
        status: 401,
        body: { message: "Unauthenticated." },
      },
    ])
    const { result } = renderHook(
      () => ({ auth: useAuth(), api: useApi("/api/secret") }),
      { wrapper: wrap(config, { id: 1 }) },
    )
    expect(result.current.auth.isAuthenticated).toBe(true)
    await waitFor(() => expect(result.current.auth.isAuthenticated).toBe(false))
  })

  it("register / updateProfile / refresh update state", async () => {
    const { config } = setup(
      [
        { method: "POST", path: "/register", status: 201 },
        { method: "PUT", path: "/user/profile-information" },
        { method: "GET", path: "/api/user", body: { id: 5, name: "Reg" } },
      ],
      { initialRequest: false },
    )
    const { result } = renderHook(() => useAuth(), { wrapper: wrap(config) })
    await act(async () => {
      await result.current.register({
        email: "a@b.com",
        password: "x",
        password_confirmation: "x",
      })
    })
    expect(result.current.user).toEqual({ id: 5, name: "Reg" })
    await act(async () => {
      await result.current.updateProfile({ name: "New" })
    })
    await act(async () => {
      await result.current.refresh()
    })
    expect(result.current.isAuthenticated).toBe(true)
  })

  it("twoFactor.challenge refreshes identity", async () => {
    const { config } = setup(
      [
        { method: "POST", path: "/two-factor-challenge" },
        { method: "GET", path: "/api/user", body: { id: 7 } },
      ],
      { initialRequest: false },
    )
    const { result } = renderHook(
      () => ({ tf: useTwoFactor(), auth: useAuth() }),
      { wrapper: wrap(config) },
    )
    await act(async () => {
      await result.current.tf.challenge({ code: "123456" })
    })
    expect(result.current.auth.user).toEqual({ id: 7 })
  })

  it("useClient performs imperative authenticated requests (CRUD)", async () => {
    document.cookie = "XSRF-TOKEN=tok"
    const { config, calls } = setup(
      [{ method: "POST", path: "/api/posts", body: { id: 1, title: "Hi" } }],
      { initialRequest: false },
    )
    const { result } = renderHook(() => useClient(), {
      wrapper: wrap(config, { id: 1 }),
    })
    let created: unknown
    await act(async () => {
      created = await result.current.request("/api/posts", {
        method: "POST",
        json: { title: "Hi" },
      })
    })
    expect(created).toEqual({ id: 1, title: "Hi" })
    const call = calls.find((c) => c.url.endsWith("/api/posts"))
    expect(call?.method).toBe("POST")
  })

  it("useResource maps REST CRUD to the right endpoints", async () => {
    document.cookie = "XSRF-TOKEN=tok"
    const { config, calls } = setup(
      [
        { method: "GET", path: "/api/posts", body: [{ id: 1 }] },
        { method: "POST", path: "/api/posts", body: { id: 2 } },
        { method: "PUT", path: "/api/posts/2", body: { id: 2 } },
        { method: "DELETE", path: "/api/posts/2" },
      ],
      { initialRequest: false },
    )
    const { result } = renderHook(() => useResource<{ id: number }>("/api/posts"), {
      wrapper: wrap(config, { id: 1 }),
    })
    await act(async () => {
      expect(await result.current.list()).toEqual([{ id: 1 }])
      await result.current.create({ title: "x" })
      await result.current.update(2, { title: "y" })
      await result.current.delete(2)
    })
    const hit = (path: string, method: string) =>
      calls.some((c) => c.url.endsWith(path) && c.method === method)
    expect(hit("/api/posts", "POST")).toBe(true)
    expect(hit("/api/posts/2", "PUT")).toBe(true)
    expect(hit("/api/posts/2", "DELETE")).toBe(true)
  })

  it("useMutation manages loading + lifecycle callbacks", async () => {
    document.cookie = "XSRF-TOKEN=tok"
    const { config } = setup(
      [{ method: "POST", path: "/api/posts", body: { id: 7 } }],
      { initialRequest: false },
    )
    const onSuccess = vi.fn()
    const onFinish = vi.fn()
    const { result } = renderHook(
      () => {
        const { request } = useClient()
        return useMutation(
          (vars: { title: string }) =>
            request<{ id: number }>("/api/posts", { method: "POST", json: vars }),
          { onSuccess, onFinish },
        )
      },
      { wrapper: wrap(config, { id: 1 }) },
    )

    expect(result.current.isPending).toBe(false)
    await act(async () => {
      await result.current.mutateAsync({ title: "x" })
    })
    expect(result.current.data).toEqual({ id: 7 })
    expect(onSuccess).toHaveBeenCalledWith({ id: 7 }, { title: "x" })
    expect(onFinish).toHaveBeenCalled()
  })

  it("useMutation surfaces a 422 ValidationError (form pattern)", async () => {
    document.cookie = "XSRF-TOKEN=tok"
    const { config } = setup(
      [
        {
          method: "POST",
          path: "/api/posts",
          status: 422,
          body: { message: "Invalid", errors: { title: ["The title field is required."] } },
        },
      ],
      { initialRequest: false },
    )
    const onError = vi.fn()
    const { result } = renderHook(
      () => {
        const { request } = useClient()
        return useMutation(
          (vars: { title: string }) =>
            request("/api/posts", { method: "POST", json: vars }),
          { onError },
        )
      },
      { wrapper: wrap(config, { id: 1 }) },
    )
    await act(async () => {
      await result.current.mutateAsync({ title: "" }).catch(() => {})
    })
    expect(result.current.error).toBeInstanceOf(ValidationError)
    expect((result.current.error as ValidationError).errors).toEqual({
      title: ["The title field is required."],
    })
    expect(onError).toHaveBeenCalled()
  })

  it("useApi.refetch re-runs the request", async () => {
    const { config, calls } = setup(
      [{ method: "GET", path: "/api/x", body: { v: 1 } }],
      { initialRequest: false },
    )
    const { result } = renderHook(() => useApi<{ v: number }>("/api/x"), {
      wrapper: wrap(config),
    })
    await waitFor(() => expect(result.current.data).toEqual({ v: 1 }))
    await act(async () => {
      await result.current.refetch()
    })
    expect(calls.filter((c) => c.url.endsWith("/api/x")).length).toBe(2)
  })
})
