async function ensurePersistentShortCode(invite, generateShortCode, persistShortCode) {
  if (invite && invite.shortCode) return invite.shortCode
  if (!invite || !invite._id) throw new Error('邀请记录无效')

  const shortCode = generateShortCode()
  const persisted = await persistShortCode(invite._id, shortCode)
  if (!persisted) throw new Error('邀请短码保存失败')
  return shortCode
}

module.exports = { ensurePersistentShortCode }
