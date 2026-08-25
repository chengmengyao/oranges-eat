import type { PublicShopView, ShopView } from '@/types/shop'

export interface MarkerItem {
  id: number
  shopId: string
}

export const MARKER_ICON_BY_CATEGORY: Record<string, string> = {
  restaurant: '/static/markers/restaurant.png',
  cake: '/static/markers/cake.png',
  milktea: '/static/markers/milktea.png',
  spot: '/static/markers/spot.png',
}

export const MARKER_WIDTH = 38
export const MARKER_HEIGHT = 38

export interface BuiltMarker {
  id: number
  shopId: string
  latitude: number
  longitude: number
  iconPath: string
}

export function buildMarkers(
  shops: (ShopView | PublicShopView)[],
  startId = 0,
): { markers: BuiltMarker[]; mapping: Map<number, string> } {
  const mapping = new Map<number, string>()
  const markers = shops.map((shop, idx) => {
    const id = startId + idx + 1
    mapping.set(id, shop.id)
    return {
      id,
      shopId: shop.id,
      latitude: shop.latitude,
      longitude: shop.longitude,
      iconPath: MARKER_ICON_BY_CATEGORY[shop.category],
    }
  })
  return { markers, mapping }
}

export function findShopIdByMarker(
  markerId: number,
  mapping: Map<number, string>,
): string | undefined {
  return mapping.get(markerId)
}
