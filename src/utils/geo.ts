const EARTH_RADIUS_M = 6371000

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180
}

export interface LatLng {
  latitude: number
  longitude: number
}

export function haversineDistance(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.latitude - a.latitude)
  const dLon = toRadians(b.longitude - a.longitude)
  const lat1 = toRadians(a.latitude)
  const lat2 = toRadians(b.latitude)

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h))
}

export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) {
    return '未定位'
  }
  if (meters < 1000) {
    return `${Math.round(meters)} 米`
  }
  const km = meters / 1000
  return `${km.toFixed(1)} 公里`
}

export function sortByDistance<T extends LatLng>(
  origin: LatLng,
  items: T[],
): T[] {
  return [...items].sort((a, b) => {
    const da = haversineDistance(origin, a)
    const db = haversineDistance(origin, b)
    return da - db
  })
}
