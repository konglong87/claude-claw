#!/bin/bash
# scripts/restart-feishu-bot.sh - 重启飞书机器人

set -e

echo "🔄 正在重启飞书机器人..."

# 1. 停止飞书机器人
echo "1️⃣ 停止飞书机器人..."
./scripts/stop-feishu-bot.sh

sleep 1

# 2. 启动飞书机器人
echo "2️⃣ 启动飞书机器人..."

# 创建日志目录
mkdir -p logs

# 获取端口（从 config.yaml）
PORT=$(grep "base_port:" config.yaml | awk '{print $2}' || echo "8765")

# 清理端口占用
./scripts/kill-ports.sh $PORT 2>/dev/null || true

# 启动飞书机器人
nohup bun run src/feishu-bot.ts > logs/feishu-bot.log 2>&1 &
FEISHU_PID=$!

sleep 3

# 检查是否启动成功
if ps -p $FEISHU_PID > /dev/null 2>&1; then
    echo "✓ 飞书机器人已启动 (PID: $FEISHU_PID)"
    echo "  日志文件: logs/feishu-bot.log"
    echo "  查看日志: tail -f logs/feishu-bot.log"
else
    echo "✗ 飞书机器人启动失败"
    echo "  查看错误日志:"
    tail -n 50 logs/feishu-bot.log
    exit 1
fi

echo ""
echo "================================================================"
echo "  ✅ 飞书机器人已重启成功！"
echo "================================================================"
echo ""
echo "📋 使用方式:"
echo "  在飞书中给机器人发送消息测试"
echo ""
echo "📝 查看日志:"
echo "  tail -f logs/feishu-bot.log"
echo ""
echo "🛑 停止服务:"
echo "  bash scripts/stop-feishu-bot.sh"
echo ""