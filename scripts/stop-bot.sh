#!/bin/bash
# scripts/stop-bot.sh - Updated for Gateway mode

set -e

echo "🛑 正在停止所有服务..."

# 停止 Gateway
echo "1️⃣ 停止 Gateway..."
./scripts/stop-gateway.sh 2>/dev/null || true

# 停止任何独立的通道进程（更精确的匹配模式）
echo "2️⃣ 检查残留的通道进程..."
# 查找运行中的 bot 进程，排除 WeChat 客户端等无关进程
PIDS=$(ps aux | grep "bun run" | grep -E "(channel|feishu|dingtalk|wechat|webhook)" | grep -v grep | awk '{print $2}') || true
if [ -n "$PIDS" ]; then
    echo "   发现残留进程: $PIDS"
    echo "$PIDS" | xargs kill -15 2>/dev/null || true
fi

# 强制清理残留进程
sleep 1
REMAINING=$(ps aux | grep "bun run" | grep -E "(channel|feishu|dingtalk|wechat|webhook)" | grep -v grep | awk '{print $2}') || true
if [ -n "$REMAINING" ]; then
    echo "   强制停止残留进程..."
    echo "$REMAINING" | xargs kill -9 2>/dev/null || true
fi

echo "✓ 所有服务已停止"