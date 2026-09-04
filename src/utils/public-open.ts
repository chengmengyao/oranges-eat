const PENDING_OPEN_PUBLIC_KEY = 'pendingOpenPublic'

export interface PendingOpenPublic {
  publicId: string
  name: string
}

/**
 * 跨端可靠的「直达公开清单」跳转。
 *
 * uni.reLaunch 到 tab 首页时 URL 参数在 H5 会丢失（地址退化成 /#/?… 且首页 onLoad 收不到 query），
 * 故不依赖 URL 参数，而是先把目标写入本地存储，再 reLaunch 无参首页由 index 读取消费。
 * 微信端与分享链接仍走 URL query 兜底，双通道均可直达。
 */
export function openPublicMap(publicId: string, name: string) {
  try {
    uni.setStorageSync(PENDING_OPEN_PUBLIC_KEY, JSON.stringify({ publicId, name }))
  } catch {
    // 存储不可用时退化：仍带一次 URL 参数尝试，部分平台 onLoad 可收到
    uni.reLaunch({ url: `/pages/index/index?publicId=${encodeURIComponent(publicId)}` })
    return
  }
  uni.reLaunch({ url: '/pages/index/index' })
}

/** 读取并清除一次待直达的公开清单（消费即弃，避免残留误打开） */
export function takeQueuedOpenPublic(): PendingOpenPublic | null {
  try {
    const raw = uni.getStorageSync(PENDING_OPEN_PUBLIC_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PendingOpenPublic
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof parsed.publicId !== 'string' ||
      !parsed.publicId
    ) {
      return null
    }
    return { publicId: parsed.publicId, name: typeof parsed.name === 'string' ? parsed.name : '' }
  } catch {
    return null
  } finally {
    try {
      uni.removeStorageSync(PENDING_OPEN_PUBLIC_KEY)
    } catch {
      // 忽略清理失败
    }
  }
}
