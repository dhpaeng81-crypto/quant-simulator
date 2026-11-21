export const won = (v: number) => `${Math.round(v).toLocaleString("ko-KR")}원`;

export const signed = (v: number, digits = 2) => `${v > 0 ? "+" : ""}${v.toFixed(digits)}`;

export const pct = (v: number, digits = 2) => `${signed(v, digits)}%`;

/** 한국식: 상승 빨강, 하락 파랑, 보합 회색 */
export const toneText = (v: number) => (v > 0 ? "text-up" : v < 0 ? "text-down" : "text-slate-600");

export function timeAgo(iso: string | null): string {
  if (!iso) return "";
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
