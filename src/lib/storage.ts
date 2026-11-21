import { DEFAULT_CODES } from "../../shared/catalog";

const KEY = "watchlist.v1";

/** 관심 종목은 이 브라우저에만 저장합니다 (다른 사용자와 공유되지 않음) */
export function loadWatchlist(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed) && parsed.every((c) => typeof c === "string" && /^\d{6}$/.test(c))) return parsed;
  } catch {
    // 저장소를 쓸 수 없는 환경(사생활 보호 모드 등)
  }
  return [...DEFAULT_CODES];
}

export function saveWatchlist(codes: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(codes));
  } catch {
    // 무시
  }
}
