import { callFunction } from '@/utils/cloud'
import type { PublicShopView, ShopCategory, ShopView } from '@/types/shop'
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
