// 공통 HTTP 도우미와 간단한 메모리 캐시

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 5000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: { "User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8", ...(init.headers || {}) },
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson<T = unknown>(url: string, init: RequestInit = {}, timeoutMs = 5000): Promise<T> {
  const res = await fetchWithTimeout(url, init, timeoutMs);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return (await res.json()) as T;
}

interface Entry<T> {
  value: T;
  expires: number;
}

/** TTL 캐시. 같은 키를 동시에 요청하면 한 번만 가져온다. */
export class TtlCache<T> {
  private store = new Map<string, Entry<T>>();
  private inflight = new Map<string, Promise<T>>();
  constructor(private ttlMs: number, private maxEntries = 500) {}

  get(key: string): T | undefined {
    const e = this.store.get(key);
    if (!e) return undefined;
    if (Date.now() > e.expires) {
      this.store.delete(key);
      return undefined;
    }
    return e.value;
  }

  set(key: string, value: T, ttlMs = this.ttlMs) {
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { value, expires: Date.now() + ttlMs });
  }

  async getOrLoad(key: string, loader: () => Promise<T>, force = false): Promise<T> {
    if (!force) {
      const hit = this.get(key);
      if (hit !== undefined) return hit;
    }
    const running = this.inflight.get(key);
    if (running) return running;
    const p = loader()
      .then((v) => {
        this.set(key, v);
        return v;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }
}
