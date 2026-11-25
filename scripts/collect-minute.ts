// 분봉 저장: 끝난 거래일의 1분 간격 가격을 날짜별 파일로 쌓습니다.
// 네이버는 최근 약 7거래일치를 주므로, 며칠 수집을 놓쳐도 다음 실행 때 빈 날을 채웁니다.
// 사용: npx tsx scripts/collect-minute.ts <저장 폴더>   (GitHub Actions에서는 minute-data 브랜치)
//
// 파일: <폴더>/minute/YYYY/MM/DD.json.gz
//   { date, stocks: { [code]: { name, market, bars: [[hhmm, 가격, 누적거래량], ...] } } }
//   09:00~15:30 정규장, 16:00~20:00 대체거래소(NXT) 시간외 포함

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { minuteBars, topByMarketValue, type MinuteBar } from "./sources/naver";

const root = path.resolve(process.argv[2] || "minute-store");
const dir = path.join(root, "minute");
const N_KOSPI = Number(process.env.UNIVERSE_KOSPI || 60);
const N_KOSDAQ = Number(process.env.UNIVERSE_KOSDAQ || 40);
const MIN_STOCKS = 0.7; // 이 비율보다 적게 모인 날은 저장하지 않음 (다음 실행에서 다시 시도)

const fileFor = (date: string) => path.join(dir, date.slice(0, 4), date.slice(5, 7), `${date.slice(8, 10)}.json.gz`);

/** 한국 시각 기준 오늘 날짜. 오늘은 시간외(20:00)까지 끝나지 않았으므로 저장하지 않음 */
const todayKst = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

async function main() {
  const universe = [...(await topByMarketValue("KOSPI", N_KOSPI)), ...(await topByMarketValue("KOSDAQ", N_KOSDAQ))];
  const byDate = new Map<string, Record<string, { name: string; market: string; bars: MinuteBar[] }>>();
  let failed = 0;
  for (const s of universe) {
    try {
      const days = await minuteBars(s.code);
      for (const [date, bars] of days) {
        const rec = byDate.get(date) ?? {};
        rec[s.code] = { name: s.name, market: s.market, bars };
        byDate.set(date, rec);
      }
    } catch (e) {
      failed++;
      console.warn(`[실패] ${s.code} ${s.name}: ${(e as Error).message}`);
    }
  }

  const today = todayKst();
  const saved: string[] = [];
  for (const [date, stocks] of [...byDate].sort(([a], [b]) => a.localeCompare(b))) {
    if (date >= today) continue;
    const file = fileFor(date);
    if (existsSync(file)) continue;
    const n = Object.keys(stocks).length;
    if (n < universe.length * MIN_STOCKS) {
      console.warn(`${date}: ${n}개 종목뿐이라 건너뜀`);
      continue;
    }
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, gzipSync(JSON.stringify({ date, stocks })));
    saved.push(`${date}(${n})`);
  }

  // 브랜치 설명 파일 (처음 한 번)
  const readme = path.join(root, "README.md");
  if (!existsSync(readme)) {
    await writeFile(
      readme,
      `# 분봉 데이터 (자동 저장)

GitHub Actions(데이터 갱신 및 배포 → minute 작업)가 끝난 거래일의 1분 간격 가격을 저장합니다. 사람이 직접 고치지 않습니다.

- 파일: \`minute/YYYY/MM/DD.json.gz\` → \`{ date, stocks: { 종목코드: { name, market, bars: [[시각hhmm, 가격, 누적거래량], ...] } } }\`
- 시간: 09:00~15:30 정규장, 16:00~20:00 대체거래소(NXT) 시간외
- 출처: 네이버 증권 분봉(최근 약 7거래일 제공 → 놓친 날은 다음 실행에서 채움)
- 목록: \`minute/index.json\` (날짜별 종목 수)
- 용도: 데이 트레이딩 규칙(진입·익절·손절)을 일봉 대신 실제 장중 경로로 검증하기 위해
`,
    );
  }

  // 목록 파일: 저장된 날짜와 종목 수
  const indexFile = path.join(dir, "index.json");
  const index: Record<string, number> = existsSync(indexFile) ? JSON.parse(await readFile(indexFile, "utf8")) : {};
  for (const [date, stocks] of byDate) if (existsSync(fileFor(date))) index[date] ??= Object.keys(stocks).length;
  await writeFile(indexFile, JSON.stringify(Object.fromEntries(Object.entries(index).sort()), null, 1));

  console.log(`분봉: 종목 ${universe.length - failed}/${universe.length}, 새로 저장 ${saved.length}일 ${saved.join(" ")}, 누적 ${Object.keys(index).length}일`);
  if (failed > universe.length * (1 - MIN_STOCKS)) process.exit(1);
}

/** 저장된 하루치 읽기 (분석용) */
export async function readMinuteDay(rootDir: string, date: string) {
  return JSON.parse(gunzipSync(await readFile(path.join(rootDir, "minute", date.slice(0, 4), date.slice(5, 7), `${date.slice(8, 10)}.json.gz`))).toString());
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
