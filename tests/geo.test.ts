import { describe, expect, it } from 'vitest'
import { formatDistance, haversineDistance, sortByDistance } from '@/utils/geo'

describe('haversineDistance', () => {
  it('同一点距离为 0', () => {
    expect(haversineDistance({ latitude: 39.9, longitude: 116.4 }, { latitude: 39.9, longitude: 116.4 })).toBe(0)
  })

  it('北京到上海约为 1000 公里量级', () => {
    const d = haversineDistance(
      { latitude: 39.9042, longitude: 116.4074 },
      { latitude: 31.2304, longitude: 121.4737 },
    )
    expect(d).toBeGreaterThan(1000000)
    expect(d).toBeLessThan(1200000)
  })

  it('距离对称', () => {
    const a = { latitude: 39.9, longitude: 116.4 }
    const b = { latitude: 22.5, longitude: 114.0 }
    expect(haversineDistance(a, b)).toBeCloseTo(haversineDistance(b, a), 6)
  })
})

describe('formatDistance', () => {
  it('米格式', () => {
    expect(formatDistance(350)).toBe('350 米')
  })

  it('公里格式', () => {
    expect(formatDistance(2500)).toBe('2.5 公里')
  })

  it('非法输入返回未定位', () => {
    expect(formatDistance(NaN)).toBe('未定位')
    expect(formatDistance(-5)).toBe('未定位')
  })
})

describe('sortByDistance', () => {
  it('按直线距离升序排列', () => {
    const origin = { latitude: 0, longitude: 0 }
    const items = [
      { id: 'far', latitude: 10, longitude: 10 },
      { id: 'near', latitude: 0.1, longitude: 0.1 },
      { id: 'mid', latitude: 5, longitude: 5 },
    ]
    const sorted = sortByDistance(origin, items)
    expect(sorted.map((i) => i.id)).toEqual(['near', 'mid', 'far'])
  })

  it('不修改原数组', () => {
    const origin = { latitude: 0, longitude: 0 }
    const items = [
      { id: 'a', latitude: 10, longitude: 10 },
      { id: 'b', latitude: 0.1, longitude: 0.1 },
    ]
    const copy = [...items]
    sortByDistance(origin, items)
    expect(items).toEqual(copy)
  })
})
