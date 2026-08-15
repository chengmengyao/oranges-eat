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
  limit = PAGE_SIZE,
): Promise<PagedShops<PublicShopView>> {
  return callFunction('shopApi', {
    action: 'listPublicShops',
    publicId,
    cursor: cursor || null,
    category: category || 'all',
    limit,
  })
}

export async function listPublicMapShops(
  publicId: string,
): Promise<PublicShopView[]> {
  return callFunction('shopApi', {
    action: 'listPublicMapShops',
    publicId,
  })
}

export interface GroupTaggedShopView extends PublicShopView {
  groupId: string
  groupName: string
}

export async function listAllPublicMapShops(): Promise<GroupTaggedShopView[]> {
  return callFunction('shopApi', {
    action: 'listAllPublicMapShops',
  })
}

export async function listMemberShops(
  groupId: string,
  cursor?: string,
  category?: ShopCategory | 'all',
  limit = PAGE_SIZE,
): Promise<PagedShops<ShopView>> {
  return callFunction('shopApi', {
    action: 'listMemberShops',
    groupId,
    cursor: cursor || null,
    category: category || 'all',
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
  expectedUpdatedAt: number
}

export async function updateShop(
  groupId: string,
  shopId: string,
  input: UpdateShopInput,
): Promise<ShopView> {
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
