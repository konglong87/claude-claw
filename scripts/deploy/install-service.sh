#!/bin/bash
# 一键安装 systemd 服务
# 适用于 Linux 系统 (Ubuntu/Debian/CentOS)

set -euo pipefail

# 加载环境配置
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/deploy.env" || exit 1

SERVICE_FILE="$SCRIPT_DIR/${SERVICE_NAME}.service.template"
SERVICE_DEST="/etc/systemd/system/${SERVICE_NAME}.service"

echo "=================================================="
echo "  Claude Bot Systemd 服务安装器"
echo "=================================================="
echo ""

# 检查 systemd
if ! command -v systemctl &> /dev/null; then
    echo "❌ 当前系统不支持 systemd"
    echo "   macOS 用户请使用 launchd (见 scripts/deploy/install-launchd.sh)"
    exit 1
fi

# 检查权限
if [ "$EUID" -ne 0 ]; then
    echo "❌ 需要root权限运行"
    echo "   请使用: sudo bash $0"
    exit 1
fi

# 验证 bun 安装
if [ ! -x "$BUN_PATH" ]; then
    echo "❌ Bun 未安装或路径错误: $BUN_PATH"
    exit 1
fi

# 1. 生成动态服务配置
echo "1️⃣  生成服务配置..."
sed -e "s|<BOT_USER>|$BOT_USER|g" \
    -e "s|<BOT_DIR>|$BOT_DIR|g" \
    -e "s|<BUN_PATH>|$BUN_PATH|g" \
    -e "s|<LOG_DIR>|$LOG_DIR|g" \
    "$SERVICE_FILE" > "$SERVICE_DEST"
echo "   ✅ 已生成到 $SERVICE_DEST"
echo ""

# 2. 创建日志目录
echo "2️⃣  创建日志目录..."
mkdir -p "$LOG_DIR"
chown -R "$BOT_USER:$BOT_USER" "$LOG_DIR"
echo "   ✅ 已创建 $LOG_DIR"
echo ""

# 3. 重载 systemd
echo "3️⃣  重载 systemd 配置..."
systemctl daemon-reload
echo "   ✅ 配置已重载"
echo ""

# 4. 启用开机自启
echo "4️⃣  配置开机自启..."
systemctl enable ${SERVICE_NAME}
echo "   ✅ 已启用开机自启"
echo ""

# 5. 启动服务
echo "5️⃣  启动服务..."
systemctl start ${SERVICE_NAME}
sleep 2
systemctl status ${SERVICE_NAME} --no-pager
echo ""

echo "=================================================="
echo "✅ 安装完成!"
echo ""
echo "常用命令:"
echo "  查看状态:   systemctl status ${SERVICE_NAME}"
echo "  启动服务:   systemctl start ${SERVICE_NAME}"
echo "  停止服务:   systemctl stop ${SERVICE_NAME}"
echo "  重启服务:   systemctl restart ${SERVICE_NAME}"
echo "  查看日志:   journalctl -u ${SERVICE_NAME} -f"
echo "  应用日志:   tail -f $LOG_DIR/bot.log"
echo ""
echo "自动更新:"
echo "  检查更新:   bash $BOT_DIR/scripts/deploy/auto-update.sh"
echo "  模拟运行:   bash $BOT_DIR/scripts/deploy/auto-update.sh --dry-run"
echo ""
echo "健康监控:"
echo "  启动监控:   bash $BOT_DIR/scripts/deploy/health-watch.sh"
echo "=================================================="