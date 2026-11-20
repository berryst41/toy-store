#!/usr/bin/env bash
# ─────────────────────────────────────────────
# 🔄 Claude Code를 켤 때마다 자동으로 실행돼요.
# 다른 PC에서 올린 최신 내용을 먼저 받아 와요. (git pull)
# 실패해도 Claude 작업은 그대로 시작돼요.
# ─────────────────────────────────────────────
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

# git 저장소가 아니면 아무것도 안 해요
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

# 아직 저장 안 한 변경이 있어도 잠깐 치워 뒀다가(autostash) 다시 꺼내요
if git pull --rebase --autostash --quiet >/dev/null 2>&1; then
  echo "🔄 최신 내용을 받아 왔어요 (git pull)."
else
  # 서로 같은 줄을 고쳐서 합치기 실패하면, 망가지지 않게 원래대로 되돌려요
  git rebase --abort >/dev/null 2>&1
  echo "⚠️ 최신 내용 받아 오기(git pull)에 실패했어요. 인터넷 연결이나 충돌을 확인해 주세요."
fi
exit 0
