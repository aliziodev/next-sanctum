# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-07-02

### Added

- **Device sessions** (opt-in via `features.deviceSessions`): `useSessions()` hook and
  `SessionsApi` — `list()`, `logoutOthers({ password? })`, `logout(id)` — over the app's
  session endpoints (Laravel's `sessions` table, `SESSION_DRIVER=database`). The
  `DeviceSession` contract and the expected Laravel endpoints are documented in the README.
- The catch-all route proxy forwards `X-Forwarded-For`, so Laravel throttling and audit
  logging see the real client IP instead of the Next server's (configure `TrustProxies`).

### Changed

- **Breaking:** the client now rejects absolute URLs whose origin differs from `baseUrl`
  (throws `ConfigError`) — the CSRF header / Bearer token are attached to every request
  and must never be sent cross-origin. Mirrors `serverFetch`'s existing anti-SSRF guard.
- Server-action helpers now send an `Origin` header (the API's own origin), so endpoints
  behind stateful `auth:sanctum` (e.g. confirm-password) recognise the session instead
  of returning 401.
- The catch-all route proxy defaults to `Cache-Control: no-store` when the upstream
  response carries no caching directive, so shared caches/CDNs never store authenticated
  responses.

### Fixed

- A malformed `XSRF-TOKEN` cookie no longer throws `URIError` (→ 500) in `serverFetch`
  and the server-action helpers; the raw value is forwarded instead, matching the
  browser client's behaviour.

### Security

- Documented that the `next-sanctum/actions` helpers (and stateful `serverFetch` calls)
  must be invoked from Server Actions only: they bootstrap and echo Laravel's CSRF token
  themselves, so Next.js's Server-Action Origin check is the effective cross-site
  protection. Calling them from a plain Route Handler requires validating the request's
  `Origin` header manually (login-CSRF risk otherwise).
- Documented that the `request` event payload includes the request body (e.g. login
  credentials) — do not pipe it verbatim into logs or analytics.

## [0.1.1] - 2026-06-28

### Fixed

- README badges.

### Changed

- npm releases are published automatically from `v*` tags via OIDC Trusted Publishing
  (`.github/workflows/release.yml`).

## [0.1.0] - 2026-06-27

### Added

- Initial release: Laravel Fortify + Sanctum authentication for Next.js (App Router).
  - Cookie/CSRF SPA mode (default) and token/Bearer mode with pluggable storage
    (`MemoryStorage`, `LocalStorage`, `CookieTokenStorage`).
  - React provider + hooks: `useAuth`, `useUser`, `useApi`, `useClient`, `useResource`,
    `useMutation`, `useTwoFactor`, `usePasskeys`.
  - Server helpers (`next-sanctum/server`): `getUser`, `serverFetch`, `safeRedirect`,
    `createSanctumRouteProxy` (anti-SSRF catch-all proxy).
  - Optimistic route guard (`next-sanctum/proxy`) for `proxy.ts`.
  - Server-action helpers (`next-sanctum/actions`): login, logout, register, 2FA
    challenge, password flows — with Laravel `Set-Cookie` persistence.
  - Fortify features: registration, password reset/update/confirm, profile updates,
    email verification (signed link), 2FA (TOTP, QR, recovery codes), passkeys
    (via `@laravel/passkeys`).

[0.2.0]: https://github.com/aliziodev/next-sanctum/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/aliziodev/next-sanctum/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/aliziodev/next-sanctum/releases/tag/v0.1.0
