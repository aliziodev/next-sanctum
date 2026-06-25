import { describe, expect, it, vi } from "vitest"
import { createLogger } from "../src/core/logger"

describe("createLogger", () => {
  it("gates output by level", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {})

    const low = createLogger(1) // error only
    low.error("e")
    low.debug("d")
    expect(error).toHaveBeenCalled()
    expect(debug).not.toHaveBeenCalled()

    const high = createLogger(5) // verbose
    high.debug("d2")
    expect(debug).toHaveBeenCalled()

    error.mockRestore()
    debug.mockRestore()
  })

  it("silent at level 0", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    createLogger(0).warn("nope")
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
