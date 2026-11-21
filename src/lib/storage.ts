const KEY = "watchlist.v2";

/** 관심 종목은 이 브라우저에만 저장합니다. 저장된 게 없으면 null */
export function loadWatchlist(): string[] | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (Array.isArray(parsed) && parsed.every((c) => typeof c === "string" && /^\d{6}$/.test(c))) return parsed;
  } catch {
    // 저장소를 쓸 수 없는 환경
  }
  return null;
}

export function saveWatchlist(codes: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(codes));
  } catch {
    // 무시
  }
}
