import type {
  SanctumEventHandler,
  SanctumEventMap,
  SanctumEventName,
  SanctumUser,
} from "./types"

type AnyHandler = (payload: unknown) => void

/** Typed lifecycle emitter (see SanctumEventMap). */
export class SanctumEventEmitter<TUser = SanctumUser> {
  private readonly handlers = new Map<SanctumEventName, Set<AnyHandler>>()

  on<K extends SanctumEventName>(
    event: K,
    handler: SanctumEventHandler<TUser, K>,
  ): () => void {
    let set = this.handlers.get(event)
    if (!set) {
      set = new Set()
      this.handlers.set(event, set)
    }
    const fn = handler as AnyHandler
    set.add(fn)
    return () => {
      set.delete(fn)
    }
  }

  emit<K extends SanctumEventName>(
    event: K,
    payload: SanctumEventMap<TUser>[K],
  ): void {
    const set = this.handlers.get(event)
    if (!set) return
    // Snapshot + isolate: a throwing consumer handler must not break the auth/request
    // flow this is emitted from, nor skip the remaining handlers.
    for (const handler of [...set]) {
      try {
        handler(payload)
      } catch {
        // swallow consumer handler errors
      }
    }
  }

  /** Register many handlers at once (used by the provider from config.events). */
  register(
    handlers: Partial<{ [K in SanctumEventName]: SanctumEventHandler<TUser, K> }>,
  ): void {
    for (const key of Object.keys(handlers) as SanctumEventName[]) {
      const handler = handlers[key] as unknown as AnyHandler | undefined
      if (!handler) continue
      let set = this.handlers.get(key)
      if (!set) {
        set = new Set()
        this.handlers.set(key, set)
      }
      set.add(handler)
    }
  }
}
