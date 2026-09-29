const PENDING_CITY_ADD_KEY = 'pendingCityAdd'

export interface PendingCityAdd {
  cityCode: string
  cityName: string
}

export function queueCityAdd(city: PendingCityAdd) {
  uni.setStorageSync(PENDING_CITY_ADD_KEY, JSON.stringify(city))
}

export function takeQueuedCityAdd(): PendingCityAdd | null {
  try {
    const raw = uni.getStorageSync(PENDING_CITY_ADD_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PendingCityAdd
    if (!parsed?.cityCode || !parsed.cityName) return null
    return parsed
  } catch {
    return null
  } finally {
    uni.removeStorageSync(PENDING_CITY_ADD_KEY)
  }
}
