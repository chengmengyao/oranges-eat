import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getCurrentLocation,
  getLastPosition,
  hasLocationPermission,
  saveLastPosition,
} from '@/utils/location'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('位置缓存', () => {
  it('只读取未过期且带时间戳的位置', () => {
    vi.spyOn(Date, 'now').mockReturnValue(10_000)
    vi.stubGlobal('uni', {
      getStorageSync: vi.fn(() => JSON.stringify({
        latitude: 31.2,
        longitude: 121.5,
        savedAt: 9_500,
      })),
    })

    expect(getLastPosition(1_000)).toEqual({ latitude: 31.2, longitude: 121.5 })
  })

  it('忽略过期位置和旧版无时间戳缓存', () => {
    vi.spyOn(Date, 'now').mockReturnValue(10_000)
    const getStorageSync = vi.fn()
      .mockReturnValueOnce(JSON.stringify({ latitude: 31.2, longitude: 121.5, savedAt: 1_000 }))
      .mockReturnValueOnce(JSON.stringify({ latitude: 31.2, longitude: 121.5 }))
    vi.stubGlobal('uni', { getStorageSync })

    expect(getLastPosition(1_000)).toBeNull()
    expect(getLastPosition(1_000)).toBeNull()
  })

  it('保存位置时记录获取时间', () => {
    vi.spyOn(Date, 'now').mockReturnValue(12_345)
    const setStorageSync = vi.fn()
    vi.stubGlobal('uni', { setStorageSync })

    saveLastPosition({ latitude: 22.5, longitude: 114 })

    expect(setStorageSync).toHaveBeenCalledWith(
      'last_valid_location',
      JSON.stringify({ latitude: 22.5, longitude: 114, savedAt: 12_345 }),
    )
  })
})

describe('当前定位', () => {
  it('使用 GCJ-02 高精度定位并缓存结果', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(20_000)
    const setStorageSync = vi.fn()
    const getLocation = vi.fn((options) => {
      options.success({ latitude: 30.3, longitude: 120.2 })
    })
    vi.stubGlobal('uni', { getLocation, setStorageSync })

    await expect(getCurrentLocation()).resolves.toEqual({
      ok: true,
      position: { latitude: 30.3, longitude: 120.2 },
    })
    expect(getLocation).toHaveBeenCalledWith(expect.objectContaining({
      type: 'gcj02',
      isHighAccuracy: true,
      highAccuracyExpireTime: 5000,
    }))
    expect(setStorageSync).toHaveBeenCalledOnce()
  })

  it('只在已经获得定位权限时允许静默刷新', async () => {
    const getSetting = vi.fn((options) => {
      options.success({ authSetting: { 'scope.userLocation': true } })
    })
    vi.stubGlobal('uni', { getSetting })

    await expect(hasLocationPermission()).resolves.toBe(true)
  })
})

describe('H5 定位权限探测', () => {
  it('无 getSetting 时按 Permissions API 判定已授权', async () => {
    const query = vi.fn(() => Promise.resolve({ state: 'granted' }))
    vi.stubGlobal('uni', {})
    vi.stubGlobal('navigator', { permissions: { query } })

    await expect(hasLocationPermission()).resolves.toBe(true)
    expect(query).toHaveBeenCalledWith({ name: 'geolocation' })
  })

  it('Permisissions API 返回拒绝时判定未授权', async () => {
    const query = vi.fn(() => Promise.resolve({ state: 'denied' }))
    vi.stubGlobal('uni', {})
    vi.stubGlobal('navigator', { permissions: { query } })

    await expect(hasLocationPermission()).resolves.toBe(false)
  })

  it('无 Permissions API 时默认允许发起定位', async () => {
    vi.stubGlobal('uni', {})
    vi.stubGlobal('navigator', undefined)

    await expect(hasLocationPermission()).resolves.toBe(true)
  })
})
