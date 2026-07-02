import { beforeEach, describe, expect, it } from "vitest"
import { ConfigError } from "../src/core/errors"
import { createSessionsApi } from "../src/features/sessions"
import type { DeviceSession } from "../src/features/sessions"
import { setupClient } from "./helpers"

const ENABLED = { features: { deviceSessions: true } }

beforeEach(() => {
  // Pre-set XSRF so ensureCsrf skips the GET csrf-cookie.
  document.cookie = "XSRF-TOKEN=tok"
})

describe("sessions", () => {
  it("list → GET /api/sessions", async () => {
    const rows: DeviceSession[] = [
      {
        id: "sess-1",
        ip_address: "203.0.113.7",
        user_agent: "Firefox",
        is_current: true,
        last_active_at: "2026-07-02T10:00:00Z",
      },
    ]
    const { client, config } = setupClient(
      [{ method: "GET", path: "/api/sessions", body: rows }],
      ENABLED,
    )
    expect(await createSessionsApi(client, config).list()).toEqual(rows)
  })

  it("logoutOthers → DELETE /api/sessions/others with password body", async () => {
    const { client, config, calls } = setupClient(
      [{ method: "DELETE", path: "/api/sessions/others" }],
      ENABLED,
    )
    await createSessionsApi(client, config).logoutOthers({ password: "secret" })
    const call = calls.find((c) => c.url.endsWith("/api/sessions/others"))
    expect(call?.method).toBe("DELETE")
    expect(JSON.parse(call?.body ?? "{}")).toEqual({ password: "secret" })
  })

  it("logout(id) → DELETE /api/sessions/{id} (URL-encoded)", async () => {
    const { client, config, calls } = setupClient(
      [{ method: "DELETE", path: "/api/sessions/a%2Fb" }],
      ENABLED,
    )
    await createSessionsApi(client, config).logout("a/b")
    expect(
      calls.some(
        (c) => c.method === "DELETE" && c.url.endsWith("/api/sessions/a%2Fb"),
      ),
    ).toBe(true)
  })

  it("throws ConfigError when the feature is disabled (default)", async () => {
    const { client, config } = setupClient([])
    const api = createSessionsApi(client, config)
    await expect(api.list()).rejects.toBeInstanceOf(ConfigError)
    await expect(api.logoutOthers()).rejects.toBeInstanceOf(ConfigError)
    await expect(api.logout("x")).rejects.toBeInstanceOf(ConfigError)
  })
})
