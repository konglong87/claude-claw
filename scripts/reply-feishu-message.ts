#!/usr/bin/env bun
/**
 * 回复飞书消息
 */

import * as Lark from '@larksuiteoapi/node-sdk'

// 飞书配置
const config = {
  appId: 'cli_a952232bb43b9bdf',
  appSecret: 'I2uacwlsVIrs7WuHmZ2TsfxFYDVbmA4t'
}

// 消息信息
const messageId = 'om_x100b52edd775a0b8c1026af35c519b8'

async function reply() {
  console.log('🚀 正在回复飞书消息...')
  console.log(`   消息ID: ${messageId}`)

  // 创建 Lark Client
  const larkClient = new Lark.Client({
    appId: config.appId,
    appSecret: config.appSecret,
    appType: Lark.AppType.SelfBuild,
    domain: Lark.Domain.Feishu,
  })

  // 回复消息 - 迪卢克风格
  const replyText = '哼，找我有什么事？\n\n- 迪卢克'

  const content = JSON.stringify({ text: replyText })

  try {
    const response = await larkClient.im.message.reply({
      path: { message_id: messageId },
      data: {
        content,
        msg_type: 'text'
      }
    })

    if (response.code !== 0) {
      console.error(`❌ 回复失败: code=${response.code}, msg=${response.msg || 'unknown'}`)
      console.error('完整响应:', JSON.stringify(response, null, 2))
      return
    }

    console.log('✅ 回复成功！')
    console.log(`   回复消息ID: ${response.data?.message_id || 'unknown'}`)
    console.log(`   回复内容: ${replyText}`)
  } catch (error) {
    console.error('❌ 回复异常:', error)
  }
}

reply()