# Claude Claw Open - 企业级 AI 机器人服务平台

<div align="center">

**融合 Claude Code 与 OpenClaw 精华，构建智能化协作平台**

[![Bun](https://img.shields.io/badge/Bun->=1.3.11-black?logo=bun)](https://bun.sh/)
[![License](https://img.shields.io/badge/License-学习研究仅用-blue.svg)](LICENSE)

**取其精华，去其糟粕，学习研究项目**

[快速开始](#-快速开始) • [核心功能](#-核心功能) • [命令速查](#-命令速查) • [部署指南](#-生产部署)

</div>

---

## 📖 目录

- [核心功能](#-核心功能)
- [快速开始](#-快速开始)
- [命令速查](#-命令速查)
- [配置说明](#-配置说明)
- [生产部署](#-生产部署)
- [测试验证](#-测试验证)
- [常见问题](#-常见问题)

---

## 🚀 核心功能

### 1. Gateway 多渠道管理

统一的网关服务，管理飞书、钉钉、微信等多个渠道：

- ✅ **统一入口** - 单端口管理所有渠道连接
- ✅ **手机操作** - 手机操作claude code
- ✅ **自动路由** - 消息智能分发到对应渠道
- ✅ **健康监控** - 实时健康检查端点
- ✅ **认证保护** - Token 安全认证
- ✅ **平滑重启** - 支持热重载和优雅重启

**快速启动**：
```bash
./scripts/start-gateway.sh       # 启动 Gateway
curl http://localhost:8765/health  # 健康检查
```

📖 详细文档：[docs/gateway-quickstart.md](docs/gateway-quickstart.md)

### 2. Clawhub Skills 扩展系统

通过 Clawhub 安装社区 Skills，扩展功能：

- ✅ **技能搜索** - 从 Clawhub 仓库搜索可用技能
- ✅ **一键安装** - 安装任意技能并自动配置
- ✅ **版本管理** - 更新、锁定特定版本
- ✅ **本地管理** - 列出、查看已安装技能

**快速使用**：
```bash
bun run dev skills search "calendar"       # 搜索技能
bun run dev skills install feishu-calendar # 安装技能
bun run dev skills list                    # 查看已安装
```

📖 详细文档：[docs/skills-system.md](docs/skills-system.md)

### 3. Claude Code CLI

完整的 AI 助手 CLI 功能：

- ✅ **交互式 REPL** - Ink 终端渲染，流畅交互
- ✅ **多 Provider** - Anthropic / AWS Bedrock / Google Vertex / Azure
- ✅ **流式对话** - 实时流式响应
- ✅ **工具调用** - 40+ 内置工具（Bash/FileEdit/Agent 等）
- ✅ **权限系统** - plan/auto/manual 三种模式
- ✅ **会话管理** - 会话恢复与历史追踪

**快速启动**：
```bash
bun run dev          # 启动交互式 CLI
bun run dev -p       # 管道模式
```

### 4. 多平台机器人（企业级）

支持飞书、钉钉、微信三大平台：

| 平台 | 连接模式 | 网络要求 | 状态 |
|------|---------|---------|------|
| **飞书** | WebSocket 长连接 | 无需公网 IP | ✅ 可用 |
| **钉钉** | Stream 长连接 | 无需公网 IP | ✅ 已测试 |
| **微信** | Webhook 回调 | 需要公网 IP | ✅ 可用 |

**快速启动**：
```bash
bun run bot          # 启动所有平台
bun run feishu-bot   # 仅启动飞书
```

### 5. 生产级部署

完整的守护进程部署方案：

- ✅ **自动安装** - macOS/Linux 一键安装脚本
- ✅ **自动启动** - 开机自动启动服务
- ✅ **故障恢复** - 崩溃自动重启（最多3次）
- ✅ **自动更新** - git pull + 依赖更新 + 自动重启
- ✅ **健康监控** - 进程/端口/日志三重检查

**一键安装**：
```bash
# macOS
bash scripts/deploy/install-launchd.sh

# Linux
sudo bash scripts/deploy/install-service.sh
```

📖 详细文档：[docs/deploy/README.md](docs/deploy/README.md)

---

## 🎯 快速开始

### 环境要求

- [Bun](https://bun.sh/) >= 1.3.11
- Node.js >= 18（可选）

### 安装步骤

```bash
# 1. 克隆项目
git clone https://github.com/konglong87/claude-claw.git
cd claude-claw-open

# 2. 安装依赖
bun install

# 3. 配置 API Key 和平台凭证
cp config.yaml.example config.yaml
vim config.yaml  # 填入配置

# 4. 配置 Clawhub Token（可选但推荐）
export CLAWHUB_TOKEN="your-clawhub-token"  # 避免 API 限流

# 5. 安装 Skills（可选）
bun run dev skills search "feishu"
bun run dev skills install feishu-calendar

# 6. 启动服务
bun run dev gateway  # 推荐：启动 Gateway
# 或
bun run dev          # CLI 交互模式
```

### 获取 API Key

1. 访问 [Anthropic Console](https://console.anthropic.com/)
2. 创建 API Key（格式：`sk-ant-xxx`）
3. 配置到 `config.yaml`：
   ```yaml
   claude:
     api_key: "sk-ant-xxx"
   ```

### 最小配置示例

编辑 `config.yaml`，填入必要信息：

```yaml
# Claude API 配置
claude:
  api_key: "sk-ant-xxx"
  model: "claude-sonnet-4-6"

# Gateway 配置
gateway:
  port: 8765

# Clawhub Skills 配置
clawhub:
  registry_url: https://clawhub.ai
  skills_dir: skills
  token: ""  # 推荐使用环境变量 CLAWHUB_TOKEN

# 飞书配置（可选）
feishu:
  enabled: true
  app_id: "cli_xxxxxxxxxxxx"
  app_secret: "xxxxxxxxxxxxxxxx"
```

---

## 📋 命令速查

### Gateway 服务管理

| 命令 | 功能 | 适用场景 |
|------|------|---------|
| `bun run dev gateway` | 启动 Gateway 服务 | 开发调试 |
| `bun run dev gateway --port 9000` | 自定义端口启动 | 端口冲突时 |
| `bun run dev gateway --channels feishu,dingtalk` | 指定渠道启动 | 仅启动部分渠道 |
| `./scripts/start-gateway.sh` | 启动 Gateway（守护进程） | ✅ 生产环境推荐 |
| `./scripts/stop-gateway.sh` | 停止 Gateway | 服务停止 |
| `./scripts/restart-gateway.sh` | 重启 Gateway | 配置更新后 |

### Skills 扩展管理

| 命令 | 功能 | 示例 |
|------|------|------|
| `bun run dev skills search <关键词>` | 搜索 Skills | `bun run dev skills search "calendar"` |
| `bun run dev skills install <slug>` | 安装 Skill | `bun run dev skills install feishu-calendar` |
| `bun run dev skills update` | 更新所有 Skills | `bun run dev skills update` |
| `bun run dev skills update <slug>` | 更新指定 Skill | `bun run dev skills update feishu-calendar` |
| `bun run dev skills list` | 列出已安装 | `bun run dev skills list` |

### 单渠道启动

| 命令 | 功能 | 适用场景 |
|------|------|---------|
| `bun run dev channel feishu` | 启动飞书渠道 | 开发调试飞书功能 |
| `bun run dev channel dingtalk` | 启动钉钉渠道 | 开发调试钉钉功能 |
| `bun run dev channel wechat` | 启动微信渠道 | 开发调试微信功能 |
| `./scripts/start-channel.sh feishu` | 启动渠道（守护进程） | 后台运行单个渠道 |

### 多平台管理

| 命令 | 功能 | 适用场景 |
|------|------|---------|
| `bun run bot` | 启动所有启用的平台 | 同时运行多平台 |
| `bun run stop-bot` | 停止所有平台 | 停止服务 |
| `bun run restart-bot` | 重启所有平台 | 配置更新后 |
| `bun run feishu-bot` | 仅启动飞书 | 飞书独立测试 |
| `bun run dingtalk-bot` | 仅启动钉钉 | 钉钉独立测试 |
| `bun run wechat-bot` | 仅启动微信 | 微信独立测试 |

### CLI 交互模式

| 命令 | 功能 | 适用场景 |
|------|------|---------|
| `bun run dev` | 启动交互式 CLI | ✅ 个人使用推荐 |
| `bun run dev -p` | 管道模式 | 脚本自动化调用 |
| `bun run build` | 构建项目 | 生产部署前构建 |

---

## ⚙️ 配置说明

### 配置文件结构

`config.yaml` 包含以下主要配置块：

```yaml
# 1. Gateway 配置
gateway:
  port: 8765              # Gateway 端口
  bind: loopback          # 绑定地址 (loopback/all)
  auth:
    token: ""             # 认证 Token（推荐用环境变量）

# 2. Clawhub Skills 配置
clawhub:
  registry_url: https://clawhub.ai  # Skills 仓库地址
  skills_dir: skills                # Skills 安装目录
  lockfile: .clawhub/lock.json      # 锁文件路径
  auto_update: false                # 自动更新开关
  token: ""                         # API Token（推荐用环境变量）

# 3. Channels 配置
channels:
  enabled:
    - feishu              # 启用飞书渠道
    - dingtalk            # 启用钉钉渠道
    - wechat              # 启用微信渠道

# 4. Claude API 配置
claude:
  model: "claude-sonnet-4-6"
  api_key: "sk-ant-xxx"
  api_base: "https://api.anthropic.com"
  max_tokens: 4096
  temperature: 0.7

# 5. 飞书配置
feishu:
  enabled: true
  app_id: "cli_xxxxxxxxxxxx"
  app_secret: "xxxxxxxxxxxxxxxx"
  connection_mode: "websocket"

# 6. 钉钉配置
dingtalk:
  enabled: true
  app_key: "dingxxxxxxxxxxxx"
  app_secret: "xxxxxxxxxxxxxxxx"
  connection_mode: "stream"

# 7. 微信配置
wechat:
  enabled: false
  corp_id: "wwxxxxxxxxxxxxxxxx"
  corp_secret: "xxxxxxxxxxxxxxxx"
  agent_id: "100001"
  connection_mode: "webhook"
```

### 平台凭证配置

#### 飞书机器人配置

1. 访问 [飞书开放平台](https://open.feishu.cn/app)
2. 创建企业自建应用
3. 配置权限：`im:message` + `im:message:send_as_bot`
4. 发布应用
5. 获取凭证：App ID、App Secret、Verification Token
6. 配置 WebSocket 长连接，启用事件：`im.message.receive_v1`

#### 钉钉机器人配置

1. 访问 [钉钉开放平台](https://open-dev.dingtalk.com/)
2. 创建企业内部应用
3. 添加机器人能力，选择 **Stream 模式**
4. 获取凭证：Client ID (App Key)、Client Secret (App Secret)

**优势**：无需公网 IP，开箱即用

📖 详细报告：[docs/DINGTALK_TEST_SUMMARY.md](docs/DINGTALK_TEST_SUMMARY.md)

#### 微信机器人配置

1. 访问 [企业微信管理后台](https://work.weixin.qq.com/)
2. 创建自建应用，开启机器人能力
3. 获取凭证：Corp ID、Agent ID、Secret、Token
4. 配置 Webhook 回调 URL

**注意**：企业微信需要**公网 IP** 或**内网穿透**

📖 详细指南：[docs/WECHAT_TESTING_GUIDE.md](docs/WECHAT_TESTING_GUIDE.md)

---

## 🏭 生产部署

### 守护进程部署（推荐）

#### macOS 系统 (launchd)

```bash
# 一键安装
bash scripts/deploy/install-launchd.sh

# 服务管理
launchctl print gui/$UID/com.konglong.claude-bot  # 查看状态
launchctl stop com.konglong.claude-bot             # 停止
launchctl start com.konglong.claude-bot            # 启动
tail -f logs/bot.log                               # 查看日志
```

#### Linux 系统 (systemd)

```bash
# 一键安装（需要 sudo）
sudo bash scripts/deploy/install-service.sh

# 服务管理
sudo systemctl status claude-bot    # 查看状态
sudo systemctl restart claude-bot   # 重启服务
sudo systemctl enable claude-bot    # 开机自启
journalctl -u claude-bot -f         # 查看日志
```

### PM2 部署

```bash
# 安装 PM2
npm install -g pm2

# 启动服务
pm2 start "bun run bot" --name claude-bot

# 管理命令
pm2 logs claude-bot      # 查看日志
pm2 restart claude-bot   # 重启服务
pm2 stop claude-bot      # 停止服务
pm2 startup              # 开机自启
pm2 save                 # 保存配置
```

---

## ✅ 测试验证

### Gateway 健康检查

```bash
curl http://localhost:8765/health

# 预期输出
{
  "status": "ok",
  "timestamp": 1775391048087
}
```

### Skills 功能测试

```bash
# 搜索 Skills
bun run dev skills search "calendar" --limit 5

# 查看已安装 Skills
bun run dev skills list
```

### 平台消息测试

**飞书**：在飞书中找到机器人，发送消息查看回复

**钉钉**：在钉钉中找到机器人，发送消息查看执行结果

**微信**：在企业微信中找到机器人，发送消息查看回复

---

## 🔧 常见问题

### Gateway 相关

#### Q1: Gateway 启动失败，端口被占用？

```bash
# 查看端口占用
lsof -i:8765

# 清理端口
./scripts/kill-ports.sh 8765

# 或使用其他端口
bun run dev gateway --port 9000
```

#### Q2: Skills 安装失败？

**解决方案**：

```bash
# 配置 Clawhub Token（推荐）
export CLAWHUB_TOKEN="your-clawhub-token"

# 或在 config.yaml 中配置
clawhub:
  token: "your-clawhub-token"
```

### 平台配置相关

#### Q3: 飞书机器人无法接收消息？

检查步骤：
1. 验证 App ID 和 App Secret 正确
2. 检查飞书应用权限配置
3. 确认 WebSocket 长连接已启用

#### Q4: 钉钉机器人无法连接？

验证 App Key 和 App Secret 正确，确认机器人能力已开启

---

## 🛠️ 项目说明

### 项目理念

本项目是一个学习研究项目，融合了 Claude Code 与 OpenClaw 的优秀设计理念：

- **取其精华**：保留优秀的架构设计和核心功能
- **去其糟粕**：去除不必要的复杂性，优化实现方式
- **学习研究**：深入理解企业级 AI 机器人服务平台的构建方式

### 核心优势

1. **Gateway 统一管理** - 多渠道统一接入，简化部署
2. **Skills 扩展系统** - Clawhub 社区生态，快速扩展功能
3. **生产级部署** - 完整的守护进程方案，开箱即用
4. **多平台支持** - 飞书/钉钉/微信三大平台全覆盖

### 技术栈

- **运行时**: Bun (高性能 JavaScript 运行时)
- **UI 框架**: Ink (React 终端渲染)
- **API**: Anthropic SDK
- **Gateway**: 自研 WebSocket Gateway
- **Skills**: Clawhub Registry
- **配置**: YAML + 环境变量

### 安全提示

⚠️ **本项目仅供学习研究，请勿用于生产环境**

- 不要将 API Key 和密钥提交到公开仓库
- `config.yaml` 已加入 `.gitignore`

---

## 📚 文档资源

### 核心文档

| 文档 | 说明 |
|------|------|
| [Gateway 快速开始](docs/gateway-quickstart.md) | Gateway 服务完整使用指南 |
| [Skills 系统](docs/skills-system.md) | Clawhub Skills 管理详解 |
| [部署指南](docs/deploy/README.md) | 生产级守护进程部署完整指南 |

### 平台文档

| 文档 | 说明 |
|------|------|
| [钉钉测试报告](docs/DINGTALK_TEST_SUMMARY.md) | 钉钉实际测试结果 |
| [微信测试指南](docs/WECHAT_TESTING_GUIDE.md) | 微信配置和测试 |
| [飞书完整指南](docs/FEISHU_COMPLETE.md) | 飞书配置和使用 |
| [飞书 WebSocket](docs/FEISHU_WEBSOCKET_GUIDE.md) | 飞书长连接详解 |

---

<div align="center">

**Made with ❤️ by 恐龙**

**学习研究项目 - 融合精华，构建智能化协作平台**

[⬆ 返回顶部](#claude-claw-open---企业级-ai-机器人服务平台)

</div>
