import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveMapGroup, isRecentPublicGroupAvailable } from '@/utils/map-group'
import type { GroupView } from '@/types/group'
import type { GroupViewState } from '@/stores/group'

vi.mock('@/services/group', () => ({
  getPublicGroup: vi.fn(),
}))

import { getPublicGroup } from '@/services/group'

const mockedGetPublicGroup = vi.mocked(getPublicGroup)

function group(id: string, publicId: string, name: string): GroupView {
  return {
    id,
    publicId,
    name,
    role: 'member',
    updatedAt: new Date(0),
    isOwner: false,
  }
}

function member(groupId: string): GroupViewState {
  return { kind: 'member', groupId }
}

function pub(publicId: string): GroupViewState {
  return { kind: 'public', publicId }
}

describe('resolveMapGroup', () => {
  const ownGroup = group('group-own', 'public-own', '自己的清单')
  const sharedGroup = group('group-shared', 'public-shared', '受邀清单')

  it('成员视图命中当前成员清单', () => {
    expect(resolveMapGroup(
      [ownGroup, sharedGroup],
      member('group-shared'),
      null,
    )).toEqual({ group: sharedGroup, publicId: sharedGroup.publicId, isMember: true })
  })

  it('成员视图指向的清单已失效时回落到第一个成员清单', () => {
    expect(resolveMapGroup(
      [ownGroup, sharedGroup],
      member('group-gone'),
      null,
    )).toEqual({ group: ownGroup, publicId: ownGroup.publicId, isMember: true })
  })

  it('公开视图且清单仍可访问时，不会被账号的成员清单顶回', () => {
    const selection = resolveMapGroup(
      [ownGroup],
      pub('public-visited'),
      { publicId: 'public-visited', name: '最近访问的清单' },
    )
    expect(selection.publicId).toBe('public-visited')
    expect(selection.group?.name).toBe('最近访问的清单')
    expect(selection.group?.id).toBe('')
    expect(selection.isMember).toBe(false)
  })

  it('公开视图已失效（记录不匹配）时回落成员清单', () => {
    expect(resolveMapGroup(
      [ownGroup],
      pub('public-gone'),
      null,
    )).toEqual({ group: ownGroup, publicId: ownGroup.publicId, isMember: true })
  })

  it('账号没有任何成员清单时降级为最近访问的公开清单', () => {
    const selection = resolveMapGroup(
      [],
      member('group-own'),
      { publicId: 'public-visited', name: '最近访问的清单' },
    )

    expect(selection.publicId).toBe('public-visited')
    expect(selection.group?.name).toBe('最近访问的清单')
    expect(selection.group?.id).toBe('')
    expect(selection.isMember).toBe(false)
  })

  it('无成员清单且无最近公开清单时返回空', () => {
    expect(resolveMapGroup([], member(''), null)).toEqual({
      group: null,
      publicId: '',
      isMember: false,
    })
  })
})

describe('isRecentPublicGroupAvailable', () => {
  beforeEach(() => {
    mockedGetPublicGroup.mockReset()
  })

  it('清单仍可公开访问时返回 true', async () => {
    mockedGetPublicGroup.mockResolvedValue({
      publicId: 'public-ok',
      name: '有效的清单',
      memberCount: 2,
      inviteStatus: 'valid',
      alreadyMember: false,
    })
    await expect(
      isRecentPublicGroupAvailable({ publicId: 'public-ok', name: '有效的清单' }),
    ).resolves.toBe(true)
    expect(mockedGetPublicGroup).toHaveBeenCalledWith('public-ok')
  })

  it('清单已删除（不存在/不可访问）时返回 false', async () => {
    mockedGetPublicGroup.mockRejectedValue(new Error('清单不存在或不可访问'))
    await expect(
      isRecentPublicGroupAvailable({ publicId: 'public-gone', name: '已删除的清单' }),
    ).resolves.toBe(false)
  })

  it('网络等其他错误不能判定清单失效', async () => {
    mockedGetPublicGroup.mockRejectedValue(new Error('cloud.callFunction:fail timeout'))
    await expect(
      isRecentPublicGroupAvailable({ publicId: 'public-net', name: '网络波动' }),
    ).resolves.toBe(true)
  })
})
