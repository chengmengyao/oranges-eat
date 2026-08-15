const cloud = require('wx-server-sdk')
const crypto = require('crypto')
const { toPublicShopView, toPublicShopViewWithGroup, toShopView } = require('./dto')
const { SHOP_CATEGORIES, validateShopInput } = require('./shop-input')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const GROUPS = 'groups'
const MEMBERS = 'members'
const SHOPS = 'shops'

const MAX_SHOPS_PER_GROUP = 200
const MAX_PAGE_SIZE = 20
const MAX_REQUEST_ID_LENGTH = 64

const COLLECTION_NAMES = [GROUPS, MEMBERS, SHOPS]
let ensurePromise = null

async function ensureCollections() {
  if (ensurePromise) return ensurePromise
  ensurePromise = (async () => {
    await Promise.all(
      COLLECTION_NAMES.map(async (name) => {
        try {
          await db.createCollection(name)
        } catch (err) {
          // 集合已存在或创建失败均忽略
        }
      }),
    )
  })()
  return ensurePromise
}

// ---------- helpers ----------

function ok(data) {
  return { ok: true, data }
}

function fail(error, code = 'ERROR') {
  return { ok: false, error, code }
}

function normalizeText(value, maxLen) {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLen)
}

function memberId(groupId, openId) {
  return crypto.createHash('sha256').update(`${groupId}:${openId}`).digest('hex')
}

async function findMember(groupId, openId) {
  const res = await db
    .collection(MEMBERS)
    .where({ _id: memberId(groupId, openId), status: 'active' })
    .limit(1)
    .get()
  return res.data[0] || null
}

async function findGroupByPublicId(publicId) {
  const res = await db
    .collection(GROUPS)
    .where({ publicId, status: 'active' })
    .limit(1)
    .get()
  return res.data[0] || null
}

async function findGroupById(groupId) {
  const res = await db.collection(GROUPS).doc(groupId).get().catch(() => null)
  return res && res.data ? res.data : null
}

function isPublicReadableGroup(group) {
  return Boolean(group && group.visibility === 'public_read' && group.status === 'active')
}

function buildShopQuery(groupId, category) {
  const where = { groupId }
  if (category && category !== 'all' && SHOP_CATEGORIES.includes(category)) {
    where.category = category
  }
  return where
}

function parseCursor(cursor) {
  if (!cursor || typeof cursor !== 'string') return null
  try {
    return JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'))
  } catch {
    return null
  }
}

function buildCursor(item) {
  if (!item) return null
  return Buffer.from(
    JSON.stringify({ updatedAt: item.updatedAt, id: item._id }),
  ).toString('base64')
}

async function queryPagedShops(where, cursor, limit) {
  const capped = Math.min(Math.max(1, Number(limit) || MAX_PAGE_SIZE), MAX_PAGE_SIZE)
  const cursorData = parseCursor(cursor)

  let query = db.collection(SHOPS).where(where)

  if (cursorData) {
    const { updatedAt, id } = cursorData
    query = query.where({
      _and: [
        where,
        _.or([
          { updatedAt: _.lt(updatedAt) },
          { updatedAt: _.eq(updatedAt), _id: _.lt(id) },
        ]),
      ],
    })
  }

  const res = await query
    .orderBy('updatedAt', 'desc')
    .orderBy('_id', 'desc')
    .limit(capped + 1)
    .get()

  const items = res.data.slice(0, capped)
  const hasMore = res.data.length > capped
  const nextCursor = hasMore ? buildCursor(items[items.length - 1]) : null
  return { shops: items, hasMore, nextCursor }
}

// ---------- actions ----------

async function listPublicShops(event) {
  const publicId = normalizeText(event.publicId, 64)
  if (!publicId) return fail('参数不完整', 'INVALID_PARAM')
  const group = await findGroupByPublicId(publicId)
  if (!isPublicReadableGroup(group)) {
    return fail('清单不存在或不可访问', 'GROUP_NOT_FOUND')
  }
  const category = normalizeText(event.category, 20)
  const where = buildShopQuery(group._id, category)
  const result = await queryPagedShops(where, event.cursor, event.limit)
  return ok({
    shops: result.shops.map(toPublicShopView),
    hasMore: result.hasMore,
    nextCursor: result.nextCursor,
  })
}

async function listPublicMapShops(event) {
  const publicId = normalizeText(event.publicId, 64)
  if (!publicId) return fail('参数不完整', 'INVALID_PARAM')
  const group = await findGroupByPublicId(publicId)
  if (!isPublicReadableGroup(group)) {
    return fail('清单不存在或不可访问', 'GROUP_NOT_FOUND')
  }
  const where = { groupId: group._id }
  const res = await db
    .collection(SHOPS)
    .where(where)
    .orderBy('updatedAt', 'desc')
    .limit(MAX_SHOPS_PER_GROUP)
    .get()
  return ok(res.data.map(toPublicShopView))
}

async function listAllPublicMapShops() {
  const groupRes = await db
    .collection(GROUPS)
    .where({ visibility: 'public_read', status: 'active' })
    .orderBy('updatedAt', 'desc')
    .limit(100)
    .get()
  const groups = groupRes.data
  const all = []
  for (const group of groups) {
    const res = await db
      .collection(SHOPS)
      .where({ groupId: group._id })
      .orderBy('updatedAt', 'desc')
      .limit(MAX_SHOPS_PER_GROUP)
      .get()
    for (const shop of res.data) {
      all.push(toPublicShopViewWithGroup(shop, group))
    }
  }
  return ok(all)
}

async function listMemberShops(event, openId) {
  const groupId = normalizeText(event.groupId, 64)
  if (!groupId) return fail('参数不完整', 'INVALID_PARAM')
  const member = await findMember(groupId, openId)
  if (!member) return fail('未加入该清单', 'FORBIDDEN')
  const category = normalizeText(event.category, 20)
  const where = buildShopQuery(groupId, category)
  const result = await queryPagedShops(where, event.cursor, event.limit)
  return ok({
    shops: result.shops.map((s) => toShopView(s, member)),
    hasMore: result.hasMore,
    nextCursor: result.nextCursor,
  })
}

async function createShop(event, openId) {
  const groupId = normalizeText(event.groupId, 64)
  if (!groupId) return fail('参数不完整', 'INVALID_PARAM')

  const member = await findMember(groupId, openId)
  if (!member) return fail('请先加入清单再添加店铺', 'FORBIDDEN')

  const group = await findGroupById(groupId)
  if (!isPublicReadableGroup(group)) return fail('清单不存在或不可访问', 'GROUP_NOT_FOUND')

  const validation = validateShopInput(event)
  if (!validation.ok) return validation
  const input = validation.data

  // 幂等：同一请求 ID 不重复写入
  const requestId = normalizeText(event.requestId, MAX_REQUEST_ID_LENGTH)
  if (requestId) {
    const dup = await db
      .collection(SHOPS)
      .where({ groupId, requestId })
      .limit(1)
      .get()
    if (dup.data.length > 0) {
      return ok(toShopView(dup.data[0], member))
    }
  }

  const countRes = await db.collection(SHOPS).where({ groupId }).count()
  if (countRes.total >= MAX_SHOPS_PER_GROUP) {
    return fail(`当前清单已满（最多 ${MAX_SHOPS_PER_GROUP} 家）`, 'GROUP_FULL')
  }

  const now = Date.now()
  const shopDoc = {
    groupId,
    requestId: requestId || null,
    name: input.name,
    category: input.category,
    latitude: input.latitude,
    longitude: input.longitude,
    address: input.address,
    remark: input.remark,
    createdByOpenId: openId,
    createdByName: member.displayName,
    updatedByOpenId: openId,
    createdAt: now,
    updatedAt: now,
  }

  const res = await db.collection(SHOPS).add({ data: shopDoc })
  const created = { ...shopDoc, _id: res._id }
  return ok(toShopView(created, member))
}

async function updateShop(event, openId) {
  const groupId = normalizeText(event.groupId, 64)
  const shopId = normalizeText(event.shopId, 64)
  if (!groupId || !shopId) return fail('参数不完整', 'INVALID_PARAM')

  const member = await findMember(groupId, openId)
  if (!member) return fail('请先加入清单', 'FORBIDDEN')

  const shopRes = await db.collection(SHOPS).doc(shopId).get().catch(() => null)
  if (!shopRes || !shopRes.data || shopRes.data.groupId !== groupId) {
    return fail('店铺不存在', 'SHOP_NOT_FOUND')
  }
  const shop = shopRes.data

  const isOwner = member.role === 'owner'
  const isMine = shop.createdByOpenId === openId
  if (!isOwner && !isMine) {
    return fail('只能编辑自己添加的店铺', 'FORBIDDEN')
  }

  const validation = validateShopInput(event)
  if (!validation.ok) return validation
  const input = validation.data

  // 乐观并发
  const expectedUpdatedAt = Number(event.expectedUpdatedAt)
  if (!Number.isFinite(expectedUpdatedAt)) {
    return fail('数据已变化，请刷新后重试', 'CONFLICT')
  }
  const now = Date.now()
  const updateRes = await db
    .collection(SHOPS)
    .where({
      _id: shopId,
      groupId,
      updatedAt: _.eq(expectedUpdatedAt),
    })
    .update({
      data: {
        name: input.name,
        category: input.category,
        latitude: input.latitude,
        longitude: input.longitude,
        address: input.address,
        remark: input.remark,
        updatedByOpenId: openId,
        updatedAt: now,
      },
    })
  if (!updateRes.stats || updateRes.stats.updated !== 1) {
    return fail('店铺已被其他成员更新，请刷新后重新编辑', 'CONFLICT')
  }
  const updated = { ...shop, ...input, updatedByOpenId: openId, updatedAt: now }
  return ok(toShopView(updated, member))
}

async function deleteShop(event, openId) {
  const groupId = normalizeText(event.groupId, 64)
  const shopId = normalizeText(event.shopId, 64)
  if (!groupId || !shopId) return fail('参数不完整', 'INVALID_PARAM')

  const member = await findMember(groupId, openId)
  if (!member) return fail('请先加入清单', 'FORBIDDEN')

  const shopRes = await db.collection(SHOPS).doc(shopId).get().catch(() => null)
  if (!shopRes || !shopRes.data || shopRes.data.groupId !== groupId) {
    return fail('店铺不存在', 'SHOP_NOT_FOUND')
  }
  const shop = shopRes.data

  const isOwner = member.role === 'owner'
  const isMine = shop.createdByOpenId === openId
  if (!isOwner && !isMine) {
    return fail('只能删除自己添加的店铺', 'FORBIDDEN')
  }

  await db.collection(SHOPS).doc(shopId).remove()
  return ok({ deleted: true })
}

// ---------- router ----------

const actions = {
  listPublicShops,
  listPublicMapShops,
  listAllPublicMapShops,
  listMemberShops,
  createShop,
  updateShop,
  deleteShop,
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext()
  const action = event.action
  const handler = actions[action]
  if (!handler) {
    return fail('未知操作', 'UNKNOWN_ACTION')
  }
  try {
    await ensureCollections()
    return await handler(event, OPENID)
  } catch (err) {
    console.error(`shopApi.${action} error`, err && err.message ? err.message : '[REDACTED]')
    return fail('服务异常，请重试', 'INTERNAL')
  }
}
