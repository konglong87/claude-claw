#!/bin/bash
# scripts/restart-bot.sh - Updated for Gateway mode

set -e

echo "🔄 正在重启所有服务..."

# 停止所有服务
echo "1️⃣ 停止所有服务..."
./scripts/stop-bot.sh

sleep 1

# 启动 Gateway（包含所有通道）
echo "2️⃣ 启动 Gateway..."
./scripts/start-gateway.sh

echo "✓ 所有服务已重启"