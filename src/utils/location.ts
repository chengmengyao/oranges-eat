const LAST_LOCATION_KEY = 'last_valid_location'
const DEFAULT_CENTER = { latitude: 39.9042, longitude: 116.4074 }
const LAST_LOCATION_MAX_AGE_MS = 30 * 60 * 1000

export interface Position {
  latitude: number
  longitude: number
}

interface StoredPosition extends Position {
  savedAt: number
}

function isValidPosition(pos: unknown): pos is Position {
  if (!pos || typeof pos !== 'object') return false
  const candidate = pos as Partial<Position>
  return (
    typeof candidate.latitude === 'number' &&
    Number.isFinite(candidate.latitude) &&
    candidate.latitude >= -90 &&
    candidate.latitude <= 90 &&
    typeof candidate.longitude === 'number' &&
    Number.isFinite(candidate.longitude) &&
    candidate.longitude >= -180 &&
    candidate.longitude <= 180
  )
}

export function getDefaultCenter(): Position {
  return { ...DEFAULT_CENTER }
}

export function getLastPosition(maxAgeMs = LAST_LOCATION_MAX_AGE_MS): Position | null {
  try {
    const raw = uni.getStorageSync(LAST_LOCATION_KEY)
    if (!raw) return null
    const pos = JSON.parse(raw) as StoredPosition
    if (!isValidPosition(pos) || !Number.isFinite(pos.savedAt)) return null
    if (Date.now() - pos.savedAt > maxAgeMs) return null
    return { latitude: pos.latitude, longitude: pos.longitude }
  } catch {
    return null
  }
}

export function saveLastPosition(pos: Position): void {
  if (!isValidPosition(pos)) return
  const stored: StoredPosition = { ...pos, savedAt: Date.now() }
  uni.setStorageSync(LAST_LOCATION_KEY, JSON.stringify(stored))
}

export type LocationResult =
  | { ok: true; position: Position }
  | { ok: false; error: string }

export function getCurrentLocation(): Promise<LocationResult> {
  return new Promise((resolve) => {
    uni.getLocation({
      type: 'gcj02',
      isHighAccuracy: true,
      highAccuracyExpireTime: 5000,
      success: (res) => {
        const position = { latitude: res.latitude, longitude: res.longitude }
        saveLastPosition(position)
        resolve({ ok: true, position })
      },
      fail: (err) => {
        resolve({ ok: false, error: err.errMsg || '定位失败' })
      },
    })
  })
}

export function hasLocationPermission(): Promise<boolean> {
  return new Promise((resolve) => {
    uni.getSetting({
      success: (res) => {
        resolve(Boolean(res.authSetting['scope.userLocation']))
      },
      fail: () => resolve(false),
    })
  })
}

export function openLocationSettings(): void {
  uni.openSetting({
    success: (res) => {
      if (!res.authSetting['scope.userLocation']) {
        uni.showToast({ title: '未获得定位权限', icon: 'none' })
      }
    },
  })
}
