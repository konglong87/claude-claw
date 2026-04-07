#!/bin/bash
# Bot 健康检查守护脚本
# 每5分钟检查一次,失败3次后通过服务管理器重启

set -euo pipefail

# 加载环境配置
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/deploy.env" || exit 1

LOG_FILE="$LOG_DIR/health-watch.log"
FAIL_COUNT=0

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

check_health() {
    # 1. 检查进程存活 (通过服务管理器或进程)
    if command -v systemctl &> /dev/null; then
        # Linux: 检查 systemd 服务状态
        if ! systemctl is-active --quiet "$SERVICE_NAME"; then
            log "❌ $SERVICE_NAME 服务未运行"
            return 1
        fi
    else
        # macOS: 检查 launchd 服务或进程
        if ! launchctl print gui/$UID/$SERVICE_NAME 2>/dev/null | grep -q "state = running"; then
            # 备用检查: 进程存在
            if ! pgrep -u "$BOT_USER" -f "bun.*run.*bot" > /dev/null; then
                log "❌ Bot 进程不存在"
                return 1
            fi
        fi
    fi

    # 2. 检查端口监听 (WebSocket)
    if ! lsof -i:$WS_PORT > /dev/null 2>&1; then
        log "❌ WebSocket 端口 $WS_PORT 未监听"
        return 1
    fi

    # 3. 检查日志活跃度 (最近5分钟有输出)
    BOT_LOG="$LOG_DIR/bot.log"
    if [ -f "$BOT_LOG" ]; then
        LAST_ACTIVITY=$(find "$BOT_LOG" -mmin -5 2>/dev/null)
        if [ -z "$LAST_ACTIVITY" ]; then
            log "⚠️  Bot 日志最近5分钟无活动"
            return 2  # 轻微警告
        fi
    fi

    log "✅ Bot 服务健康"
    return 0
}

auto_restart() {
    log "🔄 触发自动重启..."

    # 记录失败状态
    FAIL_COUNT=$((FAIL_COUNT + 1))
    log "   失败计数: $FAIL_COUNT/$MAX_FAILS"

    if [ "$FAIL_COUNT" -ge "$MAX_FAILS" ]; then
        log "🚨 达到最大失败次数,通过服务管理器重启..."

        # 使用服务管理器重启 (避免冲突)
        if command -v systemctl &> /dev/null; then
            systemctl restart "$SERVICE_NAME" 2>&1 | tee -a "$LOG_FILE" || {
                log "❌ systemctl restart 失败,尝试手动启动"
                cd "$BOT_DIR"
                nohup "$BUN_PATH" run bot >> "$LOG_DIR/bot.log" 2>&1 &
                disown
            }
        else
            launchctl stop "$SERVICE_NAME" 2>&1 | tee -a "$LOG_FILE"
            sleep 2
            launchctl start "$SERVICE_NAME" 2>&1 | tee -a "$LOG_FILE" || {
                log "❌ launchctl restart 失败,尝试手动启动"
                cd "$BOT_DIR"
                nohup "$BUN_PATH" run bot >> "$LOG_DIR/bot.log" 2>&1 &
                disown
            }
        fi

        log "✅ 已重启 Bot 服务"
        FAIL_COUNT=0
    else
        log "⏳ 等待下一次检查..."
    fi
}

# 主循环
log "🚀 启动健康监控守护进程"
log "   检查间隔: ${CHECK_INTERVAL}秒"
log "   最大失败次数: $MAX_FAILS"
log "   WebSocket端口: $WS_PORT"
log "   日志目录: $LOG_DIR"

while true; do
    if check_health; then
        FAIL_COUNT=0
    else
        auto_restart
    fi

    sleep "$CHECK_INTERVAL"
done