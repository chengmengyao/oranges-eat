import { callFunction } from '@/utils/cloud'
import type {
  CityShopView,
  CityStandaloneShopView,
  CitySharedShopView,
  CitySummary,
  PublicShopView,
  ShopCategory,
  ShopView,
} from '@/types/shop'
import { PAGE_SIZE } from '@/constants/shop'

export interface PagedShops<T> {
  shops: T[]
  hasMore: boolean
  nextCursor?: string
}

export async function listPublicShops(
  publicId: string,
  cursor?: string,
  category?: ShopCategory | 'all',
  folderId?: string,
  limit = PAGE_SIZE,
): Promise<PagedShops<PublicShopView>> {
  return callFunction('shopApi', {
    action: 'listPublicShops',
    publicId,
    cursor: cursor || null,
    category: category || 'all',
    folderId: folderId || 'all',
    limit,
  })
}

export async function listPublicMapShops(
  publicId: string,
  folderId?: string,
): Promise<PublicShopView[]> {
  return callFunction('shopApi', {
    action: 'listPublicMapShops',
    publicId,
    folderId: folderId || 'all',
  })
}

export async function listMemberMapShops(groupId: string): Promise<ShopView[]> {
  return callFunction('shopApi', {
    action: 'listMemberMapShops',
    groupId,
  })
}

export async function listMyCities(): Promise<CitySummary[]> {
  return callFunction('shopApi', { action: 'listMyCities' })
}

export async function listMyCityMapShops(cityCode: string): Promise<CityShopView[]> {
  return callFunction('shopApi', {
    action: 'listMyCityMapShops',
    cityCode,
  })
}

export async function listMyCityShops(
  cityCode: string,
  category?: ShopCategory | 'all',
): Promise<CityStandaloneShopView[]> {
  return callFunction('shopApi', {
    action: 'listMyCityShops',
    cityCode,
    category: category || 'all',
  })
}

export async function createCityShop(
  input: CreateShopInput & { cityCode: string; cityName: string },
): Promise<CityStandaloneShopView> {
  return callFunction('shopApi', { action: 'createCityShop', ...input })
}

export async function updateCityShop(
  shopId: string,
  input: Omit<CreateShopInput, 'requestId'> & { expectedUpdatedAt: number },
): Promise<CityStandaloneShopView> {
  return callFunction('shopApi', { action: 'updateCityShop', shopId, ...input })
}

export async function deleteCityShop(shopId: string): Promise<{ deleted: boolean }> {
  return callFunction('shopApi', { action: 'deleteCityShop', shopId })
}

export interface CityShareResult {
  token: string
  shortCode: string
  cityCode: string
  cityName: string
  expiresAt: number
}

export async function createCityShare(cityCode: string, cityName: string): Promise<CityShareResult> {
  return callFunction('shopApi', { action: 'createCityShare', cityCode, cityName })
}

export async function createCityShareQrCode(token: string): Promise<{
  fileID: string
  cityCode: string
  cityName: string
  expiresAt: number
}> {
  return callFunction('shopApi', { action: 'createCityShareQrCode', token })
}

export async function getSharedCity(token: string): Promise<{
  cityCode: string
  cityName: string
  shops: CitySharedShopView[]
}> {
  return callFunction('shopApi', { action: 'getSharedCity', token })
}

export async function acceptCityShare(token?: string, code?: string, displayName?: string): Promise<{
  groupId: string
  publicId: string
  name: string
  duplicated: boolean
}> {
  return callFunction('shopApi', {
    action: 'acceptCityShare',
    token: token || '',
    code: code || '',
    displayName: displayName || '朋友',
  })
}

export async function listMemberShops(
  groupId: string,
  cursor?: string,
  category?: ShopCategory | 'all',
  folderId?: string,
  limit = PAGE_SIZE,
): Promise<PagedShops<ShopView>> {
  return callFunction('shopApi', {
    action: 'listMemberShops',
    groupId,
    cursor: cursor || null,
    category: category || 'all',
    folderId: folderId || 'all',
    limit,
  })
}

export interface CreateShopInput {
  name: string
  category: ShopCategory
  latitude: number
  longitude: number
  address: string
  remark?: string
  folderId?: string | null
  requestId: string
}

export async function createShop(
  groupId: string,
  input: CreateShopInput,
): Promise<ShopView> {
  return callFunction('shopApi', {
    action: 'createShop',
    groupId,
    ...input,
  })
}

export interface UpdateShopInput {
  name: string
  category: ShopCategory
  latitude: number
  longitude: number
  address: string
  remark?: string
  folderId?: string | null
  targetGroupId?: string
  expectedUpdatedAt: number
}

export async function updateShop(
  groupId: string,
  shopId: string,
  input: UpdateShopInput,
): Promise<ShopView & { moved?: boolean }> {
  return callFunction('shopApi', {
    action: 'updateShop',
    groupId,
    shopId,
    ...input,
  })
}

export async function deleteShop(
  groupId: string,
  shopId: string,
): Promise<{ deleted: boolean }> {
  return callFunction('shopApi', {
    action: 'deleteShop',
    groupId,
    shopId,
  })
}
