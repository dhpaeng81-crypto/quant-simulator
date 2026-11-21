# 다음 거래일 전망 — 한국 대형주

코스피·코스닥 시가총액 상위 100개 종목의 **다음 거래일 상승 확률**을 계산하고, 그 모델이 과거에 실제로 얼마나 맞았는지를 함께 공개하는 사이트입니다.

- 입력: 직전 미국 장의 나스닥·필라델피아 반도체 등락률, 원/달러·WTI 변화율, 전 거래일 외국인·기관 순매수, 전 거래일 수익률
- 모델: 종목마다 최근 250거래일로 학습한 릿지 회귀 → 기대 수익률과 상승 확률
- 검증: 최근 60거래일을 매일 "그 전 데이터로만" 다시 학습해 예측한 워크포워드 백테스트, 우연 여부(p값) 표시
- 시나리오: 입력값을 바꿔 보면 브라우저에서 바로 다시 계산

> 투자 권유가 아닙니다. 하루 주가는 대부분 예측할 수 없는 변동이며, 첫 수집 기준 100개 종목의 과거 적중률 중앙값은 53% 정도였습니다.

AI Studio로 만든 원본("AI 퀀트 및 가중치 예측 플랫폼")을 처음부터 다시 설계한 것입니다. 무엇이 왜 바뀌었는지는 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)를 보세요.

## 구조 한눈에

```
GitHub Actions (평일 07:20, 16:40 KST)
  └─ npm run collect : 네이버 증권·Yahoo에서 수집 → 학습 → 백테스트 → public/data/*.json
  └─ npm run build   : 정적 사이트 → dist/
  └─ GitHub Pages 배포
브라우저: JSON만 읽음 (서버·API 키 없음)
```

## 로컬 실행

```bash
npm install
npm run collect     # 약 2분. 데이터가 public/data/에 생김
npm run dev         # http://localhost:5173
```

빨리 확인하려면 `UNIVERSE_KOSPI=5 UNIVERSE_KOSDAQ=3 npm run collect`.

| 명령 | 내용 |
|---|---|
| `npm run collect` | 데이터 수집·학습·백테스트 |
| `npm run dev` | 개발 서버 |
| `npm run build` | `dist/`에 정적 사이트 |
| `npm test` | 모델·백테스트 테스트 (네트워크 불필요) |
| `npm run lint` | 타입 검사 |

## 배포 (처음 한 번)

1. 저장소 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 바꿉니다.
2. **Actions → 데이터 갱신 및 배포 → Run workflow**로 한 번 실행합니다. 이후로는 평일 하루 두 번 자동 실행됩니다.
3. (선택) **Settings → Secrets and variables → Actions**에 `GEMINI_API_KEY`를 넣으면 시장 요약에 AI 배경 해설이 붙습니다.

주소: `https://<GitHub 사용자명>.github.io/quant-simulator/`

수집 중 30% 넘는 종목이 실패하면 배포를 멈추고 이전 사이트를 그대로 둡니다.

## 데이터 출처

| 데이터 | 출처 | 키 |
|---|---|---|
| 국내 일봉(600일), 시가총액 순위 | 네이버 증권 | 불필요 |
| 외국인·기관 일별 순매수 | 네이버 증권 모바일 API | 불필요 |
| 종목 뉴스 | 네이버 증권 모바일 API | 불필요 |
| 나스닥, 필라델피아 반도체, 원/달러, WTI (2년) | Yahoo Finance | 불필요 |
| 시장 배경 해설 (선택) | Google Gemini + 웹 검색 | `GEMINI_API_KEY` |

모두 비공식 엔드포인트라 형식이 바뀔 수 있습니다. 바뀌면 `scripts/sources/`의 해당 파일만 고치면 됩니다.
