export type ShopCategory = 'restaurant' | 'cake' | 'milktea'

export interface Shop {
  _id: string
  groupId: string
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
