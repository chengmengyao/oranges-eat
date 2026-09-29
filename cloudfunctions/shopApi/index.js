const cloud = require('wx-server-sdk')
const crypto = require('crypto')
const { toPublicShopView, toShopView } = require('./dto')
const { SHOP_CATEGORIES, validateShopInput } = require('./shop-input')
const { shopRequestDocumentId } = require('./shop-request')
const { MAX_SHOPS_PER_GROUP, evaluateMoveTarget, resolveFolderGroupId } = require('./move-target')
const { cityCodeFromName, cityIdentity } = require('./city')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const GROUPS = 'groups'
const MEMBERS = 'members'
const SHOPS = 'shops'
const FOLDERS = 'folders'
const CITY_SHOPS = 'cityShops'
const CITY_SHARES = 'cityShares'
const CITY_SHARE_ACCEPTS = 'cityShareAccepts'

const MAX_PAGE_SIZE = 20
const MAX_REQUEST_ID_LENGTH = 64
const MAX_CITY_MAP_SHOPS = 500

const COLLECTION_NAMES = [GROUPS, MEMBERS, SHOPS, FOLDERS, CITY_SHOPS, CITY_SHARES, CITY_SHARE_ACCEPTS]
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

function isActiveGroup(group) {
  return Boolean(group && group.status === 'active')
}

function buildShopQuery(groupId, category, folderId) {
  const where = { groupId }
  if (category && category !== 'all' && SHOP_CATEGORIES.includes(category)) {
    where.category = category
  }
  if (folderId === 'none') {
    where.folderId = _.eq(null)
  } else if (folderId && folderId !== 'all') {
    where.folderId = folderId
  }
  return where
}

function cityShopView(shop) {
  return {
    id: shop._id,
    folderId: null,
    cityCode: shop.cityCode,
    cityName: shop.cityName,
    name: shop.name,
    category: shop.category,
    latitude: shop.latitude,
    longitude: shop.longitude,
    address: shop.address,
    remark: shop.remark || '',
    creatorName: '我',
    isMine: true,
    canEdit: true,
    canDelete: true,
    createdAt: shop.createdAt,
    updatedAt: shop.updatedAt,
  }
}

function cityShopId(openId, requestId) {
  if (!requestId) return ''
  return crypto.createHash('sha256').update(`city:${openId}:${requestId}`).digest('hex')
}

function randomToken() {
  return crypto.randomBytes(32).toString('hex')
}

function cityShopPublicView(shop) {
  return {
    id: shop._id,
    folderId: null,
    cityCode: shop.cityCode,
    cityName: shop.cityName,
    name: shop.name,
    category: shop.category,
    latitude: shop.latitude,
    longitude: shop.longitude,
    address: shop.address,
    remark: shop.remark || '',
    createdAt: shop.createdAt,
    updatedAt: shop.updatedAt,
  }
}

async function findFolderById(folderId) {
  const res = await db.collection(FOLDERS).doc(folderId).get().catch(() => null)
  return res && res.data ? res.data : null
}

async function validateFolderOwnership(groupId, folderId) {
  if (!folderId) return null
  if (folderId === 'all' || folderId === 'none') return null
  const folder = await findFolderById(folderId)
  if (!folder || folder.groupId !== groupId) {
    return { ok: false, error: '所选城市不存在或不属于该清单', code: 'FOLDER_NOT_FOUND' }
  }
  return null
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length)
  let cursor = 0
  async function worker() {
    for (;;) {
      const index = cursor++
      if (index >= items.length) return
      results[index] = await mapper(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()))
  return results
}

async function loadMyCityContext(openId) {
  const memberRes = await db
    .collection(MEMBERS)
    .where({ userOpenId: openId, status: 'active' })
    .limit(100)
    .get()
  const members = memberRes.data
  if (members.length === 0) {
    return { groups: [], membersByGroup: new Map(), foldersById: new Map(), shops: [] }
  }

  const loaded = await mapWithConcurrency(members, 6, async (member) => {
    const [groupRes, folderRes, shopRes] = await Promise.all([
      db.collection(GROUPS).doc(member.groupId).get().catch(() => null),
      db.collection(FOLDERS).where({ groupId: member.groupId }).limit(200).get(),
      db.collection(SHOPS).where({ groupId: member.groupId }).limit(MAX_SHOPS_PER_GROUP).get(),
    ])
    const group = groupRes && groupRes.data ? groupRes.data : null
    // 这里已经通过 members 集合确认了当前用户是有效成员，成员视图不应再受
    // visibility 字段限制。历史清单可能没有 public_read 标记，但成员仍应能看到。
    if (!isActiveGroup(group)) return null
    return { group, member, folders: folderRes.data, shops: shopRes.data }
  })

  const groups = []
  const membersByGroup = new Map()
  const foldersById = new Map()
  const shops = []
  for (const item of loaded) {
    if (!item) continue
    groups.push(item.group)
    membersByGroup.set(item.group._id, item.member)
    item.folders.forEach((folder) => foldersById.set(folder._id, folder))
    shops.push(...item.shops)
  }
  return { groups, membersByGroup, foldersById, shops }
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
  const folderId = normalizeText(event.folderId, 64)
  const where = buildShopQuery(group._id, category, folderId)
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
  const folderId = normalizeText(event.folderId, 64)
  const where = buildShopQuery(group._id, undefined, folderId)
  const res = await db
    .collection(SHOPS)
    .where(where)
    .orderBy('updatedAt', 'desc')
    .limit(MAX_SHOPS_PER_GROUP)
    .get()
  return ok(res.data.map(toPublicShopView))
}

async function listMemberMapShops(event, openId) {
  const groupId = normalizeText(event.groupId, 64)
  if (!groupId) return fail('参数不完整', 'INVALID_PARAM')
  const member = await findMember(groupId, openId)
  if (!member) return fail('未加入该清单', 'FORBIDDEN')
  const res = await db
    .collection(SHOPS)
    .where(buildShopQuery(groupId))
    .orderBy('updatedAt', 'desc')
    .limit(MAX_SHOPS_PER_GROUP)
    .get()
  return ok(res.data.map((s) => toShopView(s, member)))
}

async function listMyCities(event, openId) {
  const context = await loadMyCityContext(openId)
  const cityMap = new Map()

  // 先收集所有城市子清单，即使该城市暂时还没有店铺，也应在城市选择器中出现。
  for (const folder of context.foldersById.values()) {
    const identity = cityIdentity(folder)
    if (!identity) continue
    let item = cityMap.get(identity.cityCode)
    if (!item) {
      item = {
        cityCode: identity.cityCode,
        cityName: identity.cityName,
        shopCount: 0,
        groupIds: new Set(),
      }
      cityMap.set(identity.cityCode, item)
    }
    item.groupIds.add(folder.groupId)
  }

  for (const shop of context.shops) {
    const folder = context.foldersById.get(shop.folderId)
    if (!folder || folder.groupId !== shop.groupId) continue
    const identity = cityIdentity(folder)
    if (!identity) continue
    let item = cityMap.get(identity.cityCode)
    if (!item) continue
    item.shopCount += 1
    item.groupIds.add(shop.groupId)
  }

  const ownCityShops = await db.collection(CITY_SHOPS).where({ ownerOpenId: openId }).limit(MAX_CITY_MAP_SHOPS).get()
  for (const shop of ownCityShops.data) {
    const cityCode = cityCodeFromName(shop.cityCode || shop.cityName)
    if (!cityCode) continue
    let item = cityMap.get(cityCode)
    if (!item) {
      item = { cityCode, cityName: shop.cityName || cityCode, shopCount: 0, groupIds: new Set() }
      cityMap.set(cityCode, item)
    }
    item.shopCount += 1
  }
  const cities = Array.from(cityMap.values())
    .map((item) => ({
      cityCode: item.cityCode,
      cityName: item.cityName,
      shopCount: item.shopCount,
      groupCount: item.groupIds.size,
    }))
    .sort((a, b) => b.shopCount - a.shopCount || a.cityName.localeCompare(b.cityName, 'zh-CN'))
  return ok(cities)
}

async function listMyCityMapShops(event, openId) {
  const requestedCode = cityCodeFromName(normalizeText(event.cityCode, 64))
  if (!requestedCode) return fail('请选择城市', 'INVALID_PARAM')
  const context = await loadMyCityContext(openId)
  const groupMap = new Map(context.groups.map((group) => [group._id, group]))
  const result = []
  for (const shop of context.shops) {
    const folder = context.foldersById.get(shop.folderId)
    if (!folder || folder.groupId !== shop.groupId) continue
    const identity = cityIdentity(folder)
    if (!identity || identity.cityCode !== requestedCode) continue
    const group = groupMap.get(shop.groupId)
    const member = context.membersByGroup.get(shop.groupId)
    if (!group || !member) continue
    result.push({
      ...toShopView(
        { ...shop, cityCode: identity.cityCode, cityName: identity.cityName },
        member,
      ),
      cityCode: identity.cityCode,
      cityName: identity.cityName,
      sourceGroupId: group._id,
      sourceGroupName: group.name,
      sourcePublicId: group.publicId,
    })
  }
  const ownCityShops = await db.collection(CITY_SHOPS)
    .where({ ownerOpenId: openId, cityCode: requestedCode })
    .limit(MAX_CITY_MAP_SHOPS)
    .get()
  ownCityShops.data.forEach((shop) => {
    result.push({
      ...cityShopView(shop),
      cityCode: requestedCode,
      cityName: shop.cityName || requestedCode,
      sourceGroupId: '',
      sourceGroupName: '城市店铺',
      sourcePublicId: '',
    })
  })
  result.sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt))
  return ok(result.slice(0, MAX_CITY_MAP_SHOPS))
}

async function collectShareableCityShops(ownerOpenId, cityCode) {
  const context = await loadMyCityContext(ownerOpenId)
  const result = []
  for (const shop of context.shops) {
    const folder = context.foldersById.get(shop.folderId)
    if (!folder || folder.groupId !== shop.groupId) continue
    const identity = cityIdentity(folder)
    if (!identity || identity.cityCode !== cityCode) continue
    result.push(cityShopPublicView({
      ...shop,
      cityCode: identity.cityCode,
      cityName: identity.cityName,
    }))
  }
  const ownCityShops = await db.collection(CITY_SHOPS)
    .where({ ownerOpenId, cityCode })
    .limit(MAX_CITY_MAP_SHOPS)
    .get()
  result.push(...ownCityShops.data.map(cityShopPublicView))
  result.sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt))
  return result.slice(0, MAX_CITY_MAP_SHOPS)
}

async function collectShareableCityShopRecords(ownerOpenId, cityCode) {
  const context = await loadMyCityContext(ownerOpenId)
  const result = []
  for (const shop of context.shops) {
    const folder = context.foldersById.get(shop.folderId)
    if (!folder || folder.groupId !== shop.groupId) continue
    const identity = cityIdentity(folder)
    if (!identity || identity.cityCode !== cityCode) continue
    result.push({ ...shop, cityCode: identity.cityCode, cityName: identity.cityName })
  }
  const ownCityShops = await db.collection(CITY_SHOPS)
    .where({ ownerOpenId, cityCode })
    .limit(MAX_CITY_MAP_SHOPS)
    .get()
  result.push(...ownCityShops.data)
  result.sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt))
  return result.slice(0, MAX_CITY_MAP_SHOPS)
}

async function acceptCityShare(event, openId) {
  const token = normalizeText(event.token, 128)
  const code = normalizeText(event.code, 64)
  const displayName = normalizeText(event.displayName, 20) || '朋友'
  const share = await findCityShare(token, code)
  if (!share || Number(share.expiresAt) < Date.now()) return fail('分享链接已失效', 'SHARE_INVALID')

  const existingAccept = await db.collection(CITY_SHARE_ACCEPTS)
    .where({ shareId: share._id, recipientOpenId: openId, status: 'active' })
    .limit(1)
    .get()
  if (existingAccept.data[0]) {
    const existingGroup = await findGroupById(existingAccept.data[0].groupId)
    if (existingGroup) return ok({ groupId: existingGroup._id, publicId: existingGroup.publicId, name: existingGroup.name, duplicated: true })
  }

  const now = Date.now()
  const groupName = `${share.cityName}共享清单`.slice(0, 30)
  const groupDoc = {
    publicId: randomToken().slice(0, 32),
    name: groupName,
    ownerOpenId: share.ownerOpenId,
    visibility: 'public_read',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  }
  const groupRes = await db.collection(GROUPS).add({ data: groupDoc })
  const groupId = groupRes._id
  const folderRes = await db.collection(FOLDERS).add({
    data: {
      groupId,
      name: share.cityName,
      cityCode: share.cityCode,
      cityName: share.cityName,
      sortOrder: 0,
      createdByOpenId: share.ownerOpenId,
      createdAt: now,
      updatedAt: now,
    },
  })
  const memberDocs = [
    {
      _id: memberId(groupId, share.ownerOpenId),
      groupId,
      userOpenId: share.ownerOpenId,
      displayName: '分享者',
      role: 'owner',
      allowDelete: true,
      status: 'active',
      joinedAt: now,
      updatedAt: now,
    },
  ]
  // 分享者本人扫码时 openId 与 owner 相同，memberId 会重复导致 add 失败并留下孤儿清单，需去重。
  if (openId !== share.ownerOpenId) {
    memberDocs.push({
      _id: memberId(groupId, openId),
      groupId,
      userOpenId: openId,
      displayName,
      role: 'member',
      allowDelete: false,
      status: 'active',
      joinedAt: now,
      updatedAt: now,
    })
  }
  await Promise.all(memberDocs.map((data) => db.collection(MEMBERS).add({ data })))

  const sourceShops = await collectShareableCityShopRecords(share.ownerOpenId, share.cityCode)
  await Promise.all(sourceShops.map((shop) => db.collection(SHOPS).add({
    data: {
      groupId,
      folderId: folderRes._id,
      cityCode: share.cityCode,
      cityName: share.cityName,
      requestId: null,
      name: shop.name,
      category: shop.category,
      latitude: shop.latitude,
      longitude: shop.longitude,
      address: shop.address,
      remark: shop.remark || '',
      createdByOpenId: share.ownerOpenId,
      createdByName: '分享者',
      updatedByOpenId: share.ownerOpenId,
      createdAt: shop.createdAt || now,
      updatedAt: shop.updatedAt || now,
    },
  })))
  await db.collection(CITY_SHARE_ACCEPTS).add({
    data: { shareId: share._id, groupId, recipientOpenId: openId, status: 'active', createdAt: now },
  })
  return ok({ groupId, publicId: groupDoc.publicId, name: groupName, duplicated: false })
}

async function listMyCityShops(event, openId) {
  const cityCode = cityCodeFromName(normalizeText(event.cityCode, 64))
  if (!cityCode) return fail('请选择城市', 'INVALID_PARAM')
  const category = normalizeText(event.category, 20)
  const query = { ownerOpenId: openId, cityCode }
  if (category && category !== 'all' && SHOP_CATEGORIES.includes(category)) {
    query.category = category
  }
  const res = await db
    .collection(CITY_SHOPS)
    .where(query)
    .orderBy('updatedAt', 'desc')
    .limit(MAX_CITY_MAP_SHOPS)
    .get()
  return ok(res.data.map(cityShopView))
}

async function createCityShop(event, openId) {
  const cityCode = cityCodeFromName(normalizeText(event.cityCode || event.cityName, 64))
  const cityName = normalizeText(event.cityName, 64) || cityCode
  if (!cityCode) return fail('请选择城市', 'INVALID_PARAM')
  const validation = validateShopInput({ ...event, folderId: null })
  if (!validation.ok) return validation
  const input = validation.data
  const requestId = normalizeText(event.requestId, MAX_REQUEST_ID_LENGTH)
  if (requestId) {
    const dup = await db.collection(CITY_SHOPS).where({ ownerOpenId: openId, requestId }).limit(1).get()
    if (dup.data.length > 0) return ok(cityShopView(dup.data[0]))
  }
  const countRes = await db.collection(CITY_SHOPS).where({ ownerOpenId: openId }).count()
  if (countRes.total >= MAX_CITY_MAP_SHOPS) {
    return fail(`城市店铺已满（最多 ${MAX_CITY_MAP_SHOPS} 家）`, 'CITY_FULL')
  }
  const now = Date.now()
  const shopDoc = {
    ownerOpenId: openId,
    cityCode,
    cityName,
    requestId: requestId || null,
    name: input.name,
    category: input.category,
    latitude: input.latitude,
    longitude: input.longitude,
    address: input.address,
    remark: input.remark,
    createdAt: now,
    updatedAt: now,
  }
  const deterministicId = cityShopId(openId, requestId)
  try {
    const data = deterministicId ? { ...shopDoc, _id: deterministicId } : shopDoc
    const res = await db.collection(CITY_SHOPS).add({ data })
    return ok(cityShopView({ ...shopDoc, _id: deterministicId || res._id }))
  } catch (err) {
    if (deterministicId) {
      const existing = await db.collection(CITY_SHOPS).doc(deterministicId).get().catch(() => null)
      if (existing && existing.data && existing.data.ownerOpenId === openId) {
        return ok(cityShopView(existing.data))
      }
    }
    throw err
  }
}

async function updateCityShop(event, openId) {
  const shopId = normalizeText(event.shopId, 64)
  if (!shopId) return fail('参数不完整', 'INVALID_PARAM')
  const existing = await db.collection(CITY_SHOPS).doc(shopId).get().catch(() => null)
  if (!existing || !existing.data || existing.data.ownerOpenId !== openId) {
    return fail('城市店铺不存在', 'SHOP_NOT_FOUND')
  }
  const validation = validateShopInput({ ...event, folderId: null })
  if (!validation.ok) return validation
  const expectedUpdatedAt = Number(event.expectedUpdatedAt)
  if (!Number.isFinite(expectedUpdatedAt)) return fail('数据已变化，请刷新后重试', 'CONFLICT')
  const now = Date.now()
  const updateRes = await db.collection(CITY_SHOPS).where({
    _id: shopId,
    ownerOpenId: openId,
    updatedAt: _.eq(expectedUpdatedAt),
  }).update({
    data: { ...validation.data, updatedAt: now },
  })
  if (!updateRes.stats || updateRes.stats.updated !== 1) return fail('店铺已被其他人更新，请刷新后重试', 'CONFLICT')
  return ok(cityShopView({ ...existing.data, ...validation.data, updatedAt: now }))
}

async function deleteCityShop(event, openId) {
  const shopId = normalizeText(event.shopId, 64)
  if (!shopId) return fail('参数不完整', 'INVALID_PARAM')
  const existing = await db.collection(CITY_SHOPS).doc(shopId).get().catch(() => null)
  if (!existing || !existing.data || existing.data.ownerOpenId !== openId) {
    return fail('城市店铺不存在', 'SHOP_NOT_FOUND')
  }
  await db.collection(CITY_SHOPS).doc(shopId).remove()
  return ok({ deleted: true })
}

async function createCityShare(event, openId) {
  const cityCode = cityCodeFromName(normalizeText(event.cityCode || event.cityName, 64))
  const cityName = normalizeText(event.cityName, 64) || cityCode
  if (!cityCode) return fail('请选择城市', 'INVALID_PARAM')
  const cityShops = await collectShareableCityShops(openId, cityCode)
  if (cityShops.length === 0) return fail('这个城市还没有可分享的店铺', 'CITY_EMPTY')
  const token = randomToken()
  const shortCode = randomToken().slice(0, 16)
  const now = Date.now()
  await db.collection(CITY_SHARES).add({
    data: {
      tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
      shortCode,
      ownerOpenId: openId,
      cityCode,
      cityName,
      status: 'active',
      expiresAt: now + 30 * 24 * 60 * 60 * 1000,
      createdAt: now,
    },
  })
  return ok({ token, shortCode, cityCode, cityName, expiresAt: now + 30 * 24 * 60 * 60 * 1000 })
}

async function findCityShare(token, code) {
  if (token) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    const res = await db.collection(CITY_SHARES).where({ tokenHash, status: 'active' }).limit(1).get()
    return res.data[0] || null
  }
  if (code) {
    const res = await db.collection(CITY_SHARES).where({ shortCode: code, status: 'active' }).limit(1).get()
    return res.data[0] || null
  }
  return null
}

async function createCityShareQrCode(event, openId) {
  const token = normalizeText(event.token, 128)
  const share = await findCityShare(token, '')
  if (!share || share.ownerOpenId !== openId || Number(share.expiresAt) < Date.now()) {
    return fail('分享链接已失效', 'SHARE_INVALID')
  }
  try {
    const result = await cloud.openapi.wxacode.getUnlimited({
      scene: `s=${share.shortCode}`,
      page: 'pages/city-share/index',
      checkPath: false,
      width: 280,
    })
    if (!result.buffer) return fail('生成二维码失败', 'QRCODE_FAILED')
    const uploadRes = await cloud.uploadFile({
      cloudPath: `city-share-qrcodes/${share._id}.png`,
      fileContent: result.buffer,
    })
    return ok({
      fileID: uploadRes.fileID,
      cityCode: share.cityCode,
      cityName: share.cityName,
      expiresAt: share.expiresAt,
    })
  } catch (err) {
    if (err && Number(err.errCode) === -604101) {
      console.error('createCityShareQrCode permission denied', JSON.stringify({ errCode: err.errCode, errMsg: err.errMsg }))
      return fail('云函数缺少 wxacode.getUnlimited 权限，请重新上传 shopApi 全部文件', 'QRCODE_PERMISSION')
    }
    const detail = (err && (err.errMsg || err.message)) || '未知错误'
    console.error('createCityShareQrCode failed', JSON.stringify({ detail }))
    return fail(`生成二维码失败（${detail}）`, 'QRCODE_FAILED')
  }
}

async function getSharedCity(event) {
  const token = normalizeText(event.token, 128)
  const code = normalizeText(event.code, 64)
  const share = await findCityShare(token, code)
  if (!share || Number(share.expiresAt) < Date.now()) return fail('分享链接已失效', 'SHARE_INVALID')
  const shops = await collectShareableCityShops(share.ownerOpenId, share.cityCode)
  return ok({
    cityCode: share.cityCode,
    cityName: share.cityName,
    shops,
  })
}

async function listMemberShops(event, openId) {
  const groupId = normalizeText(event.groupId, 64)
  if (!groupId) return fail('参数不完整', 'INVALID_PARAM')
  const member = await findMember(groupId, openId)
  if (!member) return fail('未加入该清单', 'FORBIDDEN')
  const category = normalizeText(event.category, 20)
  const folderId = normalizeText(event.folderId, 64)
  const where = buildShopQuery(groupId, category, folderId)
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

  const folderError = await validateFolderOwnership(groupId, input.folderId)
  if (folderError) return folderError

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
  const folder = input.folderId ? await findFolderById(input.folderId) : null
  const city = cityIdentity(folder)
  const shopDoc = {
    groupId,
    folderId: input.folderId || null,
    cityCode: city ? city.cityCode : null,
    cityName: city ? city.cityName : null,
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

  const deterministicId = shopRequestDocumentId(groupId, requestId)
  try {
    const data = deterministicId ? { ...shopDoc, _id: deterministicId } : shopDoc
    const res = await db.collection(SHOPS).add({ data })
    const created = { ...shopDoc, _id: deterministicId || res._id }
    return ok(toShopView(created, member))
  } catch (err) {
    // 并发的同一请求只能有一个固定 _id 写入成功；其余请求返回同一店铺。
    if (deterministicId) {
      const existing = await db.collection(SHOPS).doc(deterministicId).get().catch(() => null)
      if (
        existing &&
        existing.data &&
        existing.data.groupId === groupId &&
        existing.data.requestId === requestId
      ) {
        return ok(toShopView(existing.data, member))
      }
    }
    throw err
  }
}

async function updateShop(event, openId) {
  const groupId = normalizeText(event.groupId, 64)
  const shopId = normalizeText(event.shopId, 64)
  const targetGroupId = normalizeText(event.targetGroupId, 64)
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

  const folderGroupId = resolveFolderGroupId({ targetGroupId, sourceGroupId: groupId })
  const folderError = await validateFolderOwnership(folderGroupId, input.folderId)
  if (folderError) return folderError

  // 移动店铺到其他清单：校验目标清单可接收
  let targetMember = null
  if (targetGroupId && targetGroupId !== groupId) {
    const [group, tMember, countRes] = await Promise.all([
      findGroupById(targetGroupId),
      findMember(targetGroupId, openId),
      db.collection(SHOPS).where({ groupId: targetGroupId }).count(),
    ])
    const verdict = evaluateMoveTarget({
      targetGroupId,
      sourceGroupId: groupId,
      group,
      member: tMember,
      targetShopCount: Number(countRes && countRes.total) || 0,
    })
    if (!verdict.ok) return verdict
    targetMember = verdict.data.targetMember
  }

  // 乐观并发
  const expectedUpdatedAt = Number(event.expectedUpdatedAt)
  if (!Number.isFinite(expectedUpdatedAt)) {
    return fail('数据已变化，请刷新后重试', 'CONFLICT')
  }
  const now = Date.now()
  const folder = input.folderId ? await findFolderById(input.folderId) : null
  const city = cityIdentity(folder)
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
        folderId: input.folderId || null,
        cityCode: city ? city.cityCode : null,
        cityName: city ? city.cityName : null,
        groupId: targetGroupId || groupId,
        updatedByOpenId: openId,
        updatedAt: now,
      },
    })
  if (!updateRes.stats || updateRes.stats.updated !== 1) {
    return fail('店铺已被其他成员更新，请刷新后重新编辑', 'CONFLICT')
  }
  const updated = {
    ...shop,
    ...input,
    groupId: targetGroupId || groupId,
    cityCode: city ? city.cityCode : null,
    cityName: city ? city.cityName : null,
    updatedByOpenId: openId,
    updatedAt: now,
  }
  return ok({
    ...toShopView(updated, targetMember || member),
    moved: Boolean(targetGroupId && targetGroupId !== groupId),
  })
}

async function deleteShop(event, openId) {
  const groupId = normalizeText(event.groupId, 64)
  const shopId = normalizeText(event.shopId, 64)
  if (!groupId || !shopId) return fail('参数不完整', 'INVALID_PARAM')

  const member = await findMember(groupId, openId)
  if (!member) return fail('请先加入清单', 'FORBIDDEN')
  if (member.allowDelete === false) return fail('你只有添加和编辑权限，不能删除店铺', 'FORBIDDEN')

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
  listMemberMapShops,
  listMyCities,
  listMyCityMapShops,
  listMyCityShops,
  createCityShop,
  updateCityShop,
  deleteCityShop,
  createCityShare,
  createCityShareQrCode,
  getSharedCity,
  acceptCityShare,
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
