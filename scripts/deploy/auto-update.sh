#!/bin/bash
# 自动拉取更新并重启服务
# 用法: ./scripts/deploy/auto-update.sh [--dry-run]

set -euo pipefail

# 加载环境配置
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/deploy.env" || exit 1

LOG_FILE="$LOG_DIR/auto-update.log"
DRY_RUN="${1:-}"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

cd "$BOT_DIR"

log "🔍 开始检查更新..."

# 1. 检查是否有远程更新
git fetch origin main 2>&1 | tee -a "$LOG_FILE"

LOCAL_COMMIT=$(git rev-parse HEAD)
REMOTE_COMMIT=$(git rev-parse origin/main)
CHANGED_FILES=$(git diff --name-only $LOCAL_COMMIT $REMOTE_COMMIT 2>/dev/null | wc -l)

if [ "$CHANGED_FILES" -eq 0 ]; then
    log "✅ 无需更新 - 本地已是最新版本"
    exit 0
fi

log "📦 发现 $CHANGED_FILES 个文件需要更新"
log "   本地: $LOCAL_COMMIT"
log "   远程: $REMOTE_COMMIT"

if [ "$DRY_RUN" == "--dry-run" ]; then
    log "⚠️  DRY RUN - 仅检查,不执行更新"
    git diff --stat $LOCAL_COMMIT $REMOTE_COMMIT | tee -a "$LOG_FILE"
    exit 0
fi

# 2. 暂存本地修改(如果有)
if git diff --quiet; then
    log "✅ 无本地未提交修改"
else
    log "⚠️  发现本地未提交修改,暂存中..."
    git stash push -m "auto-update stash $(date +%Y%m%d-%H%M%S)" 2>&1 | tee -a "$LOG_FILE"
fi

# 3. 拉取更新
log "⬇️  拉取远程更新..."
git pull --rebase origin main 2>&1 | tee -a "$LOG_FILE"

# 4. 检查依赖更新
if git diff --name-only $LOCAL_COMMIT $REMOTE_COMMIT | grep -E "(package\.json|bun\.lockb)"; then
    log "📦 检测到依赖更新,重新安装..."
    "$BUN_PATH" install 2>&1 | tee -a "$LOG_FILE" || {
        log "❌ 依赖安装失败"
        exit 1
    }
fi

# 5. 检查构建需求
if git diff --name-only $LOCAL_COMMIT $REMOTE_COMMIT | grep -E "(src/|package\.json|tsconfig\.json)"; then
    log "🔨 检测到源码更新,重新构建..."
    "$BUN_PATH" run build 2>&1 | tee -a "$LOG_FILE" || {
        log "❌ 构建失败"
        exit 1
    }
fi

# 6. 重启服务 (通过服务管理器)
log "🔄 重启 Bot 服务..."
if command -v systemctl &> /dev/null; then
    systemctl restart "$SERVICE_NAME" 2>&1 | tee -a "$LOG_FILE" || {
        log "❌ systemctl restart 失败"
        exit 1
    }
    systemctl status "$SERVICE_NAME" --no-pager | tee -a "$LOG_FILE"
else
    # macOS: 使用 launchctl
    launchctl stop "$SERVICE_NAME" 2>&1 | tee -a "$LOG_FILE"
    sleep 2
    launchctl start "$SERVICE_NAME" 2>&1 | tee -a "$LOG_FILE" || {
        log "❌ launchctl restart 失败"
        exit 1
    }
fi

log "✅ 更新完成!"