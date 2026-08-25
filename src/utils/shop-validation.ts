import type { ShopCategory } from '@/types/shop'
import { SHOP_CATEGORIES } from '@/constants/shop'

export interface ShopForm {
  name: string
  category: ShopCategory
  latitude: number | null
  longitude: number | null
  address: string
  remark: string
}

export interface ValidationError {
  field: string
  message: string
}

export const MAX_NAME_LENGTH = 40
export const MAX_ADDRESS_LENGTH = 120
export const MAX_REMARK_LENGTH = 200
export const MIN_LATITUDE = -90
export const MAX_LATITUDE = 90
export const MIN_LONGITUDE = -180
export const MAX_LONGITUDE = 180

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function validateCoordinate(
  latitude: unknown,
  longitude: unknown,
): ValidationError | null {
  if (!isFiniteNumber(latitude) || !isFiniteNumber(longitude)) {
    return { field: 'coordinate', message: '请先在地图上选点' }
  }
  if (
    latitude < MIN_LATITUDE ||
    latitude > MAX_LATITUDE ||
    longitude < MIN_LONGITUDE ||
    longitude > MAX_LONGITUDE
  ) {
    return { field: 'coordinate', message: '所选位置坐标无效' }
  }
  return null
}

export function normalizeText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLength)
}

export function validateShopForm(form: ShopForm): ValidationError | null {
  const name = normalizeText(form.name, MAX_NAME_LENGTH)
  if (!name) {
    return { field: 'name', message: '请输入名称' }
  }
  if (!SHOP_CATEGORIES.includes(form.category)) {
    return { field: 'category', message: '请选择分类' }
  }
  const address = normalizeText(form.address, MAX_ADDRESS_LENGTH)
  if (!address) {
    return { field: 'address', message: '请在地图上选点以获取地址' }
  }
  const coordError = validateCoordinate(form.latitude, form.longitude)
  if (coordError) {
    return coordError
  }
  if (form.remark.length > MAX_REMARK_LENGTH) {
    return { field: 'remark', message: `备注不能超过 ${MAX_REMARK_LENGTH} 字` }
  }
  return null
}
