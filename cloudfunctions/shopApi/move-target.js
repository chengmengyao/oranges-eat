/**
 * 店铺移动到目标清单的校验纯逻辑（与云函数共用，可被单元测试直接引用）。
 * 只做「目标清单是否可接收该店铺」的判定，不触碰数据库。
 */
const MAX_SHOPS_PER_GROUP = 1000

function ok(data) {
  return { ok: true, data }
}

function fail(error, code = 'INVALID_PARAM') {
  return { ok: false, error, code }
}

/**
 * @param {object} params
 * @param {string} params.targetGroupId   前端传入的目标清单 id（已归一化）
 * @param {string} params.sourceGroupId   店铺当前所属清单 id
 * @param {object|null} params.group      目标清单文档（groups 集合）
 * @param {object|null} params.member     当前用户在目标清单的成员记录
 * @param {number} params.targetShopCount 目标清单当前店铺数
 */
function evaluateMoveTarget({
  targetGroupId,
  sourceGroupId,
  group,
  member,
  targetShopCount,
}) {
  if (!targetGroupId) return ok({ needsMove: false })
  if (targetGroupId === sourceGroupId) return ok({ needsMove: false })
  if (!group || group.status !== 'active' || group.visibility !== 'public_read') {
    return fail('目标清单不存在或不可访问', 'GROUP_NOT_FOUND')
  }
  if (!member || member.status !== 'active') {
    return fail('请先加入目标清单再移动店铺', 'FORBIDDEN')
  }
  if (Number(targetShopCount) >= MAX_SHOPS_PER_GROUP) {
    return fail(`目标清单已满（最多 ${MAX_SHOPS_PER_GROUP} 家）`, 'GROUP_FULL')
  }
  return ok({ needsMove: true, targetMember: member })
}

/**
 * 店铺编辑/移动时，城市归属应校验的清单 id：
 * 移动（targetGroupId 非空且与来源不同）→ 目标清单，否则 → 来源清单。
 * @param {object} params
 * @param {string} params.targetGroupId 前端传入的目标清单 id（已归一化）
 * @param {string} params.sourceGroupId 店铺当前所属清单 id
 * @returns {string}
 */
function resolveFolderGroupId({ targetGroupId, sourceGroupId }) {
  if (targetGroupId && targetGroupId !== sourceGroupId) return targetGroupId
  return sourceGroupId
}

module.exports = {
  MAX_SHOPS_PER_GROUP,
  evaluateMoveTarget,
  resolveFolderGroupId,
}
