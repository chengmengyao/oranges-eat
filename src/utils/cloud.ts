import { env } from '@/config/env'

export interface CloudInitState {
  ready: boolean
  message: string
}

let initialized = false
let initState: CloudInitState = { ready: false, message: '' }

export function getCloudInitState(): CloudInitState {
  return { ...initState }
}

export function initCloud(): CloudInitState {
  if (initialized) {
    return getCloudInitState()
  }
  if (!env.CLOUD_ENV_ID) {
    initState = {
      ready: false,
      message: '云环境未配置：请在 src/config/env.ts 填写 CLOUD_ENV_ID 后重新进入。',
    }
    return getCloudInitState()
  }

  if (typeof wx !== 'undefined' && wx.cloud) {
    wx.cloud.init({
      env: env.CLOUD_ENV_ID,
      traceUser: true,
    })
    initialized = true
    initState = { ready: true, message: '' }
  } else {
    initState = {
      ready: false,
      message: '当前环境不支持微信云开发。',
    }
  }
  return getCloudInitState()
}

export async function downloadFile(fileID: string): Promise<string> {
  const state = initCloud()
  if (!state.ready) {
    throw new Error(state.message || '云环境未配置')
  }
  const res = await wx.cloud.downloadFile({ fileID })
  return res.tempFilePath
}

export async function callFunction<T = unknown>(
  name: string,
  data: Record<string, unknown>,
): Promise<T> {
  const state = initCloud()
  if (!state.ready) {
    throw new Error(state.message || '云环境未配置')
  }
  const res = await wx.cloud.callFunction({ name, data })
  const payload = res.result as
    | { ok?: boolean; error?: string; errorMessage?: string; errMsg?: string; data?: T }
    | undefined
  if (!payload || payload.ok !== true) {
    const message = payload?.error || payload?.errorMessage || payload?.errMsg || '云函数调用失败'
    throw new Error(message)
  }
  return payload.data as T
}
