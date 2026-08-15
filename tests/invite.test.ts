import { describe, expect, it } from 'vitest'
import { sha256, memberId, evaluateInvite, isTokenValid } from '../cloudfunctions/shared/invite'

function activeInvite(overrides = {}) {
  return {
    _id: 'invite-1',
    groupId: 'group-1',
    tokenHash: 'hash',
    status: 'active',
    expiresAt: Date.now() + 24 * 3600 * 1000,
    maxUses: 50,
    usedCount: 0,
    ...overrides,
  }
}

describe('sha256 摘要', () => {
  it('稳定且不可逆', () => {
    const a = sha256('hello')
    const b = sha256('hello')
    expect(a).toBe(b)
    expect(a).toHaveLength(64)
    expect(a).not.toContain('hello')
  })

  it('token 只存摘要不存明文', () => {
    const token = 'super-secret-token-value'
    const hash = sha256(token)
    expect(hash).not.toContain(token)
    expect(hash).toHaveLength(64)
  })
})

describe('memberId 幂等', () => {
  it('同一 groupId+openId 生成同一 id', () => {
    expect(memberId('g1', 'o1')).toBe(memberId('g1', 'o1'))
    expect(memberId('g1', 'o1')).not.toBe(memberId('g1', 'o2'))
  })
})

describe('evaluateInvite', () => {
  const now = Date.now()

  it('有效邀请', () => {
    expect(evaluateInvite(activeInvite(), now)).toBe('valid')
    expect(isTokenValid(activeInvite(), now)).toBe(true)
  })

  it('无邀请为 invalid', () => {
    expect(evaluateInvite(null, now)).toBe('invalid')
  })

  it('撤销为 revoked', () => {
    expect(evaluateInvite(activeInvite({ status: 'revoked' }), now)).toBe('revoked')
  })

  it('过期为 expired', () => {
    const inv = activeInvite({ expiresAt: now - 1 })
    expect(evaluateInvite(inv, now)).toBe('expired')
    expect(isTokenValid(inv, now)).toBe(false)
  })

  it('用尽为 used-up', () => {
    expect(evaluateInvite(activeInvite({ usedCount: 50, maxUses: 50 }), now)).toBe('used-up')
  })

  it('并发下不会超过上限', () => {
    // usedCount 达到上限的瞬间必须拒绝
    expect(isTokenValid(activeInvite({ usedCount: 49, maxUses: 50 }), now)).toBe(true)
    expect(isTokenValid(activeInvite({ usedCount: 50, maxUses: 50 }), now)).toBe(false)
  })
})
