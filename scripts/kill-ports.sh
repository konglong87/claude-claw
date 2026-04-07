#!/bin/bash
# scripts/kill-ports.sh - Enhanced version with multi-port support

# 如果没有传入参数，则从配置文件读取端口
if [ $# -eq 0 ]; then
    PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
    CONFIG_FILE="$PROJECT_DIR/config.yaml"

    if [ -f "$CONFIG_FILE" ]; then
        echo "📋 从配置文件读取端口配置..."

        # 解析YAML配置文件中的端口
        FEISHU_PORT=$(grep -A1 "ports:" "$CONFIG_FILE" | grep "feishu:" | awk '{print $2}' | tr -d '"' || echo "8765")
        DINGTALK_PORT=$(grep -A2 "ports:" "$CONFIG_FILE" | grep "dingtalk:" | awk '{print $2}' | tr -d '"' || echo "8766")
        WECHAT_PORT=$(grep -A3 "ports:" "$CONFIG_FILE" | grep "wechat:" | awk '{print $2}' | tr -d '"' || echo "8767")
        WEBHOOK_PORT=$(grep -A4 "ports:" "$CONFIG_FILE" | grep "webhook:" | awk '{print $2}' | tr -d '"' || echo "3000")

        # 解析 Gateway 端口
        GATEWAY_PORT=$(grep -A1 "^gateway:" "$CONFIG_FILE" | grep "port:" | head -1 | awk '{print $2}' || echo "8765")

        echo "   Gateway 端口: $GATEWAY_PORT"
        echo "   飞书端口: $FEISHU_PORT"
        echo "   钉钉端口: $DINGTALK_PORT"
        echo "   微信端口: $WECHAT_PORT"
        echo "   Webhook端口: $WEBHOOK_PORT"

        PORTS=("$GATEWAY_PORT" "$FEISHU_PORT" "$DINGTALK_PORT" "$WECHAT_PORT" "$WEBHOOK_PORT")
    else
        echo "⚠️  配置文件不存在，使用默认端口"
        PORTS=(8080 8765 8766 8767 3000)
    fi
else
    # 使用命令行传入的端口
    PORTS=("$@")
fi

echo "🧹 清理端口..."

for PORT in "${PORTS[@]}"; do
    echo "   清理端口 $PORT..."

    if command -v lsof > /dev/null; then
        PIDS=$(lsof -ti:$PORT 2>/dev/null || true)
        if [ -n "$PIDS" ]; then
            echo "      停止端口 $PORT 的进程 (PID: $PIDS)..."
            echo "$PIDS" | xargs kill -9 2>/dev/null || true
        fi
    elif command -v fuser > /dev/null; then
        fuser -k $PORT/tcp 2>/dev/null || true
        echo "      端口 $PORT 已清理"
    else
        echo "      ⚠️  无法清理端口 $PORT (lsof/fuser 不可用)"
    fi
done

echo "✓ 端口清理完成"