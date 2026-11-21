// 기본 워치리스트와 업종 추정 규칙. 시세는 여기 두지 않고 항상 실시간으로 가져옵니다.

import type { SectorKey, Stock } from "./types";

export const DEFAULT_STOCKS: Stock[] = [
  { code: "005930", name: "삼성전자", market: "KOSPI", sector: "semiconductor" },
  { code: "000660", name: "SK하이닉스", market: "KOSPI", sector: "semiconductor" },
  { code: "005380", name: "현대차", market: "KOSPI", sector: "auto" },
  { code: "035420", name: "NAVER", market: "KOSPI", sector: "platform" },
  { code: "373220", name: "LG에너지솔루션", market: "KOSPI", sector: "battery" },
  { code: "068270", name: "셀트리온", market: "KOSPI", sector: "bio" },
  { code: "035720", name: "카카오", market: "KOSPI", sector: "platform" },
  { code: "005490", name: "POSCO홀딩스", market: "KOSPI", sector: "battery" },
  { code: "207940", name: "삼성바이오로직스", market: "KOSPI", sector: "bio" },
  { code: "259960", name: "크래프톤", market: "KOSPI", sector: "game" },
];

export const DEFAULT_CODES = DEFAULT_STOCKS.map((s) => s.code);

/** 이름·업종 문자열로 업종을 추정. 못 찾으면 default */
const SECTOR_KEYWORDS: Array<[SectorKey, RegExp]> = [
  ["semiconductor", /반도체|하이닉스|메모리|칩|파운드리|semiconductor/i],
  ["auto", /자동차|현대차|기아|모비스|타이어|auto|motor/i],
  ["platform", /NAVER|네이버|카카오|인터넷|플랫폼|포털|internet/i],
  ["battery", /배터리|이차전지|2차전지|에너지솔루션|에코프로|포스코|POSCO|퓨처엠|리튬|battery/i],
  ["bio", /바이오|제약|셀트리온|헬스|의약|pharm|bio/i],
  ["game", /게임|크래프톤|엔씨|넷마블|펄어비스|game/i],
];

export function guessSector(...texts: Array<string | undefined | null>): SectorKey {
  const joined = texts.filter(Boolean).join(" ");
  for (const [key, re] of SECTOR_KEYWORDS) if (re.test(joined)) return key;
  return "default";
}

export const isStockCode = (s: string) => /^\d{6}$/.test(s.trim());
