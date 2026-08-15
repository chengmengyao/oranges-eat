/**
 * 店铺 DTO 脱敏纯逻辑（与云函数共用，可被单元测试直接引用）
 * 访客与成员看到的字段不同；任何响应都不含 OpenID / token 摘要 / 内部字段。
 */
const SHOP_CATEGORIES = ['restaurant', 'cake', 'milktea']

// 访客 DTO：不含添加者名称、isMine、canEdit、canDelete
function toPublicShopView(shop) {
  return {
    id: shop._id,
    name: shop.name,
    category: shop.category,
    latitude: shop.latitude,
    longitude: shop.longitude,
    address: shop.address,
    remark: shop.remark || '',
    createdAt: shop.createdAt,
    updatedAt: shop.updatedAt,
  }
}

// 成员 DTO：含添加者名称与权限标记
function toShopView(shop, member) {
  const isOwner = Boolean(member && member.role === 'owner')
  const isMine = Boolean(member && shop.createdByOpenId === member.userOpenId)
  const canEdit = isOwner || isMine
  const canDelete = canEdit
  return {
    id: shop._id,
    name: shop.name,
    category: shop.category,
    latitude: shop.latitude,
    longitude: shop.longitude,
    address: shop.address,
    remark: shop.remark || '',
    creatorName: shop.createdByName,
    isMine,
    canEdit,
    canDelete,
    createdAt: shop.createdAt,
    updatedAt: shop.updatedAt,
  }
}

// 公开 DTO 不应包含任何身份/权限字段
function isPublicShopViewSafe(view) {
  return !('creatorName' in view || 'isMine' in view || 'canEdit' in view || 'canDelete' in view)
}

// 内部字段（含 OpenID）不得出现在任何响应中
function hasNoInternalFields(anyView) {
  const blocked = ['createdByOpenId', 'updatedByOpenId', 'userOpenId', 'tokenHash', 'ownerOpenId']
  return blocked.every((key) => !(key in anyView))
}

module.exports = {
  SHOP_CATEGORIES,
  toPublicShopView,
  toShopView,
  isPublicShopViewSafe,
  hasNoInternalFields,
}
