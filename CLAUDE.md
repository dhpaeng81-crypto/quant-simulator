# 다음 거래일 전망 — 작업 가이드

`README.md`(실행·배포)와 `docs/ARCHITECTURE.md`(데이터·모델·백테스트)를 먼저 읽으세요.

## 구조 요약

- 서버 없음. `scripts/collect.ts`가 GitHub Actions에서 데이터를 모아 `public/data/*.json`을 만들고, 화면(`src/`)은 그 파일만 읽습니다.
- 입력 만들기는 `shared/features.ts`, 학습·보정·평가는 `shared/model.ts` 한 곳에만 있습니다. 수집기와 화면(시나리오 재계산)이 같이 씁니다.
- 예약 실행: 16:40(장 마감 후)과, 장 시작 전용 여러 예약을 `scripts/preopen_wait.py`가 08:05까지 기다리게 합니다. GitHub 예약 실행은 몇 시간씩 늦을 수 있습니다.
- 모델을 바꿀 때는 `scripts/experiment.ts`로 같은 기준(통합 사후 평가, 기본 모델 대비 t값)에서 비교하고, **t ≥ 2로 나을 때만** 채택합니다. 수집기도 같은 규칙으로 자동 선택합니다.

## 규칙

1. 예측 숫자는 `shared/model.ts`에서만 계산합니다. 사본을 만들지 마세요.
2. **미래 정보 누출 금지.** 거래일 t의 입력은 t 장 시작 전에 알 수 있는 값만. `tests/model.test.ts`가 지킵니다.
3. **데이터가 없으면 없다고 표시**합니다. 추정치·가짜 뉴스·난수를 실측처럼 보여 주지 않습니다.
4. Gemini는 시장 배경 문장만 씁니다. 숫자를 만들게 하지 마세요.
5. 투자 권유 표현 금지. 상승 빨강, 하락 파랑(한국 관례).
6. 모바일(400px) 먼저. 본문 14px 이상, 터치 44px 이상, 확대 허용, `word-break: keep-all`.
7. 외부 요청의 User-Agent·URL에 개인 정보(이름, 이메일, 저장소 주소)를 넣지 않습니다.
8. API 키는 `.env` 또는 Actions 비밀값에만.

## 확인

```bash
npm test && npm run lint && npm run build
UNIVERSE_KOSPI=5 UNIVERSE_KOSDAQ=3 npm run collect   # 실제 데이터로 빠르게
```

이 저장소를 Claude Code 클라우드 세션에서 작업할 때 Node의 fetch가 프록시를 쓰려면 `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`를 붙여 실행합니다.
