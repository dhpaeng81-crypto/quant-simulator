export const won = (v: number) => `${Math.round(v).toLocaleString("ko-KR")}원`;
export const signed = (v: number, digits = 2) => `${v > 0 ? "+" : ""}${v.toFixed(digits)}`;
export const pct = (v: number, digits = 2) => `${signed(v, digits)}%`;
export const prob = (p: number) => `${(p * 100).toFixed(1)}%`;

/** 한국식: 상승 빨강, 하락 파랑 */
export const toneText = (v: number) => (v > 0 ? "text-up" : v < 0 ? "text-down" : "text-slate-600");
export const toneProb = (p: number) => (p > 0.5 ? "text-up" : p < 0.5 ? "text-down" : "text-slate-600");

export function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 60000;
  if (diff < 1) return "방금";
  if (diff < 60) return `${Math.round(diff)}분 전`;
  if (diff < 60 * 24) return `${Math.round(diff / 60)}시간 전`;
  return new Date(iso).toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
}

export const shortDate = (ymd: string) => {
  const [, m, d] = ymd.split("-");
  return `${Number(m)}/${Number(d)}`;
};

export const dateTimeKo = (iso: string) =>
  new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });

/** 상승 확률을 말로 */
export function probWords(p: number): string {
  if (p >= 0.6) return "상승 쪽으로 기움";
  if (p >= 0.53) return "약간 상승 쪽";
  if (p > 0.47) return "방향 판단 어려움";
  if (p > 0.4) return "약간 하락 쪽";
  return "하락 쪽으로 기움";
}
