import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"
import {
  createLogger,
  createSanctumClient,
  resolveConfig,
  safeRedirect,
  SanctumEventEmitter,
} from "../core"
import type {
  LoginResult,
  RegisterPayload,
  ResolvedSanctumConfig,
  SanctumClient,
  SanctumConfig,
  SanctumUser,
} from "../core"
import { createAuthApi } from "../features/auth"
import type { AuthApi } from "../features/auth"
import { createRegistrationApi } from "../features/registration"
import type { RegistrationApi } from "../features/registration"
import { createPasswordApi } from "../features/password"
import type { PasswordApi } from "../features/password"
import { createProfileApi } from "../features/profile"
import type { ProfileApi } from "../features/profile"
import { createEmailVerificationApi } from "../features/email-verification"
import type { EmailVerificationApi } from "../features/email-verification"
import { createTwoFactorApi } from "../features/two-factor"
import type { TwoFactorApi } from "../features/two-factor"
import { createPasskeysApi } from "../features/passkeys"
import type { PasskeysApi } from "../features/passkeys"
import { resolveTokenStorage } from "../storage"
import { SanctumContext } from "./context"
import type { AuthStatus, LoginFn, SanctumContextValue } from "./context"

export interface SanctumProviderProps<TUser = SanctumUser> {
  config: SanctumConfig
  /**
   * User prefetched on the server (getUser()). Seeds state to avoid hydration mismatch.
   * `undefined` = not prefetched (fetched on the client when initialRequest is enabled);
   * `null` = the server confirmed the user is not logged in.
   */
  initialUser?: TUser | null
  children: ReactNode
}

interface Instance<TUser> {
  config: ResolvedSanctumConfig
  client: SanctumClient
  emitter: SanctumEventEmitter<TUser>
  auth: AuthApi<TUser>
  registration: RegistrationApi
  password: PasswordApi
  profile: ProfileApi
  emailVerification: EmailVerificationApi
  twoFactor: TwoFactorApi
  passkeys: PasskeysApi
}

export function SanctumProvider<TUser = SanctumUser>({
  config,
  initialUser,
  children,
}: SanctumProviderProps<TUser>) {
  // Config resolution + client/feature-api creation happens once (on mount).
  const instanceRef = useRef<Instance<TUser> | null>(null)
  if (instanceRef.current === null) {
    const resolved = resolveConfig(config)
    const logger = createLogger(resolved.logLevel)
    const emitter = new SanctumEventEmitter<TUser>()
    emitter.register(resolved.events as never)
    const storage = resolveTokenStorage(resolved)
    const client = createSanctumClient<TUser>(resolved, {
      logger,
      emitter,
      getToken: storage ? () => storage.get() : undefined,
    })
    const auth = createAuthApi<TUser>(client, resolved, {
      emitter,
      setToken: storage ? (token) => storage.set(token) : undefined,
      clearToken: storage ? () => storage.remove() : undefined,
    })
    instanceRef.current = {
      config: resolved,
      client,
      emitter,
      auth,
      registration: createRegistrationApi(client, resolved),
      password: createPasswordApi(client, resolved),
      profile: createProfileApi(client, resolved),
      emailVerification: createEmailVerificationApi(client, resolved),
      twoFactor: createTwoFactorApi(client, resolved),
      passkeys: createPasskeysApi(client, resolved),
    }
  }
  const {
    config: resolved,
    client,
    emitter,
    auth,
    registration,
    password,
    profile,
    emailVerification,
    twoFactor: rawTwoFactor,
    passkeys: rawPasskeys,
  } = instanceRef.current

  const [user, setUser] = useState<TUser | null>(() => initialUser ?? null)
  const [status, setStatus] = useState<AuthStatus>(() =>
    initialUser !== undefined
      ? initialUser
        ? "authenticated"
        : "unauthenticated"
      : resolved.initialRequest
        ? "loading"
        : "unauthenticated",
  )

  const userRef = useRef(user)
  useEffect(() => {
    userRef.current = user
  }, [user])

  // De-duplicate concurrent login() calls (double-submit) by sharing the in-flight promise.
  const loginInFlight = useRef<Promise<LoginResult<TUser>> | null>(null)
  const login = useCallback<LoginFn<TUser>>(
    (credentials) => {
      if (loginInFlight.current) return loginInFlight.current
      const pending = (async () => {
        setStatus("loading")
        try {
          const result = await auth.login(credentials)
          if (result.status === "authenticated") {
            setUser(result.user)
            setStatus("authenticated")
          } else {
            setStatus("unauthenticated")
          }
          return result
        } catch (error) {
          setStatus(userRef.current ? "authenticated" : "unauthenticated")
          throw error
        } finally {
          loginInFlight.current = null
        }
      })()
      loginInFlight.current = pending
      return pending
    },
    [auth],
  )

  const logout = useCallback(async () => {
    try {
      await auth.logout()
    } finally {
      setUser(null)
      setStatus("unauthenticated")
    }
  }, [auth])

  const refresh = useCallback(async () => {
    const next = await auth.refreshIdentity()
    setUser(next)
    setStatus(next ? "authenticated" : "unauthenticated")
    return next
  }, [auth])

  // Actions that change identity → refresh state after success.
  const register = useCallback(
    async (payload: RegisterPayload) => {
      await registration.register(payload)
      await refresh().catch(() => {})
    },
    [registration, refresh],
  )

  const updateProfile = useCallback(
    async (payload: Record<string, unknown>) => {
      await profile.updateProfileInformation(payload)
      await refresh().catch(() => {})
    },
    [profile, refresh],
  )

  const twoFactor = useMemo<TwoFactorApi>(
    () => ({
      ...rawTwoFactor,
      challenge: async (payload) => {
        await rawTwoFactor.challenge(payload)
        await refresh().catch(() => {})
      },
    }),
    [rawTwoFactor, refresh],
  )

  const passkeys = useMemo<PasskeysApi>(
    () => ({
      ...rawPasskeys,
      login: async () => {
        await rawPasskeys.login()
        await refresh().catch(() => {})
      },
    }),
    [rawPasskeys, refresh],
  )

  // Reactive logout on 401 (expired session) + optional redirect.
  useEffect(() => {
    const off = emitter.on("error", ({ error }) => {
      if (error.kind !== "unauthorized") return
      // Only react when we currently believe we're authenticated (session expiry) —
      // not on the initial "am I logged in?" probe 401 for a guest on a public page.
      if (!userRef.current) return
      setUser(null)
      setStatus("unauthenticated")
      const target = resolved.redirectIfUnauthenticated
      if (target && typeof window !== "undefined") {
        const safe = safeRedirect(target, "/", { origin: resolved.origin })
        emitter.emit("redirect", { to: safe, reason: "unauthenticated" })
        window.location.assign(safe)
      }
    })
    return off
  }, [emitter, resolved])

  // Init: emit event + fetch user when not prefetched from the server.
  useEffect(() => {
    emitter.emit("init", { user: userRef.current })
    if (initialUser !== undefined || !resolved.initialRequest) return
    let active = true
    auth
      .refreshIdentity()
      .then((next) => {
        if (!active) return
        setUser(next)
        setStatus(next ? "authenticated" : "unauthenticated")
      })
      .catch(() => {
        if (active) setStatus("unauthenticated")
      })
    return () => {
      active = false
    }
  }, [])

  const value = useMemo<SanctumContextValue<TUser>>(
    () => ({
      config: resolved,
      client,
      emitter,
      user,
      status,
      isAuthenticated: status === "authenticated" && user !== null,
      isLoading: status === "loading",
      login,
      logout,
      refresh,
      setUser,
      register,
      forgotPassword: password.forgotPassword,
      resetPassword: password.resetPassword,
      confirmPassword: password.confirmPassword,
      confirmedPasswordStatus: password.confirmedPasswordStatus,
      updatePassword: password.updatePassword,
      updateProfile,
      resendEmailVerification: emailVerification.resendEmailVerification,
      twoFactor,
      passkeys,
    }),
    [
      resolved,
      client,
      emitter,
      user,
      status,
      login,
      logout,
      refresh,
      register,
      updateProfile,
      twoFactor,
      passkeys,
      password,
      emailVerification,
    ],
  )

  return (
    <SanctumContext.Provider value={value as unknown as SanctumContextValue}>
      {children}
    </SanctumContext.Provider>
  )
}
