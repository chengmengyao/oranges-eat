import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/utils/cloud', () => ({
  callFunction: vi.fn(),
}))

import { callFunction } from '@/utils/cloud'
import { createGroup, updateMyDisplayName } from '@/services/group'

describe('group service 名称参数', () => {
  beforeEach(() => {
    vi.mocked(callFunction).mockReset()
  })

  it('创建清单时分开传递清单名称和成员名称', async () => {
    vi.mocked(callFunction).mockResolvedValue({ group: { id: 'group-1' } })

    await createGroup('周末探店', '小橙')

    expect(callFunction).toHaveBeenCalledWith('groupApi', {
      action: 'createGroup',
      groupName: '周末探店',
      displayName: '小橙',
    })
  })

  it('修改名称时只传递当前清单和新名称', async () => {
    vi.mocked(callFunction).mockResolvedValue({ displayName: '橙子酱', updatedShops: 2 })

    await updateMyDisplayName('group-1', '橙子酱')

    expect(callFunction).toHaveBeenCalledWith('groupApi', {
      action: 'updateMyDisplayName',
      groupId: 'group-1',
      displayName: '橙子酱',
    })
  })
})
