import { describe, expect, it } from 'vitest'
import { toPublicShopView, toShopView, isPublicShopViewSafe, hasNoInternalFields } from '../cloudfunctions/shared/dto'

function dbShop(overrides = {}) {
  return {
    _id: 'shop-abc',
    groupId: 'group-1',
    folderId: 'folder-beijing',
    cityCode: '北京',
    cityName: '北京',
    name: '示例饭店',
    category: 'restaurant',
    latitude: 39.9,
    longitude: 116.4,
    address: '北京市朝阳区',
    remark: '',
    createdByOpenId: 'openid-secret',
    createdByName: '小明',
    updatedByOpenId: 'openid-secret',
    createdAt: 1000,
    updatedAt: 2000,
    ...overrides,
  }
}

const member = { role: 'member', userOpenId: 'openid-b' }

describe('toPublicShopView 访客 DTO 脱敏', () => {
  it('不包含成员/权限/内部字段', () => {
    const view = toPublicShopView(dbShop())
    expect(isPublicShopViewSafe(view)).toBe(true)
    expect(hasNoInternalFields(view)).toBe(true)
    expect(view).not.toHaveProperty('creatorName')
    expect(view).not.toHaveProperty('isMine')
    expect(view).not.toHaveProperty('canEdit')
    expect(view).not.toHaveProperty('canDelete')
  })

  it('保留公开展示字段', () => {
    const view = toPublicShopView(dbShop())
    expect(view.id).toBe('shop-abc')
    expect(view.name).toBe('示例饭店')
    expect(view.address).toBe('北京市朝阳区')
  })

  it('透传城市子清单 folderId，未分类为 null', () => {
    expect(toPublicShopView(dbShop()).folderId).toBe('folder-beijing')
    expect(toPublicShopView(dbShop({ folderId: null })).folderId).toBeNull()
    expect(toPublicShopView(dbShop()).folderId).not.toBeUndefined()
  })

  it('透传城市聚合字段，历史数据缺失时返回 null', () => {
    expect(toPublicShopView(dbShop()).cityCode).toBe('北京')
    expect(toPublicShopView(dbShop()).cityName).toBe('北京')
    expect(toPublicShopView(dbShop({ cityCode: undefined, cityName: undefined })).cityCode).toBeNull()
  })
})

describe('toShopView 成员 DTO', () => {
  it('包含添加者与权限字段', () => {
    const view = toShopView(dbShop({ createdByOpenId: 'openid-b' }), member)
    expect(view.creatorName).toBe('小明')
    expect(view.isMine).toBe(true)
    expect(view.canEdit).toBe(true)
    expect(view.canDelete).toBe(true)
    expect(hasNoInternalFields(view)).toBe(true)
  })

  it('他人店铺 isMine=false', () => {
    const view = toShopView(dbShop({ createdByOpenId: 'openid-a' }), member)
    expect(view.isMine).toBe(false)
    expect(view.canEdit).toBe(false)
  })

  it('owner 可以编辑所有店铺', () => {
    const owner = { role: 'owner', userOpenId: 'openid-owner' }
    const view = toShopView(dbShop({ createdByOpenId: 'openid-a' }), owner)
    expect(view.canEdit).toBe(true)
    expect(view.canDelete).toBe(true)
  })
})

describe('hasNoInternalFields', () => {
  it('任何 DTO 都不泄露 OpenID / token 摘要', () => {
    const shopView = toShopView(dbShop(), member)
    const publicView = toPublicShopView(dbShop())
    expect(hasNoInternalFields(shopView)).toBe(true)
    expect(hasNoInternalFields(publicView)).toBe(true)
  })
})
