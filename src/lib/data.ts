import type { IndexFile, StockDetail } from "../../shared/types";

// 정적 파일. 사이트가 하위 경로(GitHub Pages)에 있어도 동작하도록 상대 경로를 씁니다.
const BASE = `${import.meta.env.BASE_URL}data`;

async function load<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}/${path}`, { cache: "no-cache" });
  if (!res.ok) throw new Error(res.status === 404 ? "데이터가 아직 없습니다." : `불러오기 실패 (${res.status})`);
  return res.json() as Promise<T>;
}

export const loadIndex = () => load<IndexFile>("index.json");

const detailCache = new Map<string, Promise<StockDetail>>();
export function loadStock(code: string) {
  let p = detailCache.get(code);
  if (!p) {
    p = load<StockDetail>(`stocks/${code}.json`);
    p.catch(() => detailCache.delete(code));
    detailCache.set(code, p);
  }
  return p;
}
