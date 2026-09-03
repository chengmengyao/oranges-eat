import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveMapGroup, isRecentPublicGroupAvailable } from '@/utils/map-group'
import type { GroupView } from '@/types/group'

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

describe('resolveMapGroup', () => {
  const ownGroup = group('group-own', 'public-own', '自己的清单')
  const sharedGroup = group('group-shared', 'public-shared', '受邀清单')

  it('邀请指定的清单优先于账号原来的当前清单', () => {
    expect(resolveMapGroup(
      [ownGroup, sharedGroup],
      ownGroup.id,
      sharedGroup.publicId,
      null,
    )).toEqual({ group: sharedGroup, publicId: sharedGroup.publicId, isMember: true })
  })

  it('非成员直接浏览邀请时仍使用邀请的公开清单', () => {
    const selection = resolveMapGroup(
      [ownGroup],
      ownGroup.id,
      'public-shared',
      { publicId: 'public-shared', name: '受邀清单' },
    )
    expect(selection.publicId).toBe('public-shared')
    expect(selection.group?.name).toBe('受邀清单')
    expect(selection.isMember).toBe(false)
  })

  it('账号没有任何清单时不会沿用旧账号的当前清单', () => {
    expect(resolveMapGroup([], ownGroup.id, '', null)).toEqual({
      group: null,
      publicId: '',
      isMember: false,
    })
  })

  it('没有成员清单时降级为最近访问的公开清单', () => {
    const selection = resolveMapGroup(
      [],
      ownGroup.id,
      '',
      { publicId: 'public-visited', name: '最近访问的清单' },
    )

    expect(selection.publicId).toBe('public-visited')
    expect(selection.group?.name).toBe('最近访问的清单')
    expect(selection.group?.id).toBe('')
    expect(selection.isMember).toBe(false)
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
