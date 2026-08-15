/**
 * 邀请 token 纯逻辑（与云函数共用，可被单元测试直接引用）
 * 数据库只保存 SHA-256 摘要；token 状态评估与幂等规则。
 */
const crypto = require('crypto')

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex')
}

function memberId(groupId, openId) {
  return sha256(`${groupId}:${openId}`)
}

function evaluateInvite(invite, now = Date.now()) {
  if (!invite) return 'invalid'
  if (invite.status !== 'active') return 'revoked'
  if (now > invite.expiresAt) return 'expired'
  if (invite.usedCount >= invite.maxUses) return 'used-up'
  return 'valid'
}

function isTokenValid(invite, now = Date.now()) {
  return evaluateInvite(invite, now) === 'valid'
}

module.exports = {
  sha256,
  memberId,
  evaluateInvite,
  isTokenValid,
}
