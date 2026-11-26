"""장 시작 전 실행 대기.

GitHub 예약 실행은 몇 시간씩 늦게 시작되는 일이 많아, 저녁·새벽에 여러 번 예약해 두고
먼저 시작된 실행이 GitHub 안에서 08:05(KST)까지 기다렸다가 수집·배포합니다.

출력(GITHUB_OUTPUT): go=true|false
- 평일 08:05~15:40 사이에 시작됐으면 바로 진행 (장 시작 후라도 최신화는 의미 있음)
- 다음 평일 08:05까지 5시간 40분 이내면 그때까지 기다린 뒤 진행
- 그보다 이르면 진행하지 않음 (뒤의 예약 실행이 맡음)
- 이미 오늘 08:00 이후 만들어진 전망이 배포돼 있으면 진행하지 않음 (중복 방지)
"""

import datetime as dt
import json
import os
import sys
import time
import urllib.request

KST = dt.timezone(dt.timedelta(hours=9))
MAX_WAIT = 5 * 3600 + 40 * 60  # GitHub 작업 최대 6시간 안에서 여유를 둠


def target_after(now: dt.datetime) -> dt.datetime:
    """now 이후(또는 지금이 그 시각대면 지금) 가장 가까운 평일 08:05 KST"""
    t = now.replace(hour=8, minute=5, second=0, microsecond=0)
    if now >= now.replace(hour=15, minute=40, second=0, microsecond=0):
        t += dt.timedelta(days=1)
    while t.weekday() >= 5:
        t += dt.timedelta(days=1)
    return t


def decide(now: dt.datetime, deployed_at: dt.datetime | None) -> tuple[bool, float]:
    """(진행 여부, 기다릴 초)"""
    t = target_after(now)
    wait = max(0.0, (t - now).total_seconds())
    if wait > MAX_WAIT:
        return False, 0.0
    if deployed_at and deployed_at >= t.replace(hour=8, minute=0) and deployed_at.date() == t.date():
        return False, 0.0
    return True, wait


def deployed_at() -> dt.datetime | None:
    repo = os.environ.get("GITHUB_REPOSITORY", "")
    if "/" not in repo:
        return None
    owner, name = repo.split("/", 1)
    url = f"https://{owner.lower()}.github.io/{name}/data/index.json?t={int(time.time())}"
    try:
        with urllib.request.urlopen(url, timeout=20) as r:
            iso = json.load(r)["generatedAt"]
        return dt.datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(KST)
    except Exception as e:  # 사이트를 못 읽으면 중복 확인 없이 진행
        print(f"배포된 데이터 확인 실패: {e}")
        return None


def main() -> None:
    now = dt.datetime.now(KST)
    go, wait = decide(now, deployed_at())
    print(f"지금 {now:%m/%d %H:%M} KST · 진행 {go} · 대기 {wait / 60:.0f}분")
    if go and wait > 0:
        time.sleep(wait)
        # 기다리는 동안 다른 실행이 이미 배포했을 수 있음
        go, _ = decide(dt.datetime.now(KST), deployed_at())
        print(f"대기 끝 · 진행 {go}")
    out = os.environ.get("GITHUB_OUTPUT")
    if out:
        with open(out, "a") as f:
            f.write(f"go={'true' if go else 'false'}\n")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--self-test":
        k = lambda s: dt.datetime.fromisoformat(s).replace(tzinfo=KST)
        assert decide(k("2026-11-26T02:30"), None) == (True, (5 * 60 + 35) * 60)  # 새벽 → 08:05까지 대기
        assert decide(k("2026-11-25T20:20"), None) == (False, 0.0)  # 너무 이름
        assert decide(k("2026-11-26T08:30"), None) == (True, 0.0)  # 장전 → 바로
        assert decide(k("2026-11-26T13:15"), None) == (True, 0.0)  # 장중 늦은 실행 → 바로 최신화
        assert decide(k("2026-11-26T08:30"), k("2026-11-26T08:07")) == (False, 0.0)  # 이미 배포됨
        assert decide(k("2026-11-26T08:30"), k("2026-11-25T19:00")) == (True, 0.0)  # 전날 저녁 배포는 무시
        assert decide(k("2026-11-28T06:00"), None) == (False, 0.0)  # 토요일 → 월요일은 너무 멂
        assert decide(k("2026-11-30T03:00"), None) == (True, (5 * 60 + 5) * 60)  # 월요일 새벽
        print("self-test ok")
    else:
        main()
