import { describe, expect, it } from 'vitest'
import { resolveMapGroup } from '@/utils/map-group'
import type { GroupView } from '@/types/group'

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
})
