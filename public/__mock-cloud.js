/* H5 自动化测试专用 Mock 云（勿用于生产，勿提交）
 * 在 window 加载早期注入，模拟 wx.cloud 内存数据库。
 * localStorage key: __mock_db ；身份: __mockact = a|b|c
 */
;(function () {
  if (window.__mockCloudInstalled) return
  window.__mockCloudInstalled = true

  var ACTS = { a: { id: 'oA', name: '橙子A' }, b: { id: 'oB', name: '小满B' }, c: { id: 'oC', name: '访客C' } }
  function act() {
    return ACTS[localStorage.getItem('__mockact') || 'a'] || ACTS.a
  }
  function id36() {
    return Math.random().toString(36).slice(2, 10)
  }
  function now() {
    return Date.now()
  }
  var DAY = 24 * 3600 * 1000

  function seed() {
    var groups = []
    var members = []
    var folders = []
    var shops = []
    var invites = []
    function g(id, name, owner) {
      groups.push({ id: id, publicId: 'pub_' + id, name: name, ownerOpenId: owner, visibility: 'public_read', status: 'active', createdAt: now() - 1000, updatedAt: now() - 1000 })
      members.push({ id: id + ':o' + owner.slice(1), groupId: id, userOpenId: owner, displayName: ACTS[owner === 'oA' ? 'a' : owner === 'oB' ? 'b' : 'c'].name, role: 'owner', status: 'active', joinedAt: now() - 1000 })
    }
    function folder(gid, name, sort) {
      var f = { id: gid + '_f' + folders.length, groupId: gid, name: name, sortOrder: sort, createdByOpenId: 'oA', createdAt: now(), updatedAt: now() }
      folders.push(f)
      return f.id
    }
    function shop(folderId, name, cat, by, addr) {
      shops.push({ id: 's' + (shops.length + 1), groupId: groups[groups.length - 1].id, folderId: folderId, requestId: null, name: name, category: cat, latitude: 39.9 + Math.random(), longitude: 116.3 + Math.random(), address: addr || name + '地址', remark: '', createdByOpenId: by, createdByName: ACTS[by === 'oA' ? 'a' : 'b'].name, createdAt: now(), updatedAt: now() })
    }

    g('g1', '周末吃喝地图', 'oA')
    var bj = folder('g1', '北京', 1)
    var sh = folder('g1', '上海', 2)
    shop(bj, '胡同烤鸭', 'restaurant', 'oA', '东城区××胡同')
    shop(bj, '梨山乌龙', 'milktea', 'oB', '朝阳区××街')
    shop(sh, '奶油蛋糕店', 'cake', 'oA', '静安区××路')
    shop(null, '未分类小面馆', 'restaurant', 'oA', '海淀区××巷')
    members.push({ id: 'g1:oB', groupId: 'g1', userOpenId: 'oB', displayName: '小满B', role: 'member', status: 'active', joinedAt: now() - 500 })
    invites.push({ id: 'i1', token: 'tok1', groupId: 'g1', status: 'active', expiresAt: now() + 7 * DAY, maxUses: 50, usedCount: 0, createdByOpenId: 'oA', createdAt: now() })

    g('g2', '年度出差探店', 'oB')
    var cd = folder('g2', '成都', 1)
    shops.push({ id: 's5', groupId: 'g2', folderId: cd, requestId: null, name: '成都火锅', category: 'restaurant', latitude: 30.6 + Math.random(), longitude: 104.0 + Math.random(), address: '成都××路', remark: '', createdByOpenId: 'oB', createdByName: '小满B', createdAt: now(), updatedAt: now() })
    invites.push({ id: 'i2', token: 'tok2', groupId: 'g2', status: 'active', expiresAt: now() + 7 * DAY, maxUses: 50, usedCount: 0, createdByOpenId: 'oB', createdAt: now() })

    g('g3', '环球玩家榜单', 'oC')
    var xa = folder('g3', '西安', 1)
    shops.push({ id: 's6', groupId: 'g3', folderId: xa, requestId: null, name: '长安大排档', category: 'restaurant', latitude: 34.2 + Math.random(), longitude: 108.9 + Math.random(), address: '西安××街', remark: '', createdByOpenId: 'oC', createdByName: '访客C', createdAt: now(), updatedAt: now() })
    return { seq: 100, groups: groups, members: members, folders: folders, shops: shops, invites: invites }
  }

  function db() {
    var raw = localStorage.getItem('__mock_db')
    if (raw) {
      try {
        return JSON.parse(raw)
      } catch (e) {}
    }
    var d = seed()
    save(d)
    return d
  }
  function save(d) {
    localStorage.setItem('__mock_db', JSON.stringify(d))
  }

  function memberOf(d, groupId, openId) {
    var m = null
    for (var i = 0; i < d.members.length; i++) {
      var x = d.members[i]
      if (x.groupId === groupId && x.userOpenId === openId && x.status === 'active') m = x
    }
    return m
  }
  function groupById(d, id) {
    for (var i = 0; i < d.groups.length; i++) if (d.groups[i].id === id) return d.groups[i]
    return null
  }
  function groupByPublic(d, pid) {
    for (var i = 0; i < d.groups.length; i++) if (d.groups[i].publicId === pid) return d.groups[i]
    return null
  }
  function shopsOf(d, gid) {
    var out = []
    for (var i = 0; i < d.shops.length; i++) if (d.shops[i].groupId === gid) out.push(d.shops[i])
    return out
  }
  function folderCounts(d, gid) {
    var map = {}
    var un = 0
    var list = shopsOf(d, gid)
    for (var i = 0; i < list.length; i++) {
      var f = list[i].folderId
      if (!f) un++
      else map[f] = (map[f] || 0) + 1
    }
    return { map: map, un: un }
  }
  function sortShops(list) {
    list.sort(function (x, y) {
      return y.updatedAt - x.updatedAt || (x.id < y.id ? 1 : -1)
    })
    return list
  }
  function buildCursor(item) {
    return btoa(JSON.stringify({ updatedAt: item.updatedAt, id: item.id }))
  }
  function parseCursor(c) {
    if (!c) return null
    try {
      return JSON.parse(atob(c))
    } catch (e) {
      return null
    }
  }
  function filterShops(d, gid, category, folderId, cursor, limit) {
    var where = shopsOf(d, gid)
    if (category && category !== 'all') where = where.filter(function (s) { return s.category === category })
    if (folderId === 'none') where = where.filter(function (s) { return !s.folderId })
    else if (folderId && folderId !== 'all') where = where.filter(function (s) { return s.folderId === folderId })
    where = sortShops(where)
    if (cursor) {
      var cd = parseCursor(cursor)
      if (cd) where = where.filter(function (s) { return s.updatedAt < cd.updatedAt || (s.updatedAt === cd.updatedAt && s.id < cd.id) })
    }
    var cap = Math.min(Math.max(1, limit || 20), 20)
    var page = where.slice(0, cap)
    var hasMore = where.length > cap
    return { list: page, hasMore: hasMore, next: hasMore ? buildCursor(page[page.length - 1]) : null }
  }
  function toPublicView(s) {
    return { id: s.id, folderId: s.folderId, name: s.name, category: s.category, latitude: s.latitude, longitude: s.longitude, address: s.address, remark: s.remark, createdAt: s.createdAt, updatedAt: s.updatedAt }
  }
  function toShopView(s, selfId, isOwner) {
    var mine = s.createdByOpenId === selfId
    return { id: s.id, folderId: s.folderId, name: s.name, category: s.category, latitude: s.latitude, longitude: s.longitude, address: s.address, remark: s.remark, creatorName: s.createdByName, isMine: mine, canEdit: mine || isOwner, canDelete: mine || isOwner, createdAt: s.createdAt, updatedAt: s.updatedAt }
  }
  function toGroupView(g, me) {
    return { id: g.id, publicId: g.publicId, name: g.name, role: me.role, updatedAt: g.updatedAt, isOwner: me.role === 'owner' }
  }
  function preview(d, invite, me) {
    var g = groupById(d, invite.groupId)
    var inv = invite.status === 'revoked' ? 'revoked' : invite.expiresAt < now() ? 'expired' : invite.usedCount >= invite.maxUses ? 'used-up' : 'valid'
    var memberCount = 0
    for (var i = 0; i < d.members.length; i++) if (d.members[i].groupId === g.id && d.members[i].status === 'active') memberCount++
    return { publicId: g.publicId, name: g.name, memberCount: memberCount, inviteStatus: inv, inviteExpiresAt: new Date(invite.expiresAt), inviteRemainingUses: Math.max(0, invite.maxUses - invite.usedCount), alreadyMember: !!me }
  }
  function fail(error, code) {
    return { ok: false, error: error, code: code || 'ERROR' }
  }
  function ok(data) {
    return { ok: true, data: data }
  }

  var actions = {
    // ---------------- groupApi ----------------
    bootstrap: function (d, me) {
      return ok({ hasGroups: myGroupsOf(d, me.id).length > 0 })
    },
    createGroup: function (d, me, ev) {
      var name = (ev.groupName || '').trim().slice(0, 30)
      var dn = (ev.displayName || '').trim().slice(0, 20)
      if (!name) return fail('请输入清单名称', 'INVALID_PARAM')
      if (!dn) return fail('请输入你的名称', 'INVALID_PARAM')
      var id = 'g' + (d.seq++)
      var g = { id: id, publicId: 'pub_' + id, name: name, ownerOpenId: me.id, visibility: 'public_read', status: 'active', createdAt: now(), updatedAt: now() }
      d.groups.push(g)
      d.members.push({ id: id + ':' + me.id.slice(1), groupId: id, userOpenId: me.id, displayName: dn, role: 'owner', status: 'active', joinedAt: now() })
      save(d)
      var self = memberOf(d, id, me.id)
      return ok({ group: toGroupView(g, self) })
    },
    listMyGroups: function (d, me) {
      var out = myGroupsOf(d, me.id).map(function (m) {
        return toGroupView(groupById(d, m.groupId), m)
      })
      return ok(out)
    },
    updateGroup: function (d, me, ev) {
      var g = groupById(d, ev.groupId)
      if (!g || !memberOf(d, g.id, me.id)) return fail('未加入该清单', 'FORBIDDEN')
      var name = (ev.name || '').trim().slice(0, 30)
      if (!name) return fail('请输入清单名称', 'INVALID_PARAM')
      g.name = name
      g.updatedAt = now()
      save(d)
      return ok({ updatedAt: g.updatedAt })
    },
    deleteGroup: function (d, me, ev) {
      var g = groupById(d, ev.groupId)
      if (!g) return fail('清单不存在', 'GROUP_NOT_FOUND')
      var m = memberOf(d, g.id, me.id)
      if (!m || m.role !== 'owner') return fail('仅创建者可删除清单', 'FORBIDDEN')
      d.groups = d.groups.filter(function (x) { return x.id !== g.id })
      d.members = d.members.filter(function (x) { return x.groupId !== g.id })
      d.folders = d.folders.filter(function (x) { return x.groupId !== g.id })
      d.shops = d.shops.filter(function (x) { return x.groupId !== g.id })
      d.invites = d.invites.filter(function (x) { return x.groupId !== g.id })
      save(d)
      return ok({ deleted: true })
    },
    createInvite: function (d, me, ev) {
      var g = groupById(d, ev.groupId)
      if (!g || !memberOf(d, g.id, me.id)) return fail('未加入该清单', 'FORBIDDEN')
      var id = 'i' + (d.seq++)
      var token = 'tok_' + id + '_' + id36()
      var inv = { id: id, token: token, groupId: g.id, status: 'active', expiresAt: now() + 7 * DAY, maxUses: 50, usedCount: 0, createdByOpenId: me.id, createdAt: now() }
      d.invites = d.invites.filter(function (x) { return !(x.groupId === g.id && x.status === 'active') })
      d.invites.push(inv)
      save(d)
      return ok({ token: token, shortCode: token, expiresAt: inv.expiresAt, remainingUses: 50 })
    },
    createInviteQrCode: function (d, me, ev) {
      var inv = findInvite(d, ev.token || ev.code)
      if (!inv) return fail('邀请不存在', 'INVITE_NOT_FOUND')
      var g = groupById(d, inv.groupId)
      return ok({ fileID: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', publicId: g.publicId, name: g.name })
    },
    previewInvite: function (d, me, ev) {
      var inv = findInvite(d, ev.token || ev.code)
      if (!inv) return ok(null)
      var self = memberOf(d, inv.groupId, me.id)
      return ok(preview(d, inv, self))
    },
    acceptInvite: function (d, me, ev) {
      var inv = findInvite(d, ev.token || ev.code)
      if (!inv) return fail('邀请不存在或已失效', 'INVITE_NOT_FOUND')
      if (inv.status === 'revoked') return fail('邀请已撤销', 'INVITE_REVOKED')
      if (inv.expiresAt < now()) return fail('邀请已过期', 'INVITE_EXPIRED')
      if (inv.usedCount >= inv.maxUses) return fail('邀请次数已用完', 'INVITE_USED_UP')
      var dn = (ev.displayName || '').trim().slice(0, 20)
      if (!dn) return fail('请输入你的名称', 'INVALID_PARAM')
      var exist = memberOf(d, inv.groupId, me.id)
      if (exist) return ok(preview(d, inv, exist))
      d.members.push({ id: inv.groupId + ':' + me.id.slice(1), groupId: inv.groupId, userOpenId: me.id, displayName: dn, role: 'member', status: 'active', joinedAt: now() })
      inv.usedCount++
      save(d)
      return ok(preview(d, inv, { id: me.id }))
    },
    revokeInvite: function (d, me, ev) {
      var g = groupById(d, ev.groupId)
      if (!g) return fail('清单不存在', 'GROUP_NOT_FOUND')
      for (var i = 0; i < d.invites.length; i++) if (d.invites[i].groupId === g.id && d.invites[i].status === 'active') d.invites[i].status = 'revoked'
      save(d)
      return ok({ revoked: true })
    },
    listMembers: function (d, me, ev) {
      var g = groupById(d, ev.groupId)
      if (!g || !memberOf(d, g.id, me.id)) return fail('未加入该清单', 'FORBIDDEN')
      var out = []
      for (var i = 0; i < d.members.length; i++) {
        var m = d.members[i]
        if (m.groupId === g.id && m.status === 'active') out.push({ id: m.id, displayName: m.displayName, role: m.role, status: m.status, joinedAt: new Date(m.joinedAt), isSelf: m.userOpenId === me.id })
      }
      return ok(out)
    },
    updateMyDisplayName: function (d, me, ev) {
      var g = groupById(d, ev.groupId)
      if (!g) return fail('清单不存在', 'GROUP_NOT_FOUND')
      var m = memberOf(d, g.id, me.id)
      if (!m) return fail('未加入该清单', 'FORBIDDEN')
      var dn = (ev.displayName || '').trim().slice(0, 20)
      if (!dn) return fail('请输入名称', 'INVALID_PARAM')
      m.displayName = dn
      for (var i = 0; i < d.shops.length; i++) if (d.shops[i].groupId === g.id && d.shops[i].createdByOpenId === me.id) d.shops[i].createdByName = dn
      save(d)
      return ok({ displayName: dn, updatedShops: 0 })
    },
    removeMember: function (d, me, ev) {
      var g = groupById(d, ev.groupId)
      if (!g) return fail('清单不存在', 'GROUP_NOT_FOUND')
      var self = memberOf(d, g.id, me.id)
      if (!self || self.role !== 'owner') return fail('仅创建者可移除成员', 'FORBIDDEN')
      for (var i = 0; i < d.members.length; i++) {
        var m = d.members[i]
        if (m.id === ev.memberId) {
          if (m.role === 'owner') return fail('不能移除创建者', 'FORBIDDEN')
          m.status = 'removed'
        }
      }
      save(d)
      return ok({ removed: true })
    },
    listFolders: function (d, me, ev) {
      return ok(foldersPayload(d, ev.groupId, true))
    },
    listPublicFolders: function (d, me, ev) {
      var g = groupByPublic(d, ev.publicId)
      if (!g || g.visibility !== 'public_read' || g.status !== 'active') return fail('清单不存在或不可访问', 'GROUP_NOT_FOUND')
      return ok(foldersPayload(d, g.id, false))
    },
    createFolder: function (d, me, ev) {
      var g = groupById(d, ev.groupId)
      if (!g || !memberOf(d, g.id, me.id)) return fail('加入清单后才能创建城市', 'FORBIDDEN')
      var name = (ev.name || '').trim().slice(0, 30)
      if (!name) return fail('请输入城市名', 'INVALID_PARAM')
      var maxSort = 0
      for (var i = 0; i < d.folders.length; i++) if (d.folders[i].groupId === g.id) maxSort = Math.max(maxSort, d.folders[i].sortOrder)
      var f = { id: g.id + '_f' + (d.seq++), groupId: g.id, name: name, sortOrder: maxSort + 1, createdByOpenId: me.id, createdAt: now(), updatedAt: now() }
      d.folders.push(f)
      save(d)
      return ok(folderView(d, f))
    },
    updateFolder: function (d, me, ev) {
      var f = folderById(d, ev.folderId)
      if (!f) return fail('城市不存在', 'FOLDER_NOT_FOUND')
      if (!memberOf(d, f.groupId, me.id)) return fail('未加入该清单', 'FORBIDDEN')
      var name = (ev.name || '').trim().slice(0, 30)
      if (!name) return fail('请输入城市名', 'INVALID_PARAM')
      f.name = name
      f.updatedAt = now()
      save(d)
      return ok({ updatedAt: f.updatedAt })
    },
    deleteFolder: function (d, me, ev) {
      var f = folderById(d, ev.folderId)
      if (!f) return fail('城市不存在', 'FOLDER_NOT_FOUND')
      if (!memberOf(d, f.groupId, me.id)) return fail('未加入该清单', 'FORBIDDEN')
      d.folders = d.folders.filter(function (x) { return x.id !== f.id })
      for (var i = 0; i < d.shops.length; i++) if (d.shops[i].folderId === f.id) d.shops[i].folderId = null
      save(d)
      return ok({ deleted: true })
    },
    assignUncategorizedShops: function (d, me, ev) {
      var g = groupById(d, ev.groupId)
      if (!g || !memberOf(d, g.id, me.id)) return fail('未加入该清单', 'FORBIDDEN')
      var folderId = ev.folderId || null
      if (ev.folderName) {
        var f = createFolderInner(d, g.id, ev.folderName, me.id)
        folderId = f.id
      }
      var updated = 0
      for (var i = 0; i < d.shops.length; i++) {
        var s = d.shops[i]
        if (s.groupId === g.id && !s.folderId) {
          s.folderId = folderId
          updated++
        }
      }
      save(d)
      return ok({ updated: updated, folderId: folderId })
    },
    mergeGroups: function (d, me) {
      return fail('功能未实现', 'NOT_IMPLEMENTED')
    },

    // ---------------- shopApi ----------------
    listPublicShops: function (d, me, ev) {
      var g = groupByPublic(d, ev.publicId)
      if (!g || g.visibility !== 'public_read' || g.status !== 'active') return fail('清单不存在或不可访问', 'GROUP_NOT_FOUND')
      var r = filterShops(d, g.id, ev.category, ev.folderId, ev.cursor, ev.limit)
      return ok({ shops: r.list.map(toPublicView), hasMore: r.hasMore, nextCursor: r.next })
    },
    listPublicMapShops: function (d, me, ev) {
      var g = groupByPublic(d, ev.publicId)
      if (!g || g.visibility !== 'public_read' || g.status !== 'active') return fail('清单不存在或不可访问', 'GROUP_NOT_FOUND')
      return ok(sortShops(shopsOf(d, g.id)).map(toPublicView))
    },
    listMemberShops: function (d, me, ev) {
      var g = groupById(d, ev.groupId)
      if (!g) return fail('清单不存在', 'GROUP_NOT_FOUND')
      var m = memberOf(d, g.id, me.id)
      if (!m) return fail('未加入该清单', 'FORBIDDEN')
      var r = filterShops(d, g.id, ev.category, ev.folderId, ev.cursor, ev.limit)
      var isOwner = m.role === 'owner'
      return ok({ shops: r.list.map(function (s) { return toShopView(s, me.id, isOwner) }), hasMore: r.hasMore, nextCursor: r.next })
    },
    listMemberMapShops: function (d, me, ev) {
      var g = groupById(d, ev.groupId)
      if (!g) return fail('清单不存在', 'GROUP_NOT_FOUND')
      var m = memberOf(d, g.id, me.id)
      if (!m) return fail('未加入该清单', 'FORBIDDEN')
      var isOwner = m.role === 'owner'
      return ok(sortShops(shopsOf(d, g.id)).map(function (s) { return toShopView(s, me.id, isOwner) }))
    },
    createShop: function (d, me, ev) {
      var g = groupById(d, ev.groupId)
      if (!g) return fail('清单不存在', 'GROUP_NOT_FOUND')
      var m = memberOf(d, g.id, me.id)
      if (!m) return fail('请先加入清单再添加店铺', 'FORBIDDEN')
      if (ev.requestId) {
        var dup = shopsOf(d, g.id).filter(function (x) { return x.requestId === ev.requestId })
        if (dup.length) return ok(toShopView(dup[0], me.id, m.role === 'owner'))
      }
      var id = 's' + (d.seq++)
      var s = { id: id, groupId: g.id, folderId: ev.folderId || null, requestId: ev.requestId || null, name: (ev.name || '').trim(), category: ev.category || 'restaurant', latitude: ev.latitude, longitude: ev.longitude, address: ev.address || '', remark: ev.remark || '', createdByOpenId: me.id, createdByName: m.displayName, createdAt: now(), updatedAt: now() }
      d.shops.push(s)
      save(d)
      return ok(toShopView(s, me.id, m.role === 'owner'))
    },
    updateShop: function (d, me, ev) {
      var s = shopById(d, ev.shopId)
      if (!s) return fail('店铺不存在', 'SHOP_NOT_FOUND')
      var targetGid = ev.targetGroupId || s.groupId
      var g = groupById(d, targetGid)
      if (!g) return fail('清单不存在', 'GROUP_NOT_FOUND')
      var m = memberOf(d, s.groupId, me.id)
      var tm = memberOf(d, targetGid, me.id)
      if (!m || !tm) return fail('请先加入清单', 'FORBIDDEN')
      var isOwner = m.role === 'owner'
      var mine = s.createdByOpenId === me.id
      if (!isOwner && !mine) return fail('只能编辑自己添加的店铺', 'FORBIDDEN')
      if (ev.targetGroupId && ev.targetGroupId !== s.groupId) {
        var fl = folderById(d, ev.folderId || null)
        if (ev.folderId && (!fl || fl.groupId !== targetGid)) return fail('所选城市不存在或不属于该清单', 'FOLDER_NOT_FOUND')
      } else if (ev.folderId) {
        var fl2 = folderById(d, ev.folderId)
        if (!fl2 || fl2.groupId !== targetGid) return fail('所选城市不存在或不属于该清单', 'FOLDER_NOT_FOUND')
      }
      s.groupId = targetGid
      s.folderId = ev.folderId === undefined ? s.folderId : ev.folderId
      s.name = ev.name !== undefined ? ev.name : s.name
      s.category = ev.category !== undefined ? ev.category : s.category
      s.latitude = ev.latitude !== undefined ? ev.latitude : s.latitude
      s.longitude = ev.longitude !== undefined ? ev.longitude : s.longitude
      s.address = ev.address !== undefined ? ev.address : s.address
      s.remark = ev.remark !== undefined ? ev.remark : s.remark
      s.updatedAt = now()
      save(d)
      var tm2 = memberOf(d, s.groupId, me.id) || m
      return ok(Object.assign(toShopView(s, me.id, tm2.role === 'owner'), { moved: Boolean(ev.targetGroupId && ev.targetGroupId !== ev.groupId) }))
    },
    deleteShop: function (d, me, ev) {
      var s = shopById(d, ev.shopId)
      if (!s) return fail('店铺不存在', 'SHOP_NOT_FOUND')
      var m = memberOf(d, s.groupId, me.id)
      if (!m) return fail('请先加入清单', 'FORBIDDEN')
      if (m.role !== 'owner' && s.createdByOpenId !== me.id) return fail('只能删除自己添加的店铺', 'FORBIDDEN')
      d.shops = d.shops.filter(function (x) { return x.id !== s.id })
      save(d)
      return ok({ deleted: true })
    }
  }

  // ---------- helpers ----------
  function myGroupsOf(d, openId) {
    return d.members.filter(function (m) { return m.userOpenId === openId && m.status === 'active' })
  }
  function folderById(d, id) {
    if (!id) return null
    for (var i = 0; i < d.folders.length; i++) if (d.folders[i].id === id) return d.folders[i]
    return null
  }
  function folderView(d, f) {
    var c = folderCounts(d, f.groupId)
    return { id: f.id, name: f.name, sortOrder: f.sortOrder, shopCount: c.map[f.id] || 0 }
  }
  function createFolderInner(d, gid, name, openId) {
    var maxSort = 0
    for (var i = 0; i < d.folders.length; i++) if (d.folders[i].groupId === gid) maxSort = Math.max(maxSort, d.folders[i].sortOrder)
    var f = { id: gid + '_f' + (d.seq++), groupId: gid, name: name, sortOrder: maxSort + 1, createdByOpenId: openId, createdAt: now(), updatedAt: now() }
    d.folders.push(f)
    return f
  }
  function foldersPayload(d, gid, withShops) {
    var fs = d.folders.filter(function (x) { return x.groupId === gid }).sort(function (a, b) { return a.sortOrder - b.sortOrder })
    var counts = folderCounts(d, gid)
    var view = fs.map(function (f) {
      var o = { id: f.id, name: f.name, sortOrder: f.sortOrder }
      if (withShops) o.shopCount = counts.map[f.id] || 0
      return o
    })
    return { folders: view, uncategorizedCount: counts.un }
  }
  function shopById(d, id) {
    for (var i = 0; i < d.shops.length; i++) if (d.shops[i].id === id) return d.shops[i]
    return null
  }
  function findInvite(d, token) {
    if (!token) return null
    for (var i = 0; i < d.invites.length; i++) if (d.invites[i].token === token || d.invites[i].shortCode === token) return d.invites[i]
    var hashed = null
    try {
      hashed = token.indexOf('tok_') === 0 ? token : null
    } catch (e) {}
    for (var j = 0; j < d.invites.length; j++) if (hashed && d.invites[j].token === hashed) return d.invites[j]
    return null
  }

  function dispatch(name, ev, me) {
    var d = db()
    var fn = actions[ev.action]
    if (!fn) return { ok: false, error: '未知操作', code: 'UNKNOWN_ACTION' }
    return fn(d, me, ev)
  }

  var cloud = {
    init: function () {},
    callFunction: function (opts) {
      return new Promise(function (resolve) {
        setTimeout(function () {
          var me = act()
          var result = dispatch(opts.name, opts.data || {}, me)
          resolve({ result: result })
        }, 60)
      })
    },
    downloadFile: function (opts) {
      return new Promise(function (resolve) {
        setTimeout(function () {
          resolve({ tempFilePath: opts.fileID })
        }, 20)
      })
    }
  }

  // 注入 window.wx.cloud；uni-h5 运行时会整体重写 window.wx，故用访问器在每次赋值后兜底补齐
  var __mockWx = window.wx || {}
  __mockWx.cloud = cloud
  try {
    Object.defineProperty(window, 'wx', {
      configurable: true,
      enumerable: true,
      get: function () {
        return __mockWx
      },
      set: function (v) {
        __mockWx = v || {}
        try {
          if (v) v.cloud = cloud
        } catch (e) {}
      }
    })
  } catch (e) {}
  window.__mockCloudReady = true
  window.__mockReset = function () {
    localStorage.removeItem('__mock_db')
    localStorage.removeItem('currentGroupId')
    localStorage.removeItem('recentPublicGroup')
  }
  window.__mockAct = function (who) {
    localStorage.setItem('__mockact', who)
    localStorage.removeItem('currentGroupId')
    localStorage.removeItem('recentPublicGroup')
  }
})()
