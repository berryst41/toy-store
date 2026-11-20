#!/usr/bin/env bash
# ─────────────────────────────────────────────
# 💾 Claude가 대답을 마칠 때마다 자동으로 실행돼요.
# 바뀐 파일이 있을 때만:
#   1) CLAUDE.md "작업 기록"에 한 줄이 새로 적혔는지 보고, 없으면 자동으로 적어요
#   2) 모두 커밋(git commit)해요 — 커밋 메시지는 그 기록 한 줄
#   3) GitHub에 올려요(git push)
# 실패해도 Claude 작업은 막지 않아요. (항상 exit 0)
# ─────────────────────────────────────────────
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

BRANCH="$(git rev-parse --abbrev-ref HEAD)"

# 지난번에 못 올린 커밋이 남아 있는지 확인하는 함수
need_push() {
  # 올릴 곳(upstream)이 아직 없으면 올려야 해요
  git rev-parse --abbrev-ref '@{u}' >/dev/null 2>&1 || return 0
  [ "$(git rev-list --count '@{u}..HEAD' 2>/dev/null)" != "0" ]
}

# GitHub에 올리는 함수 — 다른 PC에서 먼저 올린 게 있어 막히면, 받아서 합친 뒤 한 번 더 올려요
push_now() {
  if git push -q -u origin "$BRANCH" >/dev/null 2>&1 \
     || { git pull --rebase --autostash -q origin "$BRANCH" >/dev/null 2>&1 && git push -q -u origin "$BRANCH" >/dev/null 2>&1; }; then
    echo "💾 GitHub에 올렸어요: $(git log -1 --pretty=%s)" >&2
  else
    git rebase --abort >/dev/null 2>&1
    echo "⚠️ 커밋은 했지만 GitHub에 올리지 못했어요. 다음 대답이 끝날 때 다시 올려요." >&2
  fi
}

# 바뀐 게 하나도 없으면: 못 올린 커밋만 있으면 올리고 끝 (질문만 하고 답만 들은 경우 등)
if [ -z "$(git status --porcelain)" ]; then
  need_push && push_now
  exit 0
fi

NOW="$(date '+%Y-%m-%d %H:%M')"

# 1) 모든 변경을 커밋 준비 상태로 올려요
git add -A

# 이번에 CLAUDE.md에 새로 적힌 기록 줄 찾기 ("- 2026-..."으로 시작하는 줄)
LOG_LINE="$(git diff --cached -U0 -- CLAUDE.md | grep -E '^\+- [0-9]{4}-[0-9]{2}-[0-9]{2}' | tail -n 1 | sed -E 's/^\+- //')"

if [ -z "$LOG_LINE" ]; then
  # Claude가 기록을 깜빡했으면 바뀐 파일 이름으로 대신 적어요
  FILES="$(git diff --cached --name-only | head -n 5 | tr '\n' ',' | sed -E 's/,$//; s/,/, /g')"
  COUNT="$(git diff --cached --name-only | wc -l | tr -d ' ')"
  [ "$COUNT" -gt 5 ] && FILES="$FILES 외 $((COUNT - 5))개"
  LOG_LINE="$NOW · (자동 기록) 바뀐 파일: $FILES"

  # "## 작업 기록" 칸이 없으면 맨 끝에 만들어요
  if ! grep -q '^## 작업 기록' CLAUDE.md 2>/dev/null; then
    printf '\n## 작업 기록\n\n' >> CLAUDE.md
  fi
  # 파일 끝에 줄바꿈이 없으면 하나 넣고, 기록을 맨 아래에 더해요
  [ -n "$(tail -c 1 CLAUDE.md)" ] && echo >> CLAUDE.md
  echo "- $LOG_LINE" >> CLAUDE.md
  git add CLAUDE.md
fi

# 2) 커밋 (메시지 = 기록 한 줄)
git commit -q -m "$LOG_LINE" >/dev/null 2>&1 || exit 0

# 3) 올리기
push_now
exit 0
