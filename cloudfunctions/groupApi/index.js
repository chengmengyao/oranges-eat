const cloud = require('wx-server-sdk')
const crypto = require('crypto')
const { evaluateInvite } = require('./invite')
const { ensurePersistentShortCode } = require('./invite-code')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate

const GROUPS = 'groups'
const MEMBERS = 'members'
const INVITES = 'invites'
const SHOPS = 'shops'

const INVITE_DEFAULT_DAYS = 7
const INVITE_DEFAULT_MAX_USES = 50

const COLLECTION_NAMES = [GROUPS, MEMBERS, INVITES]
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
  // 创建者显示名称选填，缺省时使用清单名称
  const displayName = normalizeText(event.displayName, 20) || groupName

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
  const existing = await findMember(groupId, openId)
  if (existing) {
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

    const memberCount = await countActiveMembers(groupId)
    if (memberCount >= freshInvite.maxUses) {
      await transaction.rollback().catch(() => {})
      return fail('邀请人数已满', 'INVITE_FULL')
    }

    const now = Date.now()
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
    console.error('acceptInvite failed', sanitizeForLog())
    return fail('加入失败，请重试', 'ACCEPT_FAILED')
  }
}

async function revokeInvite(event, openId) {
  const groupId = normalizeText(event.groupId, 64)
  if (!groupId) return fail('参数不完整', 'INVALID_PARAM')
  const member = await findMember(groupId, openId)
  if (!member || member.role !== 'owner') {
    return fail('只有创建者可以撤销邀请', 'FORBIDDEN')
  }
  await db
    .collection(INVITES)
    .where({ groupId, status: 'active' })
    .update({ data: { status: 'revoked' } })
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

  const member = await findMember(groupId, openId)
  if (!member || member.role !== 'owner') {
    return fail('只有创建者可以删除清单', 'FORBIDDEN')
  }
  const group = await findGroupById(groupId)
  if (!group) return fail('清单不存在', 'GROUP_NOT_FOUND')

  // 级联删除：groups 文档 + 全部成员、邀请、店铺
  await Promise.all([
    db.collection(GROUPS).doc(groupId).remove().catch(() => {}),
    db.collection(MEMBERS).where({ groupId }).remove().catch(() => {}),
    db.collection(INVITES).where({ groupId }).remove().catch(() => {}),
    db.collection(SHOPS).where({ groupId }).remove().catch(() => {}),
  ])
  return ok({ deleted: true })
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
  removeMember,
  deleteGroup,
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
