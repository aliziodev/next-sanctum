import { beforeEach, describe, expect, it } from "vitest"
import { createEmailVerificationApi } from "../src/features/email-verification"
import { createPasswordApi } from "../src/features/password"
import { createProfileApi } from "../src/features/profile"
import { createRegistrationApi } from "../src/features/registration"
import { createTwoFactorApi } from "../src/features/two-factor"
import { setupClient } from "./helpers"

beforeEach(() => {
  // Pre-set XSRF so ensureCsrf skips the GET csrf-cookie.
  document.cookie = "XSRF-TOKEN=tok"
})

describe("two-factor", () => {
  it("challenge → POST /two-factor-challenge with code", async () => {
    const { client, config, calls } = setupClient([
      { method: "POST", path: "/two-factor-challenge" },
    ])
    await createTwoFactorApi(client, config).challenge({ code: "123456" })
    const call = calls.find((c) => c.url.endsWith("/two-factor-challenge"))
    expect(call?.method).toBe("POST")
    expect(JSON.parse(call?.body ?? "{}")).toEqual({ code: "123456" })
  })

  it("enable/confirm/disable + getRecoveryCodes", async () => {
    const { client, config, calls } = setupClient([
      { method: "POST", path: "/user/two-factor-authentication" },
      { method: "POST", path: "/user/confirmed-two-factor-authentication" },
      { method: "DELETE", path: "/user/two-factor-authentication" },
      {
        method: "GET",
        path: "/user/two-factor-recovery-codes",
        body: ["code-1", "code-2"],
      },
    ])
    const tf = createTwoFactorApi(client, config)
    await tf.enable()
    await tf.confirm("999")
    expect(await tf.getRecoveryCodes()).toEqual(["code-1", "code-2"])
    await tf.disable()

    const confirmCall = calls.find((c) =>
      c.url.endsWith("/user/confirmed-two-factor-authentication"),
    )
    expect(JSON.parse(confirmCall?.body ?? "{}")).toEqual({ code: "999" })
    expect(
      calls.some(
        (c) =>
          c.method === "DELETE" &&
          c.url.endsWith("/user/two-factor-authentication"),
      ),
    ).toBe(true)
  })

  it("getQrCode / getSecretKey / regenerateRecoveryCodes", async () => {
    const { client, config, calls } = setupClient([
      { method: "GET", path: "/user/two-factor-qr-code", body: { svg: "<svg/>" } },
      {
        method: "GET",
        path: "/user/two-factor-secret-key",
        body: { secretKey: "ABC" },
      },
      { method: "POST", path: "/user/two-factor-recovery-codes" },
    ])
    const tf = createTwoFactorApi(client, config)
    expect(await tf.getQrCode()).toEqual({ svg: "<svg/>" })
    expect(await tf.getSecretKey()).toEqual({ secretKey: "ABC" })
    await tf.regenerateRecoveryCodes()
    expect(
      calls.some(
        (c) =>
          c.method === "POST" &&
          c.url.endsWith("/user/two-factor-recovery-codes"),
      ),
    ).toBe(true)
  })

  it("management methods throw when 2FA is disabled", async () => {
    const { client, config } = setupClient([], {
      features: { twoFactorAuthentication: false },
    })
    await expect(createTwoFactorApi(client, config).enable()).rejects.toThrow(
      /disabled/,
    )
  })
})

describe("fortify flows", () => {
  it("register → POST /register", async () => {
    const { client, config, calls } = setupClient([
      { method: "POST", path: "/register", status: 201 },
    ])
    await createRegistrationApi(client, config).register({
      name: "Budi",
      email: "a@b.com",
      password: "x",
      password_confirmation: "x",
    })
    expect(
      calls.some((c) => c.method === "POST" && c.url.endsWith("/register")),
    ).toBe(true)
  })

  it("forgot/reset/confirm/update password + status", async () => {
    const { client, config, calls } = setupClient([
      { method: "POST", path: "/forgot-password" },
      { method: "POST", path: "/reset-password" },
      { method: "POST", path: "/user/confirm-password" },
      { method: "PUT", path: "/user/password" },
      {
        method: "GET",
        path: "/user/confirmed-password-status",
        body: { confirmed: true },
      },
    ])
    const api = createPasswordApi(client, config)
    await api.forgotPassword({ email: "a@b.com" })
    await api.resetPassword({
      token: "t",
      email: "a@b.com",
      password: "x",
      password_confirmation: "x",
    })
    await api.confirmPassword({ password: "x" })
    await api.updatePassword({
      current_password: "old",
      password: "new",
      password_confirmation: "new",
    })
    expect(await api.confirmedPasswordStatus()).toBe(true)
    expect(
      calls.some((c) => c.method === "PUT" && c.url.endsWith("/user/password")),
    ).toBe(true)
  })

  it("updateProfile (PUT) + resendEmailVerification (POST)", async () => {
    const { client, config, calls } = setupClient([
      { method: "PUT", path: "/user/profile-information" },
      { method: "POST", path: "/email/verification-notification" },
    ])
    await createProfileApi(client, config).updateProfileInformation({
      name: "Budi Baru",
    })
    await createEmailVerificationApi(client, config).resendEmailVerification()
    expect(
      calls.some(
        (c) => c.method === "PUT" && c.url.endsWith("/user/profile-information"),
      ),
    ).toBe(true)
    expect(
      calls.some(
        (c) =>
          c.method === "POST" &&
          c.url.endsWith("/email/verification-notification"),
      ),
    ).toBe(true)
  })
})
