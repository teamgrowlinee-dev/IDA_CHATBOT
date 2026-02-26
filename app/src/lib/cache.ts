const store = new Map<string, { value: unknown; expiresAt: number }>();

export const cache = {
  get<T>(key: string): T | undefined {
    const entry = store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      store.delete(key);
      return undefined;
    }
    return entry.value as T;
  },

  set(key: string, value: unknown, ttlMs = 60_000) {
    store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }
};
