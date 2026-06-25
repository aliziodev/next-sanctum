# next-sanctum

A complete **Laravel (Fortify + Sanctum)** authentication client for the **Next.js** App Router.
Supports **cookie/CSRF SPA** + **token/Bearer** modes, SSR & CSR, route protection via `proxy.ts`,
**2FA**, **passkeys**, and the full set of Fortify flows (register, reset/confirm/update password,
profile update, email verification).

- ✅ Cookie/CSRF SPA (default) & token/Bearer
- ✅ SSR (Server Component, Route Handler, Server Action) + Client hooks
- ✅ `proxy.ts` route protection (optimistic) + secure checks on the server
- ✅ 2FA TOTP (challenge + management) · Passkeys (interop with `@laravel/passkeys`)
- ✅ TypeScript-first, dual ESM/CJS, tree-shakeable, native fetch

> Compatible with **Next.js 15/16**, **React 18/19**, **Node 18+**.

## Installation

```bash
pnpm add next-sanctum
# optional (passkeys): pnpm add @laravel/passkeys
```

```env
NEXT_PUBLIC_SANCTUM_BASE_URL=https://api.domain.com   # client (public)
SANCTUM_BASE_URL=https://api.domain.com               # server (do NOT make public)
```

## Quick start (cookie mode)

Prefetch the user on the server → seed the provider (prevents hydration mismatch):

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
    }
  }
}
```

## Hooks (client)

| Hook | Returns |
|---|---|
| `useAuth()` | `user`, `isAuthenticated`, `isLoading`, `login`, `logout`, `refresh`, `register`, `forgotPassword`, `resetPassword`, `confirmPassword`, `confirmedPasswordStatus`, `updatePassword`, `updateProfile`, `resendEmailVerification` |
| `useUser<T>()` | reactive user (`T \| null`) |
| `useApi<T>(path, opts?)` | authenticated fetch → `{ data, error, isLoading, refetch }` |
| `useTwoFactor()` | `challenge`, `enable`, `confirm`, `disable`, `getQrCode`, `getSecretKey`, `getRecoveryCodes`, `regenerateRecoveryCodes` |
| `usePasskeys()` | `isSupported`, `register`, `login`, `confirmPassword`, `delete` (requires `@laravel/passkeys`) |

## Server helpers (`next-sanctum/server`)

```ts
import { getUser, serverFetch, safeRedirect, createSanctumRouteProxy } from "next-sanctum/server"
```

- `getUser<T>()` — the authenticated user (forwards cookies via `await cookies()`).
- `serverFetch(path, init)` — server-side fetch that forwards cookies + the CSRF header on stateful requests.
- `safeRedirect(target, fallback, { origin?, allowList? })` — anti open-redirect (same-origin only).
- `createSanctumRouteProxy({ upstream })` — anti-SSRF catch-all proxy (see below).

Secure check close to the data source:

```tsx
// app/dashboard/page.tsx
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

  const result = await auth.login(parsed.data)
  if (!result.ok) return { message: "Invalid email or password." }
  if (result.twoFactor) redirect("/two-factor-challenge")
  redirect(safeRedirect(formData.get("redirect")?.toString(), "/dashboard"))
}
```

## 2FA (Fortify)

```tsx
"use client"
import { useTwoFactor } from "next-sanctum"

const tf = useTwoFactor()
await tf.enable()                       // requires password confirmation first
const { svg } = await tf.getQrCode()
const codes = await tf.getRecoveryCodes()
await tf.confirm("123456")
// when login returns two-factor-required:
await tf.challenge({ code: "123456" })  // or { recovery_code }
```

## Passkeys (interop)

```tsx
"use client"
import { usePasskeys } from "next-sanctum"

const pk = usePasskeys()                 // requires the @laravel/passkeys package
if (await pk.isSupported()) {
  await pk.register("MacBook Pro")
  await pk.login()                       // passwordless login
}
```

## Token mode (Bearer)

```tsx
import { SanctumProvider, MemoryStorage } from "next-sanctum"

<SanctumProvider config={{
  baseUrl: process.env.NEXT_PUBLIC_SANCTUM_BASE_URL!,
  mode: "token",
  storage: new MemoryStorage(),   // default; or LocalStorage (opt-in) / CookieTokenStorage
}}>{children}</SanctumProvider>
```

## Catch-all server proxy (anti-SSRF)

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

`upstream` is pinned, path traversal & absolute URLs are rejected, and Set-Cookie is forwarded.

## Configuration (`SanctumConfig`)

Only `baseUrl` is required. Others: `mode`, `endpoints`, `csrf`, `redirect`, `features`
(toggle 2FA/passkeys/registration/etc.), `logLevel`, `initialRequest`, `retryOnCsrfMismatch`,
`storage`, `interceptors`, `events`, `redirectIfUnauthenticated`.

## Security

- Cookie/CSRF: `XSRF-TOKEN` is **URL-decoded** → `X-XSRF-TOKEN`; `credentials: include`; one retry on 419.
- The token default is **not** localStorage; use an HttpOnly cookie + the catch-all proxy in production.
- `safeRedirect()` rejects cross-origin targets. The catch-all proxy is anti-SSRF (`upstream` is pinned).
- Verify auth in **every** Server Action (the proxy is optimistic only).

## License

MIT
