const cloud = require('wx-server-sdk')
const crypto = require('crypto')
const { evaluateInvite } = require('./invite')
const { ensurePersistentShortCode } = require('./invite-code')
const { cityCodeFromName, cityDisplayName } = require('./city')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate

const GROUPS = 'groups'
const MEMBERS = 'members'
const INVITES = 'invites'
const SHOPS = 'shops'
const FOLDERS = 'folders'

const INVITE_DEFAULT_DAYS = 7
const INVITE_DEFAULT_MAX_USES = 50
// 服务端 where().update()/remove() 单次最多处理 1000 条记录
const MAX_BATCH_WRITE = 1000

const COLLECTION_NAMES = [GROUPS, MEMBERS, INVITES, SHOPS, FOLDERS]
let ensurePromise = null

async function ensureCollections() {
  if (ensurePromise) return ensurePromise
  ensurePromise = (async () => {
    await Promise.all(
      COLLECTION_NAMES.map(async (name) => {
        try {
          await db.createCollection(name)
        } catch (err) {
          // 集合已存在或创建失败均忽略，后续读写会再次触发
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

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex')
}

function randomHex(bytes) {
  return crypto.randomBytes(bytes).toString('hex')
}

const SHORT_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'

function generateShortCode(length = 12) {
  const bytes = crypto.randomBytes(length)
  let code = ''
  for (let i = 0; i < length; i++) {
    code += SHORT_CODE_CHARS[bytes[i] % SHORT_CODE_CHARS.length]
  }
  return code
}

function memberId(groupId, openId) {
  return sha256(`${groupId}:${openId}`)
}

function normalizeText(value, maxLen) {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLen)
}

function sanitizeForLog(value) {
  // 避免在日志中输出完整地址、精确坐标、OpenID 等
  return '[REDACTED]'
}

async function findMember(groupId, openId) {
  const res = await db
    .collection(MEMBERS)
    .where({
      _id: memberId(groupId, openId),
      status: 'active',
    })
    .limit(1)
    .get()
  return res.data[0] || null
}

async function findMemberRecord(groupId, openId) {
  const res = await db
    .collection(MEMBERS)
    .doc(memberId(groupId, openId))
    .get()
    .catch(() => null)
  return res && res.data ? res.data : null
}

async function findGroupById(groupId) {
  const res = await db.collection(GROUPS).doc(groupId).get().catch(() => null)
  return res && res.data ? res.data : null
}

async function findGroupByPublicId(publicId) {
  const res = await db
    .collection(GROUPS)
    .where({ publicId, status: 'active' })
    .limit(1)
    .get()
  return res.data[0] || null
}

function isPublicReadableGroup(group) {
  return Boolean(group && group.visibility === 'public_read' && group.status === 'active')
}

function toGroupView(group, member) {
  const isOwner = Boolean(member && member.role === 'owner')
  return {
    id: group._id,
    publicId: group.publicId,
    name: group.name,
    role: member ? member.role : null,
    updatedAt: group.updatedAt,
    isOwner,
  }
}

function toMemberView(member, selfOpenId) {
  return {
    id: member._id,
    displayName: member.displayName,
    role: member.role,
    status: member.status,
    joinedAt: member.joinedAt,
    isSelf: member.userOpenId === selfOpenId,
  }
}

function toFolderView(folder) {
  const cityCode = folder.cityCode || cityCodeFromName(folder.cityName || folder.name)
  return {
    id: folder._id,
    name: folder.name,
    cityCode,
    cityName: cityDisplayName(folder.cityName || folder.name),
    sortOrder: folder.sortOrder,
  }
}

function toFolderViewWithCount(folder, shopCount) {
  return {
    ...toFolderView(folder),
    shopCount,
  }
}

async function countShopsByFolder(groupId, folderId) {
  const res = await db.collection(SHOPS).where({ groupId, folderId }).count()
  return Number(res.total) || 0
}

async function countUncategorizedShops(groupId) {
  const res = await db
    .collection(SHOPS)
    .where({ groupId })
    .limit(1000)
    .get()
  return res.data.filter((s) => !s.folderId).length
}

async function findFolderById(folderId) {
  const res = await db.collection(FOLDERS).doc(folderId).get().catch(() => null)
  return res && res.data ? res.data : null
}

async function listFoldersByGroup(groupId) {
  const res = await db
    .collection(FOLDERS)
    .where({ groupId })
    .orderBy('sortOrder', 'asc')
    .limit(200)
    .get()
  return res.data
}

// ---------- actions ----------

async function bootstrap(event, openId) {
  const groups = await listMyGroupsInternal(openId)
  return ok({ hasGroups: groups.length > 0 })
}

async function listMyGroupsInternal(openId) {
  const res = await db
    .collection(MEMBERS)
    .where({ userOpenId: openId, status: 'active' })
    .orderBy('updatedAt', 'desc')
    .limit(100)
    .get()
  const members = res.data
  if (members.length === 0) return []

  const groupIds = members.map((m) => m.groupId)
  const groupsRes = await db
    .collection(GROUPS)
    .where({ _id: _.in(groupIds), status: 'active' })
    .limit(100)
    .get()
  const groupMap = new Map(groupsRes.data.map((g) => [g._id, g]))
  const memberMap = new Map(members.map((m) => [m.groupId, m]))

  return members
    .filter((m) => groupMap.has(m.groupId))
    .map((m) => toGroupView(groupMap.get(m.groupId), memberMap.get(m.groupId)))
}

async function listMyGroups(event, openId) {
  return ok(await listMyGroupsInternal(openId))
}

async function getPublicGroup(event) {
  const publicId = normalizeText(event.publicId, 64)
  if (!publicId) return fail('参数不完整', 'INVALID_PARAM')
  const group = await findGroupByPublicId(publicId)
  if (!isPublicReadableGroup(group)) {
    return fail('清单不存在或不可访问', 'GROUP_NOT_FOUND')
  }
  const memberCount = await countActiveMembers(group._id)
  return ok({
    publicId: group.publicId,
    name: group.name,
    memberCount,
    inviteStatus: 'valid',
    alreadyMember: false,
  })
}

async function createGroup(event, openId) {
  const groupName = normalizeText(event.groupName, 30)
  if (!groupName) return fail('请输入清单名称', 'INVALID_PARAM')
  // 新版客户端会要求填写；兼容未传该字段的旧客户端。
  const displayName = normalizeText(event.displayName, 20) || '创建者'

  const publicId = randomHex(16)
  const now = Date.now()
  const groupDoc = {
    publicId,
    name: groupName,
    ownerOpenId: openId,
    visibility: 'public_read',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  }
  const memberDoc = {
    _id: memberId('', ''), // placeholder
    groupId: '',
    userOpenId: openId,
    displayName,
    role: 'owner',
    status: 'active',
    joinedAt: now,
    updatedAt: now,
  }

  const transaction = await db.startTransaction()
  try {
    const groupRes = await transaction.collection(GROUPS).add({ data: groupDoc })
    const groupId = groupRes._id
    memberDoc._id = memberId(groupId, openId)
    memberDoc.groupId = groupId
    await transaction.collection(MEMBERS).add({ data: memberDoc })
    await transaction.commit()
    const group = { ...groupDoc, _id: groupId }
    return ok({ group: toGroupView(group, memberDoc) })
  } catch (err) {
    await transaction.rollback().catch(() => {})
    console.error('createGroup failed', sanitizeForLog())
    return fail('创建清单失败，请重试', 'CREATE_FAILED')
  }
}

async function updateGroup(event, openId) {
  const groupId = normalizeText(event.groupId, 64)
  const name = normalizeText(event.name, 30)
  if (!groupId || !name) return fail('参数不完整', 'INVALID_PARAM')

  const member = await findMember(groupId, openId)
  if (!member || member.role !== 'owner') {
    return fail('只有创建者可以修改清单名称', 'FORBIDDEN')
  }
  const group = await findGroupById(groupId)
  if (!group) return fail('清单不存在', 'GROUP_NOT_FOUND')

  const now = Date.now()
  await db.collection(GROUPS).doc(groupId).update({ data: { name, updatedAt: now } })
  return ok({ updatedAt: now })
}

async function createInvite(event, openId) {
  const groupId = normalizeText(event.groupId, 64)
  if (!groupId) return fail('参数不完整', 'INVALID_PARAM')

  const member = await findMember(groupId, openId)
  if (!member || member.role !== 'owner') {
    return fail('只有创建者可以生成邀请', 'FORBIDDEN')
  }
  const group = await findGroupById(groupId)
  if (!group) return fail('清单不存在', 'GROUP_NOT_FOUND')

  const token = randomHex(32) // 256-bit
  const tokenHash = sha256(token)
  const shortCode = generateShortCode()
  const now = Date.now()
  const expiresAt = now + INVITE_DEFAULT_DAYS * 24 * 60 * 60 * 1000

  await db.collection(INVITES).add({
    data: {
      groupId,
      tokenHash,
      shortCode,
      createdByOpenId: openId,
      status: 'active',
      expiresAt,
      maxUses: INVITE_DEFAULT_MAX_USES,
      usedCount: 0,
      createdAt: now,
    },
  })
  return ok({
    token,
    shortCode,
    expiresAt,
    remainingUses: INVITE_DEFAULT_MAX_USES,
  })
}

async function getInviteByToken(token) {
  const tokenHash = sha256(token)
  const res = await db
    .collection(INVITES)
    .where({ tokenHash, status: 'active' })
    .limit(1)
    .get()
  return res.data[0] || null
}

async function getInviteByShortCode(shortCode) {
  const res = await db
    .collection(INVITES)
    .where({ shortCode, status: 'active' })
    .limit(1)
    .get()
  return res.data[0] || null
}

function evaluateInviteStatus(invite) {
  return evaluateInvite(invite)
}

async function buildGroupPreview(groupId, openId) {
  const group = await findGroupById(groupId)
  if (!isPublicReadableGroup(group)) return null
  const memberCount = await countActiveMembers(group._id)
  const existing = await findMember(groupId, openId)
  return {
    publicId: group.publicId,
    name: group.name,
    memberCount,
    inviteStatus: existing ? 'valid' : 'valid',
    alreadyMember: Boolean(existing),
  }
}

async function previewInvite(event, openId) {
  const token = normalizeText(event.token, 128)
  const code = normalizeText(event.code, 20)
  if (!token && !code) return ok(null)
  const invite = token ? await getInviteByToken(token) : await getInviteByShortCode(code)
  const status = evaluateInvite(invite)
  if (status !== 'valid' || !invite) {
    return ok(null)
  }
  const group = await findGroupById(invite.groupId)
  if (!isPublicReadableGroup(group)) return ok(null)
  const memberCount = await countActiveMembers(group._id)
  const existing = await findMember(group._id, openId)
  return ok({
    publicId: group.publicId,
    name: group.name,
    memberCount,
    inviteStatus: 'valid',
    inviteExpiresAt: invite.expiresAt,
    inviteRemainingUses: invite.maxUses - invite.usedCount,
    alreadyMember: Boolean(existing),
  })
}

async function acceptInvite(event, openId) {
  const token = normalizeText(event.token, 128)
  const code = normalizeText(event.code, 20)
  const displayName = normalizeText(event.displayName, 20)
  if ((!token && !code) || !displayName) return fail('参数不完整', 'INVALID_PARAM')

  const invite = token ? await getInviteByToken(token) : await getInviteByShortCode(code)
  const status = evaluateInvite(invite)
  if (status !== 'valid' || !invite) {
    return fail('邀请无效或已过期', 'INVITE_INVALID')
  }
  const groupId = invite.groupId
  const group = await findGroupById(groupId)
  if (!isPublicReadableGroup(group)) {
    return fail('清单不存在或不可访问', 'GROUP_NOT_FOUND')
  }

  const mid = memberId(groupId, openId)
  const existingRecord = await findMemberRecord(groupId, openId)
  if (existingRecord && existingRecord.status === 'active') {
    // 幂等：已是成员直接返回，不重复计数
    const preview = await buildGroupPreview(groupId, openId)
    return ok({ ...preview, alreadyMember: true, duplicated: true })
  }

  const transaction = await db.startTransaction()
  try {
    const inviteRes = await transaction
      .collection(INVITES)
      .doc(invite._id)
      .get()
      .catch(() => null)
    const freshInvite = inviteRes && inviteRes.data ? inviteRes.data : invite
    if (evaluateInvite(freshInvite) !== 'valid') {
      await transaction.rollback().catch(() => {})
      return fail('邀请无效或已过期', 'INVITE_INVALID')
    }

    const now = Date.now()
    if (existingRecord) {
      // 被移除的成员保留了确定性 _id；重新激活原记录才能再次接受邀请。
      await transaction.collection(MEMBERS).doc(mid).update({
        data: {
          displayName,
          role: 'member',
          status: 'active',
          joinedAt: now,
          updatedAt: now,
        },
      })
    } else {
      await transaction.collection(MEMBERS).add({
        data: {
          _id: mid,
          groupId,
          userOpenId: openId,
          displayName,
          role: 'member',
          status: 'active',
          joinedAt: now,
          updatedAt: now,
        },
      })
    }
    await transaction
      .collection(INVITES)
      .doc(invite._id)
      .update({
        data: {
          usedCount: _.inc(1),
        },
      })
    await transaction.commit()

    const preview = await buildGroupPreview(groupId, openId)
    return ok({ ...preview, duplicated: false })
  } catch (err) {
    await transaction.rollback().catch(() => {})
    // 两次并发接受邀请时，另一请求可能已经成功；此时按幂等成功返回。
    const activeMember = await findMember(groupId, openId).catch(() => null)
    if (activeMember) {
      const preview = await buildGroupPreview(groupId, openId)
      return ok({ ...preview, alreadyMember: true, duplicated: true })
    }
    console.error('acceptInvite failed', sanitizeForLog())
    return fail('加入失败，请重试', 'ACCEPT_FAILED')
  }
}

async function updateAllWhere(collection, where, data) {
  // 单次最多处理 1000 条，不足 1000 条说明已全部处理完
  for (;;) {
    const res = await db.collection(collection).where(where).update({ data })
    const updated = Number(res && res.stats && res.stats.updated) || 0
    if (updated < MAX_BATCH_WRITE) break
  }
}

async function removeAllWhere(collection, where) {
  for (;;) {
    const res = await db.collection(collection).where(where).remove()
    const removed = Number(res && res.stats && res.stats.removed) || 0
    if (removed < MAX_BATCH_WRITE) break
  }
}

async function revokeInvite(event, openId) {
  const groupId = normalizeText(event.groupId, 64)
  if (!groupId) return fail('参数不完整', 'INVALID_PARAM')
  const member = await findMember(groupId, openId)
  if (!member || member.role !== 'owner') {
    return fail('只有创建者可以撤销邀请', 'FORBIDDEN')
  }
  await updateAllWhere(INVITES, { groupId, status: 'active' }, { status: 'revoked' })
  return ok({ revoked: true })
}

async function countActiveMembers(groupId) {
  const res = await db
    .collection(MEMBERS)
    .where({ groupId, status: 'active' })
    .count()
  return res.total
}

async function deleteGroup(event, openId) {
  const groupId = normalizeText(event.groupId, 64)
  if (!groupId) return fail('参数不完整', 'INVALID_PARAM')

  const group = await findGroupById(groupId)
  if (!group) return fail('清单不存在', 'GROUP_NOT_FOUND')

  const isResumingOwner = group.status === 'deleting' && group.ownerOpenId === openId
  if (!isResumingOwner) {
    const member = await findMember(groupId, openId)
    if (!member || member.role !== 'owner') {
      return fail('只有创建者可以删除清单', 'FORBIDDEN')
    }
  }

  try {
    if (group.status !== 'deleting') {
      await db
        .collection(GROUPS)
        .doc(groupId)
        .update({ data: { status: 'deleting', updatedAt: Date.now() } })
    }

    // 先隐藏清单，再清理关联数据，最后删除清单文档。任何一步失败都可由创建者重试。
    await Promise.all([
      removeAllWhere(MEMBERS, { groupId }),
      removeAllWhere(INVITES, { groupId }),
      removeAllWhere(SHOPS, { groupId }),
    ])
    await db.collection(GROUPS).doc(groupId).remove()
    return ok({ deleted: true })
  } catch (err) {
    console.error('deleteGroup failed', sanitizeForLog())
    return fail('删除未完成，请重试', 'DELETE_FAILED')
  }
}

async function createInviteQrCode(event, openId) {
  const token = normalizeText(event.token, 128)
  const code = normalizeText(event.code, 20)
  if (!token && !code) return fail('参数不完整', 'INVALID_PARAM')

  const invite = token ? await getInviteByToken(token) : await getInviteByShortCode(code)
  if (evaluateInvite(invite) !== 'valid' || !invite) {
    return fail('邀请无效或已过期', 'INVITE_INVALID')
  }
  const group = await findGroupById(invite.groupId)
  if (!group) return fail('清单不存在', 'GROUP_NOT_FOUND')

  let shortCode = ''
  try {
    shortCode = await ensurePersistentShortCode(
      invite,
      generateShortCode,
      async (inviteId, generatedCode) => {
        const updateRes = await db
          .collection(INVITES)
          .doc(inviteId)
          .update({ data: { shortCode: generatedCode, updatedAt: Date.now() } })
        return Boolean(updateRes && updateRes.stats && updateRes.stats.updated === 1)
      },
    )
    const persistedInvite = await getInviteByShortCode(shortCode)
    if (!persistedInvite || persistedInvite._id !== invite._id) {
      return fail('邀请短码保存失败，请重新生成邀请', 'QRCODE_FAILED')
    }
  } catch (err) {
    console.error('persist invite shortCode failed', err && err.message ? err.message : 'unknown')
    return fail('邀请短码保存失败，请重新生成邀请', 'QRCODE_FAILED')
  }
  const scene = `c=${shortCode}`
  const page = 'pages/invite/index'

  try {
    const result = await cloud.openapi.wxacode.getUnlimited({
      scene,
      page,
      checkPath: false,
      width: 280,
    })
    const buffer = result.buffer
    if (!buffer) return fail('生成小程序码失败', 'QRCODE_FAILED')

    const cloudPath = `invite-qrcodes/${invite._id}.png`
    const uploadRes = await cloud.uploadFile({
      cloudPath,
      fileContent: buffer,
    })
    return ok({
      fileID: uploadRes.fileID,
      publicId: group.publicId,
      name: group.name,
    })
  } catch (err) {
    const detail =
      (err && (err.errMsg || err.errCode || err.message)) || '未知错误'
    console.error('createInviteQrCode failed', JSON.stringify({ detail, code: err && err.errCode }))
    return fail(`生成小程序码失败（${detail}）`, 'QRCODE_FAILED')
  }
}

async function listMembers(event, openId) {
  const groupId = normalizeText(event.groupId, 64)
  if (!groupId) return fail('参数不完整', 'INVALID_PARAM')
  const member = await findMember(groupId, openId)
  if (!member) return fail('未加入该清单', 'FORBIDDEN')
  const res = await db
    .collection(MEMBERS)
    .where({ groupId, status: 'active' })
    .orderBy('joinedAt', 'asc')
    .limit(200)
    .get()
  return ok(res.data.map((m) => toMemberView(m, openId)))
}

async function updateMyDisplayName(event, openId) {
  const groupId = normalizeText(event.groupId, 64)
  const displayName = normalizeText(event.displayName, 20)
  if (!groupId || !displayName) return fail('参数不完整', 'INVALID_PARAM')

  const member = await findMember(groupId, openId)
  if (!member) return fail('未加入该清单', 'FORBIDDEN')

  const now = Date.now()
  try {
    // 两个更新都是幂等的；任一步失败后，客户端可以使用同一名称安全重试。
    await db
      .collection(MEMBERS)
      .doc(member._id)
      .update({ data: { displayName, updatedAt: now } })
    const shopUpdate = await db
      .collection(SHOPS)
      .where({ groupId, createdByOpenId: openId })
      .update({ data: { createdByName: displayName } })
    return ok({
      displayName,
      updatedShops: Number(shopUpdate && shopUpdate.stats && shopUpdate.stats.updated) || 0,
    })
  } catch (err) {
    console.error('updateMyDisplayName failed', sanitizeForLog())
    return fail('修改名称失败，请重试', 'UPDATE_NAME_FAILED')
  }
}

async function removeMember(event, openId) {
  const groupId = normalizeText(event.groupId, 64)
  const targetMemberId = normalizeText(event.memberId, 64)
  if (!groupId || !targetMemberId) return fail('参数不完整', 'INVALID_PARAM')

  const caller = await findMember(groupId, openId)
  if (!caller || caller.role !== 'owner') {
    return fail('只有创建者可以移除成员', 'FORBIDDEN')
  }
  const target = await db.collection(MEMBERS).doc(targetMemberId).get().catch(() => null)
  if (!target || !target.data || target.data.groupId !== groupId) {
    return fail('成员不存在', 'MEMBER_NOT_FOUND')
  }
  if (target.data.role === 'owner') {
    return fail('不能移除创建者', 'FORBIDDEN')
  }
  const now = Date.now()
  await db
    .collection(MEMBERS)
    .doc(targetMemberId)
    .update({ data: { status: 'removed', updatedAt: now } })
  return ok({ removed: true })
}

// ---------- folders ----------

async function listFolders(event, openId) {
  const groupId = normalizeText(event.groupId, 64)
  if (!groupId) return fail('参数不完整', 'INVALID_PARAM')
  const member = await findMember(groupId, openId)
  if (!member) return fail('未加入该清单', 'FORBIDDEN')
  const folders = await listFoldersByGroup(groupId)
  const [withCount, uncategorizedCount] = await Promise.all([
    Promise.all(
      folders.map(async (f) => toFolderViewWithCount(f, await countShopsByFolder(groupId, f._id))),
    ),
    countUncategorizedShops(groupId),
  ])
  return ok({ folders: withCount, uncategorizedCount })
}

async function listPublicFolders(event) {
  const publicId = normalizeText(event.publicId, 64)
  if (!publicId) return fail('参数不完整', 'INVALID_PARAM')
  const group = await findGroupByPublicId(publicId)
  if (!isPublicReadableGroup(group)) {
    return fail('清单不存在或不可访问', 'GROUP_NOT_FOUND')
  }
  const folders = await listFoldersByGroup(group._id)
  const [withCount, uncategorizedCount] = await Promise.all([
    Promise.all(
      folders.map(async (f) => toFolderViewWithCount(f, await countShopsByFolder(group._id, f._id))),
    ),
    countUncategorizedShops(group._id),
  ])
  return ok({ folders: withCount, uncategorizedCount })
}

async function createFolder(event, openId) {
  const groupId = normalizeText(event.groupId, 64)
  const name = normalizeText(event.name, 30)
  if (!groupId || !name) return fail('参数不完整', 'INVALID_PARAM')

  const member = await findMember(groupId, openId)
  if (!member) return fail('请先加入清单再创建城市', 'FORBIDDEN')
  const group = await findGroupById(groupId)
  if (!isPublicReadableGroup(group)) return fail('清单不存在或不可访问', 'GROUP_NOT_FOUND')

  const countRes = await db.collection(FOLDERS).where({ groupId }).count()
  const now = Date.now()
  const folderDoc = {
    groupId,
    name,
    cityCode: cityCodeFromName(name),
    cityName: cityDisplayName(name),
    sortOrder: Number(countRes.total) || 0,
    createdByOpenId: openId,
    createdAt: now,
    updatedAt: now,
  }
  const res = await db.collection(FOLDERS).add({ data: folderDoc })
  return ok(toFolderView({ ...folderDoc, _id: res._id }))
}

async function updateFolder(event, openId) {
  const folderId = normalizeText(event.folderId, 64)
  const name = normalizeText(event.name, 30)
  const sortOrder = Number(event.sortOrder)
  if (!folderId) return fail('参数不完整', 'INVALID_PARAM')

  const folder = await findFolderById(folderId)
  if (!folder) return fail('城市不存在', 'FOLDER_NOT_FOUND')
  const member = await findMember(folder.groupId, openId)
  if (!member) return fail('请先加入清单', 'FORBIDDEN')

  const data = { updatedAt: Date.now() }
  if (name) {
    data.name = name
    data.cityCode = cityCodeFromName(name)
    data.cityName = cityDisplayName(name)
  }
  if (Number.isFinite(sortOrder)) data.sortOrder = sortOrder
  await db.collection(FOLDERS).doc(folderId).update({ data })
  if (name) {
    // 级联更新不改变 where 谓词，不能复用 updateAllWhere（每轮 updated 恒为上限会死循环）。
    // 单清单店铺数上限 1000，单次 where().update() 即可覆盖全部匹配记录。
    await db.collection(SHOPS)
      .where({ groupId: folder.groupId, folderId })
      .update({ data: { cityCode: data.cityCode, cityName: data.cityName, updatedAt: data.updatedAt } })
  }
  return ok({ updatedAt: data.updatedAt })
}

async function deleteFolder(event, openId) {
  const folderId = normalizeText(event.folderId, 64)
  if (!folderId) return fail('参数不完整', 'INVALID_PARAM')

  const folder = await findFolderById(folderId)
  if (!folder) return fail('城市不存在', 'FOLDER_NOT_FOUND')
  const member = await findMember(folder.groupId, openId)
  if (!member) return fail('请先加入清单', 'FORBIDDEN')

  // 该城市下的店铺归为未分类，不删除店铺
  const now = Date.now()
  await updateAllWhere(
    SHOPS,
    { groupId: folder.groupId, folderId },
    { folderId: null, cityCode: null, cityName: null, updatedAt: now },
  )
  await db.collection(FOLDERS).doc(folderId).remove()
  return ok({ deleted: true })
}

async function assignUncategorizedShops(event, openId) {
  const groupId = normalizeText(event.groupId, 64)
  if (!groupId) return fail('参数不完整', 'INVALID_PARAM')
  const member = await findMember(groupId, openId)
  if (!member) return fail('未加入该清单', 'FORBIDDEN')

  let folderId = normalizeText(event.folderId, 64)
  const folderName = normalizeText(event.folderName, 30)
  if (!folderId && folderName) {
    const existing = await db
      .collection(FOLDERS)
      .where({ groupId, name: folderName })
      .limit(1)
      .get()
    if (existing.data[0]) {
      folderId = existing.data[0]._id
    } else {
      const targetFolderCount = await db.collection(FOLDERS).where({ groupId }).count()
      const sortOrder = Number(targetFolderCount.total) || 0
      const now = Date.now()
      const addRes = await db.collection(FOLDERS).add({
        data: {
          groupId,
          name: folderName,
          cityCode: cityCodeFromName(folderName),
          cityName: cityDisplayName(folderName),
          sortOrder,
          createdByOpenId: openId,
          createdAt: now,
          updatedAt: now,
        },
      })
      folderId = addRes._id
    }
  }
  if (!folderId) return fail('参数不完整', 'INVALID_PARAM')

  const folder = await findFolderById(folderId)
  if (!folder || folder.groupId !== groupId) {
    return fail('城市不存在或不属于当前清单', 'INVALID_PARAM')
  }

  const now = Date.now()
  let updated = 0
  for (;;) {
    const res = await db
      .collection(SHOPS)
      .where({ groupId })
      .limit(1000)
      .get()
    const targets = res.data.filter((s) => !s.folderId)
    if (targets.length === 0) break
    await Promise.all(
      targets.map((s) =>
        db.collection(SHOPS).doc(s._id).update({
          data: {
            folderId,
            cityCode: folder.cityCode || cityCodeFromName(folder.cityName || folder.name),
            cityName: cityDisplayName(folder.cityName || folder.name),
            updatedAt: now,
          },
        }),
      ),
    )
    updated += targets.length
    if (res.data.length < 1000) break
  }
  return ok({ updated, folderId })
}

async function mergeGroups(event, openId) {
  const targetGroupId = normalizeText(event.targetGroupId, 64)
  const sourceGroupIds = Array.isArray(event.sourceGroupIds)
    ? event.sourceGroupIds
        .map((id) => normalizeText(id, 64))
        .filter(Boolean)
        .filter((id) => id !== targetGroupId)
    : []
  if (!targetGroupId || sourceGroupIds.length === 0) {
    return fail('参数不完整', 'INVALID_PARAM')
  }

  const targetMember = await findMember(targetGroupId, openId)
  if (!targetMember || targetMember.role !== 'owner') {
    return fail('只有创建者可以合并清单', 'FORBIDDEN')
  }
  const targetGroup = await findGroupById(targetGroupId)
  if (!isPublicReadableGroup(targetGroup)) return fail('清单不存在或不可访问', 'GROUP_NOT_FOUND')

  for (const sid of sourceGroupIds) {
    const group = await findGroupById(sid)
    if (!isPublicReadableGroup(group)) return fail('存在不可访问的清单', 'GROUP_NOT_FOUND')
    const member = await findMember(sid, openId)
    if (!member || member.role !== 'owner') {
      return fail('只有创建者可以合并自己的清单', 'FORBIDDEN')
    }
  }

  const now = Date.now()
  const targetFolderCount = await db.collection(FOLDERS).where({ groupId: targetGroupId }).count()
  let sortOrder = Number(targetFolderCount.total) || 0
  let mergedShops = 0
  let mergedFolders = 0

  for (const sid of sourceGroupIds) {
    const sourceGroup = await findGroupById(sid)
    if (!sourceGroup) continue

    // 1. 按原清单名创建城市子清单
    const folderRes = await db.collection(FOLDERS).add({
      data: {
        groupId: targetGroupId,
        name: sourceGroup.name,
        cityCode: cityCodeFromName(sourceGroup.name),
        cityName: cityDisplayName(sourceGroup.name),
        sortOrder,
        createdByOpenId: openId,
        createdAt: now,
        updatedAt: now,
      },
    })
    const folderId = folderRes._id
    sortOrder += 1
    mergedFolders += 1

    // 2. 迁移店铺：批量更新 groupId 与 folderId
    for (;;) {
      const res = await db
        .collection(SHOPS)
        .where({ groupId: sid })
        .update({
          data: {
            groupId: targetGroupId,
            folderId,
            cityCode: cityCodeFromName(sourceGroup.name),
            cityName: cityDisplayName(sourceGroup.name),
            updatedAt: now,
          },
        })
      const n = Number(res && res.stats && res.stats.updated) || 0
      mergedShops += n
      if (n < MAX_BATCH_WRITE) break
    }

    // 3. 迁移成员（幂等去重，owner 除外）
    const membersRes = await db
      .collection(MEMBERS)
      .where({ groupId: sid, status: 'active' })
      .limit(200)
      .get()
    for (const m of membersRes.data) {
      if (m.role === 'owner' && m.userOpenId === openId) continue
      const existing = await findMemberRecord(targetGroupId, m.userOpenId)
      if (existing && existing.status === 'active') continue
      const mid = memberId(targetGroupId, m.userOpenId)
      if (existing) {
        await db.collection(MEMBERS).doc(mid).update({
          data: {
            displayName: m.displayName,
            role: 'member',
            status: 'active',
            joinedAt: now,
            updatedAt: now,
          },
        })
      } else {
        await db.collection(MEMBERS).add({
          data: {
            _id: mid,
            groupId: targetGroupId,
            userOpenId: m.userOpenId,
            displayName: m.displayName,
            role: 'member',
            status: 'active',
            joinedAt: now,
            updatedAt: now,
          },
        })
      }
    }

    // 4. 清理邀请并删除来源清单
    await removeAllWhere(INVITES, { groupId: sid })
    await db.collection(GROUPS).doc(sid).remove()
  }

  const group = await findGroupById(targetGroupId)
  return ok({
    group: toGroupView(group, targetMember),
    mergedShops,
    mergedFolders,
  })
}

// ---------- router ----------

const actions = {
  bootstrap,
  getPublicGroup,
  createGroup,
  listMyGroups,
  updateGroup,
  createInvite,
  previewInvite,
  acceptInvite,
  revokeInvite,
  createInviteQrCode,
  listMembers,
  updateMyDisplayName,
  removeMember,
  deleteGroup,
  listFolders,
  listPublicFolders,
  createFolder,
  updateFolder,
  deleteFolder,
  assignUncategorizedShops,
  mergeGroups,
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
    console.error(`groupApi.${action} error`, err && err.message ? err.message : sanitizeForLog())
    return fail('服务异常，请重试', 'INTERNAL')
  }
}
