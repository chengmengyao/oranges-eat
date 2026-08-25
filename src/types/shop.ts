export type ShopCategory = 'restaurant' | 'cake' | 'milktea' | 'spot'

export interface Shop {
  _id: string
  groupId: string
  folderId: string | null
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
