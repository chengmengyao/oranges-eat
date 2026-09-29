export type ShopCategory = 'restaurant' | 'cake' | 'milktea' | 'spot'

export interface Shop {
  _id: string
  groupId: string
  folderId: string | null
  cityCode?: string | null
  cityName?: string | null
  name: string
  category: ShopCategory
  latitude: number
  longitude: number
  address: string
  remark?: string
  createdByOpenId: string
  createdByName: string
  updatedByOpenId: string
  createdAt: Date
  updatedAt: Date
}

export interface ShopView {
  id: string
  folderId: string | null
  cityCode?: string | null
  cityName?: string | null
  name: string
  category: ShopCategory
  latitude: number
  longitude: number
  address: string
  remark?: string
  creatorName: string
  isMine: boolean
  canEdit: boolean
  canDelete: boolean
  createdAt: Date
  updatedAt: Date
}

export type PublicShopView = Omit<ShopView, 'creatorName' | 'isMine' | 'canEdit' | 'canDelete'>

export interface CitySummary {
  cityCode: string
  cityName: string
  shopCount: number
  groupCount: number
}

export interface CityShopView extends ShopView {
  cityCode: string
  cityName: string
  sourceGroupId: string
  sourceGroupName: string
  sourcePublicId: string
}

export interface CityStandaloneShopView extends ShopView {
  cityCode: string
  cityName: string
}

export type CitySharedShopView = Omit<
  CityStandaloneShopView,
  'creatorName' | 'isMine' | 'canEdit' | 'canDelete'
>
