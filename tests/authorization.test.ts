import { describe, expect, it } from 'vitest'
import { resolveRole, roleCan, canWriteShop } from '../cloudfunctions/shared/permissions'

function owner(openId = 'openid-owner') {
  return { role: 'owner', userOpenId: openId }
}

function member(openId = 'openid-b') {
  return { role: 'member', userOpenId: openId }
}

function shop(createdBy = 'openid-b') {
  return { _id: 'shop-1', createdByOpenId: createdBy }
}

describe('resolveRole', () => {
  it('无成员为访客', () => {
    expect(resolveRole(null)).toBe('visitor')
  })

  it('owner/member 正确解析', () => {
    expect(resolveRole(owner())).toBe('owner')
    expect(resolveRole(member())).toBe('member')
  })
})

describe('roleCan 权限矩阵', () => {
  it('访客只能公开读，不能看成员列表、邀请或写', () => {
    expect(roleCan('viewPublic', 'visitor')).toBe(true)
    expect(roleCan('viewMembers', 'visitor')).toBe(false)
    expect(roleCan('createInvite', 'visitor')).toBe(false)
    expect(roleCan('createShop', 'visitor')).toBe(false)
    expect(roleCan('updateAnyShop', 'visitor')).toBe(false)
  })

  it('普通成员可看成员列表、新增店铺，但不能管理邀请和他人店铺', () => {
    expect(roleCan('viewMembers', 'member')).toBe(true)
    expect(roleCan('createShop', 'member')).toBe(true)
    expect(roleCan('createInvite', 'member')).toBe(false)
    expect(roleCan('revokeInvite', 'member')).toBe(false)
    expect(roleCan('renameGroup', 'member')).toBe(false)
    expect(roleCan('removeMember', 'member')).toBe(false)
    expect(roleCan('updateAnyShop', 'member')).toBe(false)
    expect(roleCan('deleteAnyShop', 'member')).toBe(false)
  })

  it('创建者拥有全部管理权限', () => {
    expect(roleCan('createInvite', 'owner')).toBe(true)
    expect(roleCan('revokeInvite', 'owner')).toBe(true)
    expect(roleCan('renameGroup', 'owner')).toBe(true)
    expect(roleCan('removeMember', 'owner')).toBe(true)
    expect(roleCan('updateAnyShop', 'owner')).toBe(true)
    expect(roleCan('deleteAnyShop', 'owner')).toBe(true)
    expect(roleCan('createShop', 'owner')).toBe(true)
  })
})

describe('canWriteShop 店铺写权限', () => {
  it('普通成员只能编辑/删除自己添加的店', () => {
    const m = member('openid-b')
    expect(canWriteShop(m, shop('openid-b'), 'updateShop')).toBe(true)
    expect(canWriteShop(m, shop('openid-b'), 'deleteShop')).toBe(true)
    expect(canWriteShop(m, shop('openid-a'), 'updateShop')).toBe(false)
    expect(canWriteShop(m, shop('openid-a'), 'deleteShop')).toBe(false)
  })

  it('创建者可管理全部店铺', () => {
    const o = owner()
    expect(canWriteShop(o, shop('openid-b'), 'updateShop')).toBe(true)
    expect(canWriteShop(o, shop('openid-b'), 'deleteShop')).toBe(true)
  })

  it('访客不能写任何店铺', () => {
    expect(canWriteShop(null, shop('openid-b'), 'updateShop')).toBe(false)
    expect(canWriteShop(null, shop('openid-b'), 'deleteShop')).toBe(false)
  })

  it('伪造 canEdit 等客户端字段不影响判断', () => {
    const m = member('openid-b')
    const forged = { ...shop('openid-a'), canEdit: true, canDelete: true }
    expect(canWriteShop(m, forged, 'updateShop')).toBe(false)
  })
})
