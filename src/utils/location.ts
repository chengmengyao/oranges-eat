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
  // H5 无小程序授权能力（getSetting 不存在，直接调用会抛 TypeError），
  // 改用浏览器 Permissions API 探测地理位置授权状态
  if (typeof uni.getSetting !== 'function') {
    return queryH5LocationPermission()
  }
  return new Promise((resolve) => {
    uni.getSetting({
      success: (res) => {
        resolve(Boolean(res.authSetting['scope.userLocation']))
      },
      fail: () => resolve(false),
    })
  })
}

function queryH5LocationPermission(): Promise<boolean> {
  const nav = typeof navigator !== 'undefined'
    ? (navigator as unknown as { permissions?: { query: (o: { name: string }) => Promise<{ state: string }> } })
    : undefined
  const queryFn = nav?.permissions?.query
  if (typeof queryFn === 'function') {
    return queryFn({ name: 'geolocation' })
      .then((status) => status.state === 'granted')
      .catch(() => false)
  }
  // 拿不到授权状态时默认允许发起定位：浏览器会在需要时弹出授权询问
  return Promise.resolve(true)
}

export function openLocationSettings(): void {
  // H5 没有独立的“去设置”授权入口，提示用户在浏览器侧处理
  if (typeof uni.openSetting !== 'function') {
    uni.showToast({ title: '请在浏览器设置中允许定位权限', icon: 'none' })
    return
  }
  uni.openSetting({
    success: (res) => {
      if (!res.authSetting['scope.userLocation']) {
        uni.showToast({ title: '未获得定位权限', icon: 'none' })
      }
    },
  })
}
