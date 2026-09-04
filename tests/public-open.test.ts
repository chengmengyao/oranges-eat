import { afterEach, describe, expect, it, vi } from 'vitest'
import { openPublicMap, takeQueuedOpenPublic } from '@/utils/public-open'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('待直达公开清单跳转', () => {
  it('先暂存目标再 reLaunch 无参首页', () => {
    const setStorageSync = vi.fn()
    const reLaunch = vi.fn()
    vi.stubGlobal('uni', { setStorageSync, reLaunch })

    openPublicMap('pub_g3', '环球玩家榜单')

    expect(setStorageSync).toHaveBeenCalledWith(
      'pendingOpenPublic',
      JSON.stringify({ publicId: 'pub_g3', name: '环球玩家榜单' }),
    )
    expect(reLaunch).toHaveBeenCalledWith({ url: '/pages/index/index' })
  })

  it('存储不可用时回退到 URL 参数跳转', () => {
    const setStorageSync = vi.fn(() => {
      throw new Error('quota exceeded')
    })
    const reLaunch = vi.fn()
    vi.stubGlobal('uni', { setStorageSync, reLaunch })

    openPublicMap('pub_g3', '环球玩家榜单')

    expect(reLaunch).toHaveBeenCalledWith({ url: '/pages/index/index?publicId=pub_g3' })
  })

  it('读取并清除一次待消费项', () => {
    const getStorageSync = vi.fn(() => JSON.stringify({ publicId: 'pub_g3', name: '环球玩家榜单' }))
    const removeStorageSync = vi.fn()
    vi.stubGlobal('uni', { getStorageSync, removeStorageSync })

    expect(takeQueuedOpenPublic()).toEqual({ publicId: 'pub_g3', name: '环球玩家榜单' })
    expect(removeStorageSync).toHaveBeenCalledWith('pendingOpenPublic')
  })

  it('无待消费项时返回 null 并清理残留', () => {
    const getStorageSync = vi.fn(() => '')
    const removeStorageSync = vi.fn()
    vi.stubGlobal('uni', { getStorageSync, removeStorageSync })

    expect(takeQueuedOpenPublic()).toBeNull()
    expect(removeStorageSync).toHaveBeenCalledWith('pendingOpenPublic')
  })
})
