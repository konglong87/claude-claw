#!/bin/bash
# macOS launchd 服务安装脚本

set -euo pipefail

# 加载环境配置
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/deploy.env" || exit 1

PLIST_NAME="com.konglong.claude-bot"
PLIST_TEMPLATE="$SCRIPT_DIR/claude-bot.plist.template"
PLIST_DEST="$HOME/Library/LaunchAgents/${PLIST_NAME}.plist"

echo "=================================================="
echo "  Claude Bot macOS LaunchAgent 安装器"
echo "=================================================="
echo ""

# 验证 bun 安装
if [ ! -x "$BUN_PATH" ]; then
    echo "❌ Bun 未安装或路径错误: $BUN_PATH"
    exit 1
fi

# 1. 创建日志目录
echo "1️⃣  创建日志目录..."
mkdir -p "$LOG_DIR"
echo "   ✅ 已创建 $LOG_DIR"
echo ""

# 2. 生成动态 plist 配置
echo "2️⃣  安装 LaunchAgent 配置..."
sed -e "s|<BUN_PATH>|$BUN_PATH|g" \
    -e "s|<BOT_DIR>|$BOT_DIR|g" \
    -e "s|<LOG_DIR>|$LOG_DIR|g" \
    -e "s|<WS_PORT>|$WS_PORT|g" \
    "$PLIST_TEMPLATE" > "$PLIST_DEST"
echo "   ✅ 已生成到 $PLIST_DEST"
echo ""

# 3. 加载服务
echo "3️⃣  加载服务..."
launchctl unload "$PLIST_DEST" 2>/dev/null || true
launchctl load "$PLIST_DEST"
echo "   ✅ 服务已加载"
echo ""

# 4. 检查状态
echo "4️⃣  检查服务状态..."
sleep 2
launchctl print gui/$UID/$PLIST_NAME 2>/dev/null || echo "   ⚠️  服务正在启动中..."
echo ""

echo "=================================================="
echo "✅ 安装完成!"
echo ""
echo "常用命令:"
echo "  查看状态:   launchctl print gui/$UID/$PLIST_NAME"
echo "  停止服务:   launchctl stop $PLIST_NAME"
echo "  启动服务:   launchctl start $PLIST_NAME"
echo "  卸载服务:   launchctl unload $PLIST_DEST"
echo "  重新加载:   launchctl unload $PLIST_DEST && launchctl load $PLIST_DEST"
echo ""
echo "查看日志:"
echo "  应用日志:   tail -f $LOG_DIR/bot.log"
echo "  错误日志:   tail -f $LOG_DIR/bot-error.log"
echo ""
echo "自动更新:"
echo "  检查更新:   bash $BOT_DIR/scripts/deploy/auto-update.sh"
echo ""
echo "健康监控:"
echo "  启动监控:   bash $BOT_DIR/scripts/deploy/health-watch.sh"
echo "=================================================="