import type { ShopCategory } from '@/types/shop'

export const PAGE_SIZE = 20
export const MAX_SHOPS_PER_GROUP = 200

export const SHOP_CATEGORIES: readonly ShopCategory[] = ['restaurant', 'cake', 'milktea']

export const CATEGORY_LABELS: Record<ShopCategory, string> = {
  restaurant: '饭店',
  cake: '蛋糕店',
  milktea: '奶茶店',
}

export const INVITE_DEFAULT_DAYS = 7
export const INVITE_DEFAULT_MAX_USES = 50
