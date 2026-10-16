const crypto = require('crypto')

/**
 * 城市共享清单 ID：一个「分享者 + 城市」只对应一份共享清单，所有领取人共用。
 * 领取人不再参与 ID 计算，避免同一城市被分享给多人时反复建出同名清单。
 */
function cityShareGroupId(ownerOpenId, cityCode) {
  if (!ownerOpenId || !cityCode) return ''
  return crypto
    .createHash('sha256')
    .update(`cityshare-group:${ownerOpenId}:${cityCode}`)
    .digest('hex')
    .slice(0, 32)
}

/**
 * 店铺的物理身份键：名称 + 经纬度。用于复制/聚合时识别同一家店，
 * 只有完全相同的店铺才视为重复（坐标相同说明是同一地点）。
 */
function shopIdentityKey(shop) {
  if (!shop) return ''
  const name = typeof shop.name === 'string' ? shop.name.trim() : ''
  return `${name}|${Number(shop.latitude)}|${Number(shop.longitude)}`
}

/**
 * 复制城市店铺前去重：分享者的店铺可能因历史原因在多个清单中重复，
 * 复制时必须折叠为一份，否则每分享一次都会指数级放大重复数据。
 */
function dedupeShopsForCopy(records) {
  const seen = new Set()
  const result = []
  for (const shop of records || []) {
    const key = shopIdentityKey(shop)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(shop)
  }
  return result
}

module.exports = { cityShareGroupId, shopIdentityKey, dedupeShopsForCopy }
