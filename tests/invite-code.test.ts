import { describe, expect, it, vi } from 'vitest'
import { ensurePersistentShortCode } from '../cloudfunctions/groupApi/invite-code'

describe('邀请二维码短码持久化', () => {
  it('已有短码时直接复用', async () => {
    const persist = vi.fn()
    await expect(
      ensurePersistentShortCode(
        { _id: 'invite-1', shortCode: 'rx2qhK7VpXDH' },
        () => 'new-code',
        persist,
      ),
    ).resolves.toBe('rx2qhK7VpXDH')
    expect(persist).not.toHaveBeenCalled()
  })

  it('历史邀请缺少短码时先保存再返回', async () => {
    const persist = vi.fn().mockResolvedValue(true)
    await expect(
      ensurePersistentShortCode(
        { _id: 'invite-1' },
        () => 'new-short-code',
        persist,
      ),
    ).resolves.toBe('new-short-code')
    expect(persist).toHaveBeenCalledWith('invite-1', 'new-short-code')
  })

  it('短码保存失败时拒绝继续生成二维码', async () => {
    await expect(
      ensurePersistentShortCode(
        { _id: 'invite-1' },
        () => 'dead-code',
        async () => false,
      ),
    ).rejects.toThrow('邀请短码保存失败')
  })
})
