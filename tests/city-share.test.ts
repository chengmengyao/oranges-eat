import { describe, expect, it } from 'vitest'

const { cityShareGroupId, shopIdentityKey, dedupeShopsForCopy } = require(
  '../cloudfunctions/shopApi/city-share',
) as {
  cityShareGroupId: (ownerOpenId: string, cityCode: string) => string
  shopIdentityKey: (shop: { name?: string; latitude?: number; longitude?: number } | null) => string
  dedupeShopsForCopy: <T extends { name?: string; latitude?: number; longitude?: number }>(records: T[]) => T[]
}

describe('cityShareGroupId', () => {
  it('同一分享者+城市返回稳定 ID', () => {
    const first = cityShareGroupId('owner-a', '成都')
    expect(first).toHaveLength(32)
    expect(cityShareGroupId('owner-a', '成都')).toBe(first)
  })

  it('不同城市/分享者不会共用清单 ID（所有领取人共用同一份）', () => {
    const base = cityShareGroupId('owner-a', '成都')
    expect(cityShareGroupId('owner-a', '北京')).not.toBe(base)
    expect(cityShareGroupId('owner-c', '成都')).not.toBe(base)
  })

  it('参数不完整时返回空字符串', () => {
    expect(cityShareGroupId('', '成都')).toBe('')
    expect(cityShareGroupId('owner-a', '')).toBe('')
  })
})

describe('shopIdentityKey', () => {
  it('名称与经纬度决定物理身份', () => {
    expect(shopIdentityKey({ name: '老王面馆', latitude: 30.1, longitude: 104.2 })).toBe(
      '老王面馆|30.1|104.2',
    )
  })

  it('坐标不同视为不同店铺', () => {
    expect(shopIdentityKey({ name: '老王面馆', latitude: 30.1, longitude: 104.2 })).not.toBe(
      shopIdentityKey({ name: '老王面馆', latitude: 30.2, longitude: 104.2 }),
    )
  })
})

describe('dedupeShopsForCopy', () => {
  const shop = { name: '老王面馆', latitude: 30.1, longitude: 104.2 }

  it('折叠物理身份相同的重复店铺', () => {
    const result = dedupeShopsForCopy([shop, { ...shop }, { ...shop, category: 'restaurant' }])
    expect(result).toHaveLength(1)
  })

  it('保留不同店铺并维持顺序', () => {
    const other = { name: '隔壁甜品', latitude: 30.3, longitude: 104.4 }
    const result = dedupeShopsForCopy([shop, other, { ...shop }])
    expect(result).toHaveLength(2)
    expect(result[0]).toBe(shop)
    expect(result[1]).toBe(other)
  })

  it('空数组安全', () => {
    expect(dedupeShopsForCopy([])).toEqual([])
  })
})
