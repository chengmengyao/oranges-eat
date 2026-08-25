import { describe, expect, it } from 'vitest'
import {
  buildMarkers,
  findShopIdByMarker,
  MARKER_ICON_BY_CATEGORY,
} from '@/utils/marker'

function pubShop(id: string, category: string, lat = 39.9, lng = 116.4) {
  return {
    id,
    name: `店-${id}`,
    category,
    latitude: lat,
    longitude: lng,
    address: '地址',
    remark: '',
    createdAt: 1,
    updatedAt: 2,
  }
}

describe('buildMarkers', () => {
  it('为每个店铺生成 marker 并维护 id→shopId 映射', () => {
    const shops = [
      pubShop('shop-a', 'restaurant'),
      pubShop('shop-b', 'cake'),
      pubShop('shop-c', 'milktea'),
    ]
    const { markers, mapping } = buildMarkers(shops)
    expect(markers).toHaveLength(3)
    markers.forEach((m) => {
      expect(mapping.get(m.id)).toBe(m.shopId)
    })
  })

  it('marker 使用本地数值 id，不直接用数据库字符串 _id', () => {
    const { markers } = buildMarkers([pubShop('shop-long-id-123', 'restaurant')])
    expect(typeof markers[0].id).toBe('number')
    expect(markers[0].shopId).toBe('shop-long-id-123')
  })

  it('分类对应正确图标', () => {
    const { markers } = buildMarkers([
      pubShop('a', 'restaurant'),
      pubShop('b', 'cake'),
      pubShop('c', 'milktea'),
      pubShop('d', 'spot'),
    ])
    expect(markers[0].iconPath).toBe(MARKER_ICON_BY_CATEGORY.restaurant)
    expect(markers[1].iconPath).toBe(MARKER_ICON_BY_CATEGORY.cake)
    expect(markers[2].iconPath).toBe(MARKER_ICON_BY_CATEGORY.milktea)
    expect(markers[3].iconPath).toBe(MARKER_ICON_BY_CATEGORY.spot)
  })

  it('坐标被正确复制', () => {
    const { markers } = buildMarkers([pubShop('a', 'restaurant', 31.2, 121.5)])
    expect(markers[0].latitude).toBe(31.2)
    expect(markers[0].longitude).toBe(121.5)
  })

  it('200 家容量内全部生成', () => {
    const shops = Array.from({ length: 200 }, (_, i) => pubShop(`s-${i}`, 'restaurant'))
    const { markers } = buildMarkers(shops)
    expect(markers).toHaveLength(200)
  })
})

describe('findShopIdByMarker', () => {
  it('通过数值 id 找到数据库字符串 id', () => {
    const { mapping } = buildMarkers([pubShop('db-shop-id', 'restaurant')])
    const markerId = mapping.keys().next().value as number
    expect(findShopIdByMarker(markerId, mapping)).toBe('db-shop-id')
  })

  it('未找到返回 undefined', () => {
    const { mapping } = buildMarkers([pubShop('a', 'restaurant')])
    expect(findShopIdByMarker(999, mapping)).toBeUndefined()
  })
})
