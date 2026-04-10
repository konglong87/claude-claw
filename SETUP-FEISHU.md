# 飞书凭证配置指南

## 如何配置真实飞书凭证

### 1. 获取飞书应用凭证

1. 访问飞书开放平台: https://open.feishu.cn/app
2. 创建新应用或选择现有应用
3. 在应用详情页获取：
   - **App ID** (格式: cli_xxxxxxxxxxxx)
   - **App Secret** (32位字符串)

### 2. 配置应用权限

在飞书开放平台，为应用启用以下权限：

**消息权限**:
- `im:message` - 获取与发送消息
- `im:message:receive_as_bot` - 接收群聊消息

**用户权限**:
- `contact:user.base:readonly` - 获取用户基本信息

**文档权限** (可选):
- `docs:doc:readonly` - 读取文档
- `docs:doc` - 编辑文档
- `drive:drive:readonly` - 读取云空间文件

### 3. 更新 config.yaml

将你的真实凭证填入 `config.yaml`：

```yaml
channels:
  feishu:
    - app_id: "cli_你的真实App_ID"      # 例如: cli_a1b2c3d4e5f6g7h8
      app_secret: "你的真实App_Secret"  # 32位字符串
      enabled: true
      connection_mode: "websocket"
      encrypt_key: ""                    # 可选
      verification_token: ""             # 可选
```

### 4. 启动服务

```bash
bun run feishu-bot
```

### 5. 测试功能

#### 方法 A: 在飞书中测试

1. 将应用添加到飞书群组或单聊
2. 发送消息给机器人: "你好"
3. 观察日志输出
4. 机器人应该会回复消息

#### 方法 B: 使用测试脚本

```bash
# 使用真实凭证运行测试
FEISHU_APP_ID="cli_你的App_ID" \
FEISHU_APP_SECRET="你的App_Secret" \
bun run test-plugin-full.ts
```

### 6. 验证成功标志

启动成功的日志应该显示：

```
✅ WebSocket Server 已启动
✅ PluginHost 已创建
[PluginLoader] Loading @larksuite/openclaw-lark...
[PluginRegistry] Channel registered: feishu
[PluginApi] Gateway status: connecting
[PluginApi] Gateway status: connected  👈 看到这个表示连接成功
✅ openclaw-lark 插件已加载
```

### 7. 测试工具功能

在飞书中发送以下消息测试不同功能：

- "搜索用户 张三" → 测试用户搜索
- "创建日历事件" → 测试日历功能
- "读取文档 xxx" → 测试文档读取
- "创建多维表格" → 测试多维表格

## 常见问题

### Q1: Gateway 启动失败

**错误**: `Feishu account "default" not configured or disabled`

**解决**: 确保 config.yaml 中 `enabled: true` 且凭证正确

### Q2: 消息发送失败

**错误**: `Permission denied`

**解决**: 在飞书开放平台添加对应权限并重新发布应用

### Q3: 无法接收消息

**解决**:
1. 确认应用已发布到企业
2. 确认机器人已添加到群聊或单聊
3. 检查权限配置

### Q4: OAuth 授权失败

**解决**: 配置 OAuth 回调地址在飞书开放平台

## 环境变量方式（推荐）

为了安全，建议使用环境变量而非直接写在 config.yaml：

```bash
# 在 ~/.claude/settings.json 中配置
{
  "env": {
    "FEISHU_APP_ID": "cli_你的App_ID",
    "FEISHU_APP_SECRET": "你的App_Secret"
  }
}
```

或使用 .env 文件（需添加到 .gitignore）：
```
FEISHU_APP_ID=cli_你的App_ID
FEISHU_APP_SECRET=你的App_Secret
```

## 安全建议

1. **不要**将真实凭证提交到 Git
2. **不要**在 config.yaml 中填写真实凭证（已加入 .gitignore）
3. 使用环境变量或密钥管理系统
4. 定期轮换 App Secret
5. 遵循最小权限原则配置应用权限

## 下一步

配置完成后，你的 Claude Bot 就可以：
- ✅ 接收和回复飞书消息
- ✅ 搜索飞书用户
- ✅ 读取和编辑飞书文档
- ✅ 操作多维表格
- ✅ 管理日历和任务
- ✅ 使用 OAuth 获取用户授权

更多信息请参考：
- [飞书开放平台文档](https://open.feishu.cn/document/home/introduction-to-feishu-platform/)
- [OpenClaw 文档](https://github.com/openclaw/openclaw)