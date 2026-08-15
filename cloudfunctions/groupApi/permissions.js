/**
 * 权限矩阵纯逻辑（与云函数共用，可被单元测试直接引用）
 * 调用者身份一律来自 cloud.getWXContext().OPENID，客户端传入不可信。
 */

// 操作结果
const PERM = {
  ALLOW: 'allow',
  DENY: 'deny',
}

function resolveRole(member) {
  if (!member) return 'visitor'
  if (member.role === 'owner') return 'owner'
  return 'member'
}

// 访问类别：list 成员列表/邀请/管理；write 店铺写操作
function roleCan(action, role) {
  switch (action) {
    case 'viewPublic':
      return true
    case 'viewMembers':
      return role === 'owner' || role === 'member'
    case 'createInvite':
    case 'revokeInvite':
    case 'renameGroup':
    case 'removeMember':
      return role === 'owner'
    case 'createShop':
    case 'updateOwnShop':
    case 'deleteOwnShop':
      return role === 'owner' || role === 'member'
    case 'updateAnyShop':
    case 'deleteAnyShop':
      return role === 'owner'
    default:
      return false
  }
}

// 店铺写权限：创建者/普通成员只能改删自己添加的店，owner 可管理全部
function canWriteShop(member, shop, action) {
  const role = resolveRole(member)
  const isOwner = role === 'owner'
  const isMine = Boolean(member && shop && shop.createdByOpenId === member.userOpenId)

  if (action === 'updateAnyShop' || action === 'deleteAnyShop') {
    return roleCan('updateAnyShop', role)
  }
  if (action === 'updateOwnShop' || action === 'deleteOwnShop') {
    return isMine && roleCan(action, role)
  }
  if (action === 'updateShop' || action === 'deleteShop') {
    return isOwner || isMine
  }
  return false
}

module.exports = {
  PERM,
  resolveRole,
  roleCan,
  canWriteShop,
}
