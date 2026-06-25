import { ConfigError, joinUrl, readXsrfToken } from "../../core"
import type { ResolvedSanctumConfig, SanctumClient } from "../../core"

export interface PasskeyRegistration {
  id: string
  name: string
}

export interface PasskeysApi {
  /** Whether the browser supports passkeys (WebAuthn). */
  isSupported(): Promise<boolean>
  /** Register a new passkey for the authenticated user. */
  register(name: string): Promise<PasskeyRegistration>
  /** Passwordless login via passkey (auto-refreshes identity on success). */
  login(): Promise<void>
  /** Confirm the session password via passkey. */
  confirmPassword(): Promise<void>
  /** Delete a passkey (`DELETE /user/passkeys/{id}`). */
  delete(id: string): Promise<void>
}

/** The subset of the @laravel/passkeys API we use (defined so the public types don't leak). */
interface PasskeysModule {
  configure(config: {
    fetch?: { credentials?: RequestCredentials; headers?: Record<string, string> }
  }): void
  isSupported(): boolean
  register(options: {
    name: string
    routes?: { options?: string; submit?: string }
  }): Promise<{ id: string; name: string }>
  verify(options?: {
    routes?: { options?: string; submit?: string }
  }): Promise<{ redirect?: string }>
}

async function loadPasskeys(): Promise<PasskeysModule> {
  try {
    const mod = (await import("@laravel/passkeys")) as unknown as {
      Passkeys: PasskeysModule
    }
    return mod.Passkeys
  } catch (cause) {
    throw new ConfigError(
      "The @laravel/passkeys package is not installed. Run: pnpm add @laravel/passkeys",
      cause,
    )
  }
}

/**
 * Passkeys interop (Fortify). The WebAuthn ceremony is delegated to @laravel/passkeys
 * (dynamic import, browser-only, optional peer). We map the endpoints from config
 * & set credentials/CSRF so the request is authenticated.
 */
export function createPasskeysApi(
  client: SanctumClient,
  config: ResolvedSanctumConfig,
): PasskeysApi {
  const ep = config.endpoints.passkeys
  const abs = (path: string) => joinUrl(config.baseUrl, path)

  function ensureEnabled(): void {
    if (config.features.passkeys === false) {
      throw new ConfigError('The "passkeys" feature is disabled in config.')
    }
  }

  async function configured(): Promise<PasskeysModule> {
    ensureEnabled()
    const Passkeys = await loadPasskeys()
    await client.ensureCsrf()
    const xsrf = readXsrfToken(config.csrf.cookie)
    Passkeys.configure({
      fetch: {
        credentials: "include",
        headers: xsrf ? { [config.csrf.header]: xsrf } : {},
      },
    })
    return Passkeys
  }

  return {
    async isSupported() {
      const Passkeys = await loadPasskeys()
      return Passkeys.isSupported()
    },
    async register(name) {
      const Passkeys = await configured()
      return Passkeys.register({
        name,
        routes: { options: abs(ep.registerOptions), submit: abs(ep.register) },
      })
    },
    async login() {
      const Passkeys = await configured()
      await Passkeys.verify({
        routes: { options: abs(ep.loginOptions), submit: abs(ep.login) },
      })
    },
    async confirmPassword() {
      const Passkeys = await configured()
      await Passkeys.verify({
        routes: { options: abs(ep.confirmOptions), submit: abs(ep.confirm) },
      })
    },
    async delete(id) {
      ensureEnabled()
      await client.raw(`${ep.delete}/${encodeURIComponent(id)}`, {
        method: "DELETE",
      })
    },
  }
}
