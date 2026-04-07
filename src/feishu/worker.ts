/**
 * 飞书 Worker 线程
 *
 * 将飞书 SDK 运行在独立的 Worker 线程中，避免阻塞主线程
 */

import { parentPort, workerData } from 'worker_threads'
import * as Lark from '@larksuiteoapi/node-sdk'

interface WorkerData {
  appId: string
  appSecret: string
  encryptKey?: string
  verificationToken?: string
}

const config = workerData as WorkerData

// 创建飞书客户端
const client = new Lark.Client({
  appId: config.appId,
  appSecret: config.appSecret,
  appType: Lark.AppType.SelfBuild,
  domain: Lark.Domain.Feishu,
})

// 创建事件分发器
const eventDispatcher = new Lark.EventDispatcher({
  encryptKey: config.encryptKey || '',
  verificationToken: config.verificationToken || '',
})

// 创建 WebSocket 客户端
const wsClient = new Lark.WSClient({
  appId: config.appId,
  appSecret: config.appSecret,
  domain: Lark.Domain.Feishu,
  loggerLevel: Lark.LoggerLevel.info,
})

// 注册消息处理器
eventDispatcher.register({
  'im.message.receive_v1': async (data: Lark.IMMessageReceiveV1) => {
    // 将消息发送到主线程
    parentPort?.postMessage({
      type: 'message',
      data: data,
    })
  },
})

// 启动飞书 WebSocket 客户端
wsClient
  .start({ eventDispatcher })
  .then(() => {
    parentPort?.postMessage({ type: 'status', status: 'ready' })
  })
  .catch((error) => {
    parentPort?.postMessage({ type: 'error', error: error.message })
  })

// 监听主线程消息
parentPort?.on('message', async (msg) => {
  if (msg.type === 'sendMessage') {
    try {
      // 发送消息到飞书
      const result = await client.im.message.create({
        params: {
          receive_id_type: msg.data.receiveIdType,
        },
        data: {
          receive_id: msg.data.receiveId,
          content: JSON.stringify(msg.data.content),
          msg_type: msg.data.msgType,
        },
      })
      parentPort?.postMessage({ type: 'sendResult', success: true, result })
    } catch (error: any) {
      parentPort?.postMessage({
        type: 'sendResult',
        success: false,
        error: error.message,
      })
    }
  }
})

// 注意：Lark.WSClient 没有 on 方法，错误处理在 start 方法中