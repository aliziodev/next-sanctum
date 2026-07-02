# next-sanctum

[![CI](https://github.com/aliziodev/next-sanctum/actions/workflows/ci.yml/badge.svg)](https://github.com/aliziodev/next-sanctum/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/next-sanctum.svg)](https://www.npmjs.com/package/next-sanctum)
[![npm downloads](https://img.shields.io/npm/dm/next-sanctum.svg)](https://npm-stat.com/charts.html?package=next-sanctum)
[![install size](https://img.shields.io/badge/dynamic/json?url=https://packagephobia.com/v2/api.json?p=next-sanctum&query=$.install.pretty&label=install%20size)](https://packagephobia.now.sh/result?p=next-sanctum)
[![npm bundle size](https://img.shields.io/bundlephobia/minzip/next-sanctum)](https://bundlephobia.com/package/next-sanctum@latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/aliziodev/next-sanctum/blob/main/LICENSE)

A complete **Laravel (Fortify + Sanctum)** authentication client for the **Next.js** App Router.
Cookie/CSRF SPA + token/Bearer modes, SSR & CSR, route protection via `proxy.ts`, **2FA**,
**passkeys**, the full set of Fortify flows, and an authenticated client for **CRUD beyond auth**.

- ✅ Cookie/CSRF SPA (default) & token/Bearer
- ✅ SSR (Server Component, Route Handler, Server Action) + Client hooks
- ✅ Authenticated data fetching — reads (`useApi`), mutations (`useClient`), server (`serverFetch`)
- ✅ Full Fortify flows · 2FA TOTP · Passkeys (interop with `@laravel/passkeys`)
- ✅ TypeScript-first, dual ESM/CJS, tree-shakeable, **zero runtime deps** (~6 kB gzip)

> Compatible with **Next.js 15/16**, **React 18/19**, **Node 18.18+**.

> 🚀 **Want a ready-made app?** The [**Laravel + Next.js starter kit**](https://github.com/aliziodev/laravel-next-starter-kit) is built on next-sanctum — a full decoupled app (login, registration, 2FA, passkeys, settings, dark mode) scaffolded in one command:
> `laravel new my-app --using=aliziodev/laravel-next-starter-kit`

## Table of contents

- [Installation](#installation) · [Quick start](#quick-start-cookie-mode)
- [Hooks](#hooks-client) · [**Authenticated data & CRUD**](#authenticated-data--crud-beyond-auth)
- [Server helpers](#server-helpers-next-sanctumserver) · [Route guard](#route-guard-proxyts) · [Server Actions](#login-via-server-action-next-sanctumactions)
- [2FA](#2fa-fortify) · [Passkeys](#passkeys-interop) · [Device sessions](#device-sessions) · [Token mode](#token-mode-bearer) · [Catch-all proxy](#catch-all-server-proxy-anti-ssrf)
- [**Configuration reference**](#configuration-reference) · [**Responses & return types**](#responses--return-types) · [**Error handling**](#error-handling)
- [Events & interceptors](#events--interceptors) · [TypeScript](#typescript-the-user-model) · [Security](#security)

## Installation

```bash
pnpm add next-sanctum
# optional (only if you use passkeys):
pnpm add @laravel/passkeys
```

```env
NEXT_PUBLIC_SANCTUM_BASE_URL=https://api.domain.com   # client (public)
SANCTUM_BASE_URL=https://api.domain.com               # server (do NOT make public)
```

## Quick start (cookie mode)

Prefetch the user on the server → seed the provider (prevents a hydration mismatch):

```tsx
// app/layout.tsx (Server Component)
import { getUser } from "next-sanctum/server"
import { Providers } from "./providers"

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const initialUser = await getUser()
  return (
    <html lang="en">
      <body><Providers initialUser={initialUser}>{children}</Providers></body>
    </html>
  )
}
```

```tsx
// app/providers.tsx (Client)
"use client"
import { SanctumProvider } from "next-sanctum"

export function Providers({ children, initialUser }: { children: React.ReactNode; initialUser?: unknown }) {
  return (
    <SanctumProvider
      config={{ baseUrl: process.env.NEXT_PUBLIC_SANCTUM_BASE_URL!, mode: "cookie" }}
      initialUser={initialUser}
    >
      {children}
    </SanctumProvider>
  )
}
```

```tsx
"use client"
import { useAuth } from "next-sanctum"

export function LoginForm() {
  const { login } = useAuth()
  async function onSubmit(email: string, password: string) {
    const result = await login({ email, password })
    if (result.status === "two-factor-required") {
      // redirect to the 2FA challenge screen → useTwoFactor().challenge({ code })
    } else {
      // result.status === "authenticated"; result.user is populated
    }
  }
}
```

## Hooks (client)

| Hook | Returns |
|---|---|
| `useAuth<T>()` | `user`, `isAuthenticated`, `isLoading`, `login`, `logout`, `refresh`, `register`, `forgotPassword`, `resetPassword`, `confirmPassword`, `confirmedPasswordStatus`, `updatePassword`, `updateProfile`, `resendEmailVerification` |
| `useUser<T>()` | the reactive user (`T \| null`) |
| `useApi<T>(path, opts?)` | a GET resource → `{ data, error, isLoading, refetch }` (auto-fetches) |
| `useClient()` | the authenticated client for imperative requests → `{ request, raw, ensureCsrf, config }` |
| `useResource<T>(base)` | typed REST CRUD over `useClient` → `{ list, get, create, update, patch, delete }` |
| `useMutation(fn, opts?)` | imperative mutation + loading + lifecycle → `{ mutate, mutateAsync, isPending, error, data, reset }` |
| `useTwoFactor()` | `challenge`, `enable`, `confirm`, `disable`, `getQrCode`, `getSecretKey`, `getRecoveryCodes`, `regenerateRecoveryCodes` |
| `usePasskeys()` | `isSupported`, `register`, `login`, `confirmPassword`, `delete` (requires `@laravel/passkeys`) |
| `useSessions()` | `list`, `logoutOthers`, `logout` (opt-in `features.deviceSessions` + [custom Laravel endpoints](#device-sessions)) |

## Authenticated data & CRUD (beyond auth)

> **Credentials are automatic.** Every request via `useApi` / `useClient` / `useResource` /
> `serverFetch` attaches the base URL plus — in **cookie mode** — `credentials: include` (session
> cookie) and the `X-XSRF-TOKEN` CSRF header on stateful methods, or — in **token mode** — the
> `Authorization: Bearer <token>` header. You never wire credentials manually.

### Read — `useApi` (auto-fetch)

```tsx
"use client"
import { useApi } from "next-sanctum"

type Post = { id: number; title: string }

function Posts() {
  const { data, error, isLoading, refetch } = useApi<Post[]>("/api/posts")
  if (isLoading) return <p>Loading…</p>
  if (error) return <p>{error.message}</p>
  return (
    <>
      <button onClick={() => refetch()}>Reload</button>
      <ul>{data?.map((p) => <li key={p.id}>{p.title}</li>)}</ul>
    </>
  )
}
```

`useApi` fetches on mount and whenever `path` / `method` / `json` / `body` change. For SWR or
TanStack Query, build on `useClient()` instead.

### Create / Update / Delete — `useClient` (imperative)

```tsx
"use client"
import { useClient } from "next-sanctum"

type Post = { id: number; title: string }

function usePosts() {
  const { request } = useClient() // request<T>() returns parsed JSON; raw() returns a Response

  return {
    create: (title: string) =>
      request<Post>("/api/posts", { method: "POST", json: { title } }),
    update: (id: number, title: string) =>
      request<Post>(`/api/posts/${id}`, { method: "PUT", json: { title } }),
    remove: (id: number) =>
      request<void>(`/api/posts/${id}`, { method: "DELETE" }),
    get: (id: number) => request<Post>(`/api/posts/${id}`),
  }
}
```

- `request<T>(path, init?)` → `Promise<T>` — parsed JSON (or `undefined` for `204`/empty).
- `raw(path, init?)` → `Promise<Response>` — when you need the status/headers.
- `init` (`SanctumRequestInit`) extends `RequestInit` with `json?: unknown` (serializes + sets `content-type`). Non-2xx responses throw a [`SanctumError`](#error-handling).

### REST resource — `useResource` (CRUD sugar)

```tsx
"use client"
import { useResource } from "next-sanctum"

type Post = { id: number; title: string }

function PostsAdmin() {
  const posts = useResource<Post>("/api/posts")
  // posts.list()            → GET    /api/posts
  // posts.get(id)           → GET    /api/posts/:id
  // posts.create(data)      → POST   /api/posts
  // posts.update(id, data)  → PUT    /api/posts/:id
  // posts.patch(id, data)   → PATCH  /api/posts/:id
  // posts.delete(id)        → DELETE /api/posts/:id
}
```

For paginated Laravel resources, type the list shape:
`useResource<Post, { data: Post[]; meta: Meta }>("/api/posts")`.

### Mutations with loading & lifecycle (Inertia-style)

`useClient` / `useResource` are imperative, so wrap them in **`useMutation`** for `isPending` +
`onBefore` / `onSuccess` / `onError` / `onFinish`:

```tsx
import { useClient, useMutation } from "next-sanctum"

const { request } = useClient()
const create = useMutation(
  (vars: { title: string }) => request<Post>("/api/posts", { method: "POST", json: vars }),
  { onSuccess: () => toast("Saved"), onError: (e) => toast(e.message), onFinish: () => {} },
)

<button disabled={create.isPending} onClick={() => create.mutate({ title })}>Save</button>
// create.isPending · create.error · create.data · create.reset()
```

**Forms & Laravel 422 validation** — catch `ValidationError` to render field errors:

```tsx
import { useState } from "react"
import { useClient, useMutation, ValidationError } from "next-sanctum"

function PostForm() {
  const { request } = useClient()
  const [title, setTitle] = useState("")
  const [errors, setErrors] = useState<Record<string, string[]>>({})

  const save = useMutation(() => request("/api/posts", { method: "POST", json: { title } }), {
    onBefore: () => setErrors({}),
    onError: (e) => { if (e instanceof ValidationError) setErrors(e.errors) },
  })

  return (
    <form onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
      <input value={title} onChange={(e) => setTitle(e.target.value)} />
      {errors.title && <p>{errors.title[0]}</p>}
      <button disabled={save.isPending}>Save</button>
    </form>
  )
}
```

> For richer form state (dirty tracking, field arrays, schema validation), pair `useClient` /
> `useMutation` with a dedicated form library — **react-hook-form** or **TanStack Form**.
> next-sanctum stays focused on auth.

> **`onProgress`?** `fetch` doesn't expose upload progress (Inertia uses XHR under the hood). The other lifecycle callbacks are supported; upload progress would need a separate XHR-based path.

### Uploads & raw responses

```tsx
const { request, raw } = useClient()
// FormData upload — do NOT set content-type; the browser adds the multipart boundary:
await request("/api/avatar", { method: "POST", body: formData })
// need status / headers / a binary body? use raw():
const res = await raw("/api/report.pdf")
const blob = await res.blob()
```

### Server-side (Server Component / Route Handler / Server Action)

```tsx
import { serverFetch, getUser } from "next-sanctum/server"

export default async function Dashboard() {
  const posts = await serverFetch("/api/posts").then((r) => r.json())
  return <PostList posts={posts} />
}

// mutation inside a Server Action:
async function createPost(title: string) {
  "use server"
  const res = await serverFetch("/api/posts", { method: "POST", json: { title } })
  return res.json()
}
```

### Using with SWR / TanStack Query

The built-in `useApi` / `useResource` are intentionally minimal (no caching/revalidation) — great for
simple apps. For caching, deduplication, and background revalidation, use **`useClient` as the
fetcher** and let the query library own the cache (next-sanctum adds no such dependency):

```tsx
// SWR
import useSWR from "swr"
import { useClient } from "next-sanctum"

function Posts() {
  const { request } = useClient()
  const { data, isLoading } = useSWR("/api/posts", (url) => request<Post[]>(url))
}
```

```tsx
// TanStack Query
import { useQuery } from "@tanstack/react-query"
import { useClient } from "next-sanctum"

const { request } = useClient()
const { data } = useQuery({ queryKey: ["posts"], queryFn: () => request<Post[]>("/api/posts") })
// mutations: useMutation({ mutationFn: (d) => request("/api/posts", { method: "POST", json: d }) })
```

## Server helpers (`next-sanctum/server`)

```ts
import { getUser, serverFetch, safeRedirect, createSanctumRouteProxy } from "next-sanctum/server"
```

- `getUser<T>(opts?)` → `Promise<T | null>` — the authenticated user (forwards cookies). Network/parse errors resolve to `null`; a missing `SANCTUM_BASE_URL` throws.
- `serverFetch(path, init?)` → `Promise<Response>` — server fetch forwarding cookies + CSRF (bootstraps the CSRF cookie for stateful requests). Rejects absolute URLs whose origin ≠ base (anti-SSRF).
- `safeRedirect(target, fallback, { origin?, allowList? })` → `string` — same-origin only (anti open-redirect).
- `createSanctumRouteProxy({ upstream })` — anti-SSRF catch-all proxy ([below](#catch-all-server-proxy-anti-ssrf)).

```tsx
// app/dashboard/page.tsx — secure check close to the data source
import { redirect } from "next/navigation"
import { getUser } from "next-sanctum/server"

export default async function Dashboard() {
  const user = await getUser<{ name: string }>()
  if (!user) redirect("/login")
  return <h1>Hello, {user.name}</h1>
}
```

## Route guard (`proxy.ts`)

```ts
// proxy.ts (root) — modern Next.js, NOT middleware.ts
import { createSanctumProxy } from "next-sanctum/proxy"

export default createSanctumProxy({
  authOnly: ["/dashboard/:path*", "/account"],
  guestOnly: ["/login", "/register"],
  sessionCookie: "laravel_session", // optimistic check (default)
  redirect: { onAuthOnly: "/login", onGuestOnly: "/", keepRequestedRoute: true },
})

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
}
```

> The proxy is **optimistic only** (reads the session cookie). Real authorization MUST live in a Server Component/Action (`getUser`).

## Login via Server Action (`next-sanctum/actions`)

`server-only` helpers that you **wrap** in your own Server Action (they write Laravel's Set-Cookie):

```ts
// app/actions/auth.ts
"use server"
import { z } from "zod"
import { redirect } from "next/navigation"
import * as auth from "next-sanctum/actions"
import { safeRedirect } from "next-sanctum/server"

const Schema = z.object({ email: z.email(), password: z.string().min(1) })

export async function loginAction(_prev: unknown, formData: FormData) {
  const parsed = Schema.safeParse({ email: formData.get("email"), password: formData.get("password") })
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors }

  const result = await auth.login(parsed.data) // → ActionResult
  if (!result.ok) return { message: "Invalid email or password.", errors: result.errors }
  if (result.twoFactor) redirect("/two-factor-challenge")
  redirect(safeRedirect(formData.get("redirect")?.toString(), "/dashboard"))
}
```

Available: `login`, `logout`, `register`, `twoFactorChallenge`, `forgotPassword`, `resetPassword`, `confirmPassword` — each `(payload, config?) → Promise<ActionResult>`.

> **Security — call these from Server Actions only.** The helpers bootstrap + echo Laravel's
> CSRF token themselves, so the effective cross-site protection is Next.js's Server-Action
> Origin check. A plain Route Handler has no such check — a cross-site POST to it could
> trigger state changes (e.g. login CSRF). If you must use a Route Handler, validate the
> request's `Origin` header against your app origin first.

## 2FA (Fortify)

```tsx
"use client"
import { useTwoFactor } from "next-sanctum"

const tf = useTwoFactor()
await tf.enable()                          // requires password confirmation first
const { svg } = await tf.getQrCode()       // → { svg: string }
const codes = await tf.getRecoveryCodes()  // → string[]
await tf.confirm("123456")
// when login returns "two-factor-required":
await tf.challenge({ code: "123456" })     // or { recovery_code }
```

## Passkeys (interop)

```tsx
"use client"
import { usePasskeys } from "next-sanctum"

const pk = usePasskeys()                 // requires the @laravel/passkeys package
if (await pk.isSupported()) {
  await pk.register("MacBook Pro")       // → { id, name }
  await pk.login()                       // passwordless login
}
```

## Device sessions

Opt-in (`features.deviceSessions: true`). Fortify ships no sessions API, but Laravel's default
migration already includes the `sessions` table — set `SESSION_DRIVER=database` and expose three
small endpoints over it (the [laravel-next-starter-kit](https://github.com/aliziodev/laravel-next-starter-kit)
includes them):

| Endpoint | Contract |
|---|---|
| `GET /api/sessions` | `DeviceSession[]` — `{ id, ip_address, user_agent, is_current, last_active_at }` (ISO-8601, from `last_activity`) |
| `DELETE /api/sessions/others` | log out every other session; validate `{ password }` from the body (or protect with `password.confirm`) |
| `DELETE /api/sessions/{id}` | log out one session (must belong to the user; reject the current one) |

```tsx
"use client"
import { useSessions } from "next-sanctum"

const sessions = useSessions()
const rows = await sessions.list()                       // → DeviceSession[]
await sessions.logoutOthers({ password: "secret" })      // keep only this device
await sessions.logout(rows[1].id)                        // revoke one device
```

Endpoint paths are configurable via `endpoints.sessions` (`list` / `logoutOthers` / `logout`).

## Token mode (Bearer)

```tsx
import { SanctumProvider, MemoryStorage } from "next-sanctum"

<SanctumProvider config={{
  baseUrl: process.env.NEXT_PUBLIC_SANCTUM_BASE_URL!,
  mode: "token",
  storage: new MemoryStorage(),   // default; or LocalStorage (opt-in) / CookieTokenStorage
}}>{children}</SanctumProvider>
```

> 2FA during login is cookie-mode only (Fortify's challenge establishes a session, not a token).

## Catch-all server proxy (anti-SSRF)

Make Next + Laravel look same-origin: the browser talks only to your Next domain.

```ts
// app/api/sanctum/[...path]/route.ts
import { createSanctumRouteProxy } from "next-sanctum/server"

const handler = createSanctumRouteProxy({ upstream: process.env.SANCTUM_BASE_URL! })
export const GET = handler
export const POST = handler
export const PUT = handler
export const PATCH = handler
export const DELETE = handler
```

`upstream` is pinned, path traversal & absolute URLs are rejected, only an allowlist of response headers (plus Set-Cookie) is forwarded. Responses default to `Cache-Control: no-store` unless the upstream says otherwise. `X-Forwarded-For` is passed through so Laravel throttling/audit sees the real client IP — configure Laravel's `TrustProxies`, and note it is only trustworthy behind a proxy you control.

## Configuration reference

### Centralizing config (one place)

The full config object **can't live in `next.config.ts`** — the App Router has no runtime config
from there (`publicRuntimeConfig` / `serverRuntimeConfig` are deprecated and don't apply). Instead:

- **Base URL** → env (`.env.local`, or `next.config.ts`'s `env` field): `NEXT_PUBLIC_SANCTUM_BASE_URL` (client) and `SANCTUM_BASE_URL` (server, private).
- **Everything else** → a shared module you import once:

```ts
// lib/sanctum.ts
import type { SanctumConfig } from "next-sanctum"

export const sanctumConfig = {
  baseUrl: process.env.NEXT_PUBLIC_SANCTUM_BASE_URL!,
  mode: "cookie",
  endpoints: { user: "/api/me" },
  redirect: { onLogin: "/dashboard" },
} satisfies SanctumConfig
```

```tsx
// app/providers.tsx
import { sanctumConfig } from "@/lib/sanctum"
<SanctumProvider config={sanctumConfig} initialUser={initialUser}>{children}</SanctumProvider>
```

> Server helpers (`getUser`, `serverFetch`) read the base URL from the **`SANCTUM_BASE_URL`** env on their own — keep the private server URL there (it may differ from the public client one).

### All options

Only `baseUrl` is required. Pass any of these to `SanctumProvider`'s `config` (or `createSanctumClient`):

```tsx
import { SanctumProvider } from "next-sanctum"

<SanctumProvider config={{
  baseUrl: process.env.NEXT_PUBLIC_SANCTUM_BASE_URL!, // required
  mode: "cookie",                       // "cookie" (default) | "token"
  origin: "https://app.domain.com",     // for safeRedirect / Referer; default window.location.origin

  // Toggle features (mirrors Laravel Fortify's `features`)
  features: {
    registration: true,
    resetPasswords: true,
    emailVerification: true,
    updateProfileInformation: true,
    updatePasswords: true,
    twoFactorAuthentication: { confirm: true, confirmPassword: true }, // or `false`
    passkeys: false,                    // requires @laravel/passkeys; `true` / { confirmPassword }
    deviceSessions: false,              // requires custom Laravel endpoints (see Device sessions)
  },

  // Override any endpoint (deep-merged over the Fortify/Sanctum defaults)
  endpoints: {
    login: "/api/login",
    user: "/api/me",
    twoFactor: { challenge: "/api/2fa/challenge" },
  },

  csrf: { cookie: "XSRF-TOKEN", header: "X-XSRF-TOKEN" }, // defaults shown

  redirect: {
    onLogin: "/dashboard",
    onLogout: "/",
    onAuthOnly: "/login",
    onGuestOnly: "/",
    keepRequestedRoute: false,          // append ?redirect= (same-origin)
  },

  initialRequest: true,                 // fetch the user on mount (when no initialUser)
  retryOnCsrfMismatch: true,            // refresh CSRF + retry once on 419
  redirectIfUnauthenticated: "/login",  // on a 401 while authenticated → clear + redirect (default false)
  logLevel: 3,                          // 0 silent · 1 error · 2 warn · 3 info · 4 debug · 5 verbose
  storage: undefined,                   // token mode: MemoryStorage (default) | LocalStorage | CookieTokenStorage
  fetch: undefined,                     // custom fetch implementation
  interceptors: { request: [], response: [] },
  events: { onLogin: ({ user }) => {}, onLogout: () => {} },
}} />
```

### Defaults

| Option | Default | Option | Default |
|---|---|---|---|
| `mode` | `"cookie"` | `csrf.cookie` / `csrf.header` | `XSRF-TOKEN` / `X-XSRF-TOKEN` |
| `endpoints.login` | `/login` | `endpoints.logout` | `/logout` |
| `endpoints.user` | `/api/user` | `endpoints.csrf` | `/sanctum/csrf-cookie` |
| `endpoints.register` | `/register` | `endpoints.confirmPassword` | `/user/confirm-password` |
| `redirect.onAuthOnly` | `/login` | `redirect.onLogin` | `/` |
| `initialRequest` | `true` | `retryOnCsrfMismatch` | `true` |
| `logLevel` | `3` | `redirectIfUnauthenticated` | `false` |

2FA endpoints default to `/user/two-factor-authentication`, `/two-factor-challenge`, `/user/two-factor-qr-code`, `/user/two-factor-secret-key`, `/user/two-factor-recovery-codes`. Passkey endpoints default to `/passkeys/login(/options)`, `/passkeys/confirm(/options)`, `/user/passkeys(/options)`.

## Responses & return types

### `useAuth()`

```ts
const { user, isAuthenticated, isLoading, login, logout, refresh, /* …account actions */ } = useAuth<User>()
```

`login(credentials)` returns a **discriminated** result — always check `status`:

```ts
type LoginResult<User> =
  | { status: "authenticated"; user: User }
  | { status: "two-factor-required" }
```

Other actions: `logout(): Promise<void>` · `refresh(): Promise<User | null>` ·
`register(payload): Promise<void>` · `forgotPassword/resetPassword/confirmPassword/updatePassword/updateProfile/resendEmailVerification: Promise<void>` ·
`confirmedPasswordStatus(): Promise<boolean>`.

### `useApi()` / `useClient()`

```ts
// useApi(path)
{ data: T | undefined; error: SanctumError | null; isLoading: boolean; refetch: () => Promise<void> }

// useClient()
{ request<T>(path, init?): Promise<T>; raw(path, init?): Promise<Response>; ensureCsrf(force?): Promise<void>; config }
```

Example API response (your Laravel `GET /api/user`):

```jsonc
// what getUser() / useUser() resolve to — your Sanctum user resource, e.g.
{ "id": 1, "name": "Budi", "email": "budi@example.com", "email_verified_at": "2026-01-02T03:04:05Z" }
```

### Server Actions — `ActionResult`

```ts
interface ActionResult {
  ok: boolean
  status: number
  twoFactor?: boolean                 // login: true → redirect to the 2FA challenge
  errors?: Record<string, string[]>   // 422 → Laravel validation errors
}
```

## Error handling

Every non-2xx response throws a normalized `SanctumError` (network failures too):

```ts
class SanctumError extends Error {
  kind: "config" | "network" | "unauthorized" | "forbidden" | "csrf" | "validation" | "http" | "unknown"
  status?: number
  data?: unknown   // the parsed response body
}
class ValidationError extends SanctumError { errors: Record<string, string[]> } // 422
```

```tsx
import { SanctumError, ValidationError, useClient } from "next-sanctum"

const { request } = useClient()
try {
  await request("/api/posts", { method: "POST", json: { title: "" } })
} catch (err) {
  if (err instanceof ValidationError) {
    // err.errors → { title: ["The title field is required."] }
  } else if (err instanceof SanctumError && err.kind === "unauthorized") {
    // 401 — session expired (the provider also clears state reactively)
  }
}
```

## Events & interceptors

```tsx
<SanctumProvider config={{
  baseUrl,
  // keyed by event name (not "onLogin")
  events: {
    login: ({ user }) => analytics.identify(user),
    logout: () => analytics.reset(),
    error: ({ error }) => console.error(error.kind, error.status),
  },
  interceptors: {
    // return a new Request (its headers are immutable in place)
    request: [
      (req) => {
        const headers = new Headers(req.headers)
        headers.set("X-Tenant", getTenant())
        return new Request(req, { headers })
      },
    ],
    response: [(res) => res],
  },
}}>{children}</SanctumProvider>
```

Event names: `init`, `login`, `logout`, `refresh`, `two-factor-required`, `error`, `redirect`, `request`, `response`. Payloads: `login`/`init`/`refresh` → `{ user }`, `error` → `{ error }`, `redirect` → `{ to, reason }`. A throwing handler is isolated and won't break the auth flow.

## TypeScript: the User model

Pass your model as a generic — it flows through `getUser`, `useUser`, `useAuth`, and the `login` result:

```ts
interface User { id: number; name: string; email: string }

const user = await getUser<User>()          // User | null (server)
const { user, login } = useAuth<User>()     // user: User | null
const me = useUser<User>()                  // User | null
```

## Security

- Cookie/CSRF: `XSRF-TOKEN` is **URL-decoded** → `X-XSRF-TOKEN`; `credentials: include`; one retry on 419.
- The token default is **not** localStorage; use an HttpOnly cookie + the catch-all proxy in production.
- `safeRedirect()` rejects cross-origin / control-char targets. The catch-all proxy is anti-SSRF (`upstream` pinned).
- Verify auth in **every** Server Action (the proxy is optimistic only).
- The client rejects absolute URLs whose origin ≠ `baseUrl` — the CSRF header / Bearer token must never travel cross-origin (same guard as `serverFetch`).
- Call `next-sanctum/actions` helpers (and stateful `serverFetch`) from **Server Actions only** — see the [callout above](#login-via-server-action-next-sanctumactions).
- The `request` event payload includes the request `init` (body included — e.g. login credentials). Don't pipe it verbatim into logs/analytics.

## License

MIT © Alizio Dev
