// 수집기용 HTTP: 타임아웃, 재시도, 호출 간격 제한 (상대 서버에 부담을 주지 않도록)

const UA = "Mozilla/5.0 (compatible; market-data-collector/1.0)";
const MIN_GAP_MS = 120;
let last = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function throttle() {
  const wait = last + MIN_GAP_MS - Date.now();
  last = Math.max(Date.now(), last + MIN_GAP_MS);
  if (wait > 0) await sleep(wait);
}

export async function get(url: string, headers: Record<string, string> = {}, tries = 3): Promise<Response> {
  let err: unknown;
  for (let attempt = 0; attempt < tries; attempt++) {
    await throttle();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, ...headers }, signal: controller.signal });
      if (res.ok) return res;
      err = new Error(`HTTP ${res.status} ${url}`);
      if (res.status < 500 && res.status !== 429) break; // 재시도해도 소용없는 오류
    } catch (e) {
      err = e;
    } finally {
      clearTimeout(timer);
    }
    await sleep(500 * 2 ** attempt);
  }
  throw err;
}

export const getJson = async <T = any>(url: string, headers?: Record<string, string>) => (await get(url, headers)).json() as Promise<T>;
export const getText = async (url: string, headers?: Record<string, string>) => (await get(url, headers)).text();
