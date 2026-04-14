#!/bin/bash
# scripts/stop-feishu-bot.sh - 停止飞书机器人

set -e

echo "🛑 正在停止飞书机器人..."

# 查找运行中的 feishu-bot 进程
PIDS=$(ps aux | grep "feishu-bot.ts" | grep -v grep | awk '{print $2}') || true

if [ -n "$PIDS" ]; then
    echo "   发现进程: $PIDS"
    echo "$PIDS" | xargs kill -15 2>/dev/null || true

    # 等待进程退出
    sleep 2

    # 检查是否还在运行，强制停止
    REMAINING=$(ps aux | grep "feishu-bot.ts" | grep -v grep | awk '{print $2}') || true
    if [ -n "$REMAINING" ]; then
        echo "   强制停止残留进程..."
        echo "$REMAINING" | xargs kill -9 2>/dev/null || true
    fi

    echo "✓ 飞书机器人已停止"
else
    echo "✓ 飞书机器人未运行"
fi