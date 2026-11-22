import type { EvaluationFile, IndexFile, StockDetail } from "../../shared/types";

// 정적 파일. 사이트가 하위 경로(GitHub Pages)에 있어도 동작하도록 상대 경로를 씁니다.
const BASE = `${import.meta.env.BASE_URL}data`;

async function load<T>(path: string, fresh = false): Promise<T> {
  // fresh: 중간 캐시(CDN)를 거치지 않도록 주소에 시각을 붙임
  const res = await fetch(`${BASE}/${path}${fresh ? `?t=${Date.now()}` : ""}`, { cache: "no-cache" });
  if (!res.ok) throw new Error(res.status === 404 ? "데이터가 아직 없습니다." : `불러오기 실패 (${res.status})`);
  return res.json() as Promise<T>;
}

export const loadIndex = (fresh = false) => load<IndexFile>("index.json", fresh);

const detailCache = new Map<string, Promise<StockDetail>>();
let detailFresh = false;
/** 새 데이터가 올라왔을 때: 종목 캐시를 비우고 다음 요청은 CDN을 우회 */
export function resetStockCache() {
  detailCache.clear();
  detailFresh = true;
}
export function loadStock(code: string) {
  let p = detailCache.get(code);
  if (!p) {
    p = load<StockDetail>(`stocks/${code}.json`, detailFresh);
    p.catch(() => detailCache.delete(code));
    detailCache.set(code, p);
  }
  return p;
}

export const loadEvaluation = (fresh = false) => load<EvaluationFile>("evaluation.json", fresh);
