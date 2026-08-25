import { describe, expect, it } from 'vitest'
import { MAX_SHOPS_PER_GROUP, evaluateMoveTarget, resolveFolderGroupId } from '../cloudfunctions/shopApi/move-target'

function activeGroup(id = 'g-target') {
  return { _id: id, status: 'active', visibility: 'public_read' }
}

function activeMember(role = 'member') {
  return { role, userOpenId: 'openid-me', status: 'active' }
}

describe('shopApi evaluateMoveTarget', () => {
  it('未传 targetGroupId 视为普通编辑，不需要移动', () => {
    expect(
      evaluateMoveTarget({ targetGroupId: '', sourceGroupId: 'g-src', group: null, member: null, targetShopCount: 0 }),
    ).toEqual({ ok: true, data: { needsMove: false } })
  })

  it('目标与源清单相同视为普通编辑', () => {
    expect(
      evaluateMoveTarget({
        targetGroupId: 'g-src',
        sourceGroupId: 'g-src',
        group: activeGroup(),
        member: activeMember(),
        targetShopCount: 0,
      }),
    ).toEqual({ ok: true, data: { needsMove: false } })
  })

  it('目标清单不存在或不可访问时拒绝', () => {
    expect(
      evaluateMoveTarget({
        targetGroupId: 'g-target',
        sourceGroupId: 'g-src',
        group: null,
        member: activeMember(),
        targetShopCount: 0,
      }),
    ).toEqual({ ok: false, error: '目标清单不存在或不可访问', code: 'GROUP_NOT_FOUND' })

    expect(
      evaluateMoveTarget({
        targetGroupId: 'g-target',
        sourceGroupId: 'g-src',
        group: { ...activeGroup(), status: 'deleting' },
        member: activeMember(),
        targetShopCount: 0,
      }),
    ).toEqual({ ok: false, error: '目标清单不存在或不可访问', code: 'GROUP_NOT_FOUND' })
  })

  it('非活跃成员不能移入目标清单', () => {
    expect(
      evaluateMoveTarget({
        targetGroupId: 'g-target',
        sourceGroupId: 'g-src',
        group: activeGroup(),
        member: null,
        targetShopCount: 0,
      }),
    ).toEqual({ ok: false, error: '请先加入目标清单再移动店铺', code: 'FORBIDDEN' })

    expect(
      evaluateMoveTarget({
        targetGroupId: 'g-target',
        sourceGroupId: 'g-src',
        group: activeGroup(),
        member: { ...activeMember(), status: 'removed' },
        targetShopCount: 0,
      }),
    ).toEqual({ ok: false, error: '请先加入目标清单再移动店铺', code: 'FORBIDDEN' })
  })

  it('目标清单店铺数达到上限时拒绝', () => {
    expect(
      evaluateMoveTarget({
        targetGroupId: 'g-target',
        sourceGroupId: 'g-src',
        group: activeGroup(),
        member: activeMember(),
        targetShopCount: MAX_SHOPS_PER_GROUP,
      }),
    ).toEqual({ ok: false, error: `目标清单已满（最多 ${MAX_SHOPS_PER_GROUP} 家）`, code: 'GROUP_FULL' })
  })

  it('目标清单合法时返回需要移动及目标成员视角', () => {
    const member = activeMember('member')
    expect(
      evaluateMoveTarget({
        targetGroupId: 'g-target',
        sourceGroupId: 'g-src',
        group: activeGroup(),
        member,
        targetShopCount: 0,
      }),
    ).toEqual({ ok: true, data: { needsMove: true, targetMember: member } })
  })
})

describe('shopApi resolveFolderGroupId', () => {
  it('移动店铺时城市归属校验目标清单', () => {
    expect(resolveFolderGroupId({ targetGroupId: 'g-target', sourceGroupId: 'g-src' })).toBe('g-target')
  })

  it('未移动（targetGroupId 为空或与来源相同）时校验来源清单', () => {
    expect(resolveFolderGroupId({ targetGroupId: '', sourceGroupId: 'g-src' })).toBe('g-src')
    expect(resolveFolderGroupId({ targetGroupId: 'g-src', sourceGroupId: 'g-src' })).toBe('g-src')
  })
})
