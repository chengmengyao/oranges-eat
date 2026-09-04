<script setup lang="ts">
import { computed, ref } from 'vue'
import { onShow, onShareAppMessage } from '@dcloudio/uni-app'
import type { FolderView, GroupView, MemberView } from '@/types/group'
import {
  createGroup,
  listMyGroups,
  listMembers,
  createInvite,
  createInviteQrCode,
  revokeInvite,
  updateMyDisplayName,
  removeMember,
  deleteGroup,
  updateGroupName,
  listFolders,
  createFolder,
  updateFolder,
  deleteFolder,
  assignUncategorizedShops,
} from '@/services/group'
import { useGroupStore } from '@/stores/group'
import { resolveMapGroup } from '@/utils/map-group'
import { getCloudInitState, downloadFile } from '@/utils/cloud'
import { hideLoading, showLoading } from '@/utils/global-loading'

const store = useGroupStore()

const state = getCloudInitState()
const groups = ref<GroupView[]>([])
const currentGroupId = ref('')
const members = ref<MemberView[]>([])
const currentGroup = ref<GroupView | null>(null)
// 全局当前清单是否落在公开(访客)清单上：此时 Home 展示只读浏览卡而非成员管理
const viewingPublic = ref(false)
const viewingPublicName = ref('')

const createMode = ref(false)
const groupName = ref('')
const displayName = ref('')
const creating = ref(false)

const inviteToken = ref('')
const inviteShortCode = ref('')
const inviteExpiresAt = ref(0)
const inviteRemaining = ref(0)
const generatingInvite = ref(false)
const showingInvite = ref(false)
const qrCodeFileId = ref('')
const qrCodeLoading = ref(false)
const qrCodeError = ref('')
const shareMessage = ref({ title: '', path: '' })

const loadingMembers = ref(false)
const removing = ref(false)
const updatingMyName = ref(false)
const deleting = ref(false)

const folders = ref<FolderView[]>([])
const uncategorizedCount = ref(0)
const loadingFolders = ref(false)
const creatingFolder = ref(false)
const renamingFolder = ref(false)
const removingFolder = ref(false)
const assigningUncategorized = ref(false)

const cloudMissing = ref(!state.ready)
const recentPublicGroup = ref(store.getRecentPublicGroup())
const initialLoaded = ref(false)

const heroName = computed(() => currentGroup.value?.name || groups.value[0]?.name || '')
const totalShops = computed(() => {
  const fromFolders = folders.value.reduce((sum, f) => sum + (f.shopCount || 0), 0)
  return fromFolders + uncategorizedCount.value
})

function initialOf(name: string) {
  return (name || '?').trim().charAt(0) || '?'
}

function openGroupSwitcher() {
  const names = groups.value.map((g) => g.name)
  if (names.length <= 1) return
  uni.showActionSheet({
    itemList: names,
    success: (res) => {
      const g = groups.value[res.tapIndex]
      if (g) switchGroup(g.id)
    },
  })
}

function confirmEditCurrentGroup() {
  if (currentGroup.value) confirmEditGroup(currentGroup.value)
}

function confirmDeleteCurrentGroup() {
  if (currentGroup.value) confirmDeleteGroup(currentGroup.value)
}

function loadGroups() {
  return listMyGroups().then((list) => {
    const previousGroupId = currentGroupId.value
    groups.value = list
    store.setGroups(list)
    const selection = resolveMapGroup(groups.value, store.state.view, store.getRecentPublicGroup())
    if (selection.isMember && selection.group) {
      currentGroupId.value = selection.group.id
      currentGroup.value = selection.group
      viewingPublic.value = false
      viewingPublicName.value = ''
      if (previousGroupId !== currentGroupId.value) {
        members.value = []
        folders.value = []
        uncategorizedCount.value = 0
      }
    } else {
      // 全局当前落在公开(访客)清单上：不做成员管理，展示只读浏览卡
      currentGroupId.value = ''
      currentGroup.value = null
      members.value = []
      folders.value = []
      uncategorizedCount.value = 0
      viewingPublic.value = Boolean(selection.group)
      viewingPublicName.value = selection.group?.name || ''
    }
  })
}

let memberReqSeq = 0

async function loadMembers() {
  if (!currentGroupId.value) return
  const seq = ++memberReqSeq
  const groupId = currentGroupId.value
  loadingMembers.value = true
  try {
    const list = await listMembers(groupId)
    if (seq !== memberReqSeq || currentGroupId.value !== groupId) return
    members.value = list
  } catch {
    if (seq !== memberReqSeq || currentGroupId.value !== groupId) return
    members.value = []
  } finally {
    if (seq === memberReqSeq) loadingMembers.value = false
  }
}

let folderReqSeq = 0

async function loadFolders() {
  if (!currentGroupId.value) return
  const seq = ++folderReqSeq
  const groupId = currentGroupId.value
  loadingFolders.value = true
  try {
    const res = await listFolders(groupId)
    if (seq !== folderReqSeq || currentGroupId.value !== groupId) return
    folders.value = res.folders
    uncategorizedCount.value = res.uncategorizedCount
    store.setFolders(folders.value)
  } catch {
    if (seq !== folderReqSeq || currentGroupId.value !== groupId) return
    folders.value = []
    uncategorizedCount.value = 0
  } finally {
    if (seq === folderReqSeq) loadingFolders.value = false
  }
}

function openCreateFolder() {
  uni.showModal({
    title: '新建城市子清单',
    content: '',
    editable: true,
    placeholderText: '城市名（如：北京）',
    confirmText: '创建',
    confirmColor: '#36393B',
    success: async (res) => {
      if (!res.confirm || !currentGroupId.value) return
      const name = (res.content || '').trim()
      if (!name) {
        uni.showToast({ title: '请输入城市名', icon: 'none' })
        return
      }
      if (name.length > 30) {
        uni.showToast({ title: '城市名不能超过 30 字', icon: 'none' })
        return
      }
      creatingFolder.value = true
      try {
        await createFolder(currentGroupId.value, name)
        await loadFolders()
        store.markDataChanged()
        uni.showToast({ title: '已创建', icon: 'success' })
      } catch (err) {
        uni.showToast({ title: err instanceof Error ? err.message : '创建失败', icon: 'none' })
      } finally {
        creatingFolder.value = false
      }
    },
  })
}

function confirmEditFolder(f: FolderView) {
  uni.showModal({
    title: '修改城市名',
    editable: true,
    placeholderText: f.name,
    confirmText: '保存',
    confirmColor: '#36393B',
    success: async (res) => {
      if (!res.confirm) return
      const name = (res.content || '').trim()
      if (!name) {
        uni.showToast({ title: '请输入城市名', icon: 'none' })
        return
      }
      if (name === f.name) return
      renamingFolder.value = true
      try {
        await updateFolder(f.id, name)
        await loadFolders()
        store.markDataChanged()
        uni.showToast({ title: '已修改', icon: 'success' })
      } catch (err) {
        uni.showToast({ title: err instanceof Error ? err.message : '修改失败', icon: 'none' })
      } finally {
        renamingFolder.value = false
      }
    },
  })
}

function confirmDeleteFolder(f: FolderView) {
  uni.showModal({
    title: '删除城市',
    content: `确认删除「${f.name}」？该城市下的地点会保留并归为未分类。`,
    confirmText: '删除',
    confirmColor: '#36393B',
    success: async (res) => {
      if (!res.confirm) return
      removingFolder.value = true
      try {
        await deleteFolder(f.id)
        await loadFolders()
        store.markDataChanged()
        uni.showToast({ title: '已删除', icon: 'none' })
      } catch (err) {
        uni.showToast({ title: err instanceof Error ? err.message : '删除失败', icon: 'none' })
      } finally {
        removingFolder.value = false
      }
    },
  })
}

function openAssignUncategorized() {
  const folderOptions = folders.value
    .map((f) => ({ id: f.id, name: f.name }))
  uni.showActionSheet({
    itemList: [...folderOptions.map((f) => f.name), '新建城市…'],
    success: async (res) => {
      const idx = res.tapIndex
      const groupId = currentGroupId.value
      if (!groupId) return
      let payload: { folderId?: string; folderName?: string } = {}
      if (idx < folderOptions.length) {
        payload = { folderId: folderOptions[idx].id }
      } else {
        const r = await uni.showModal({
          title: '新建城市',
          editable: true,
          placeholderText: '城市名（如：北京）',
        })
        if (!r.confirm) return
        const name = (r.content || '').trim()
        if (!name) {
          uni.showToast({ title: '请输入城市名', icon: 'none' })
          return
        }
        payload = { folderName: name.slice(0, 30) }
      }
      assigningUncategorized.value = true
      try {
        const result = await assignUncategorizedShops({ groupId, ...payload })
        await loadFolders()
        store.markDataChanged()
        uni.showToast({
          title: `已归类 ${result.updated} 个地点`,
          icon: 'none',
        })
      } catch (err) {
        uni.showToast({
          title: err instanceof Error ? err.message : '归类失败',
          icon: 'none',
        })
      } finally {
        assigningUncategorized.value = false
      }
    },
  })
}

async function refresh() {
  const first = !initialLoaded.value
  const stale = store.consumeDataStale()
  const withLoading = first || stale
  if (withLoading) showLoading()
  try {
    await loadGroups()
    await loadMembers()
    await loadFolders()
    initialLoaded.value = true
  } catch (err) {
    uni.showToast({ title: err instanceof Error ? err.message : '加载失败', icon: 'none' })
  } finally {
    if (withLoading) hideLoading()
  }
}

async function handleCreate() {
  const gname = groupName.value.trim()
  const myName = displayName.value.trim()
  if (!gname) {
    uni.showToast({ title: '请输入清单名称', icon: 'none' })
    return
  }
  if (!myName) {
    uni.showToast({ title: '请输入你的名称', icon: 'none' })
    return
  }
  creating.value = true
  try {
    const res = await createGroup(gname, myName)
    const created = res.group
    store.state.groups = [created, ...store.state.groups.filter((g) => g.id !== created.id)]
    store.setCurrentGroup(created.id)
    currentGroupId.value = created.id
    currentGroup.value = created
    members.value = []
    folders.value = []
    uncategorizedCount.value = 0
    store.setFolders([])
    createMode.value = false
    try {
      await loadGroups()
    } catch {
      // 服务端已创建成功，列表刷新失败时保留本地已并入的新清单，不再回滚
    }
    await loadMembers()
    await loadFolders()
    store.markDataChanged()
    uni.showToast({ title: '创建成功', icon: 'success' })
  } catch (err) {
    uni.showToast({ title: err instanceof Error ? err.message : '创建失败', icon: 'none' })
  } finally {
    creating.value = false
  }
}

function openCreateMode() {
  const self = members.value.find((member) => member.isSelf)
  if (!displayName.value && self) displayName.value = self.displayName
  groupName.value = ''
  createMode.value = true
}

function confirmEditMyName(member: MemberView) {
  uni.showModal({
    title: '修改我的名称',
    editable: true,
    placeholderText: member.displayName,
    confirmText: '保存',
    confirmColor: '#36393B',
    success: async (res) => {
      if (!res.confirm || !currentGroupId.value) return
      const name = (res.content || '').trim()
      if (!name) {
        uni.showToast({ title: '请输入你的名称', icon: 'none' })
        return
      }
      if (name.length > 20) {
        uni.showToast({ title: '名称不能超过 20 字', icon: 'none' })
        return
      }
      if (name === member.displayName) return
      updatingMyName.value = true
      try {
        await updateMyDisplayName(currentGroupId.value, name)
        displayName.value = name
        await loadMembers()
        uni.showToast({ title: '已修改', icon: 'success' })
      } catch (err) {
        uni.showToast({ title: err instanceof Error ? err.message : '修改失败', icon: 'none' })
      } finally {
        updatingMyName.value = false
      }
    },
  })
}

function switchGroup(id: string) {
  store.setCurrentGroup(id)
  store.clearFolders()
  currentGroupId.value = id
  currentGroup.value = store.currentGroup()
  viewingPublic.value = false
  viewingPublicName.value = ''
  members.value = []
  folders.value = []
  uncategorizedCount.value = 0
  loadMembers()
  loadFolders()
}

function switchToMyGroup() {
  if (groups.value.length > 1) {
    openGroupSwitcher()
    return
  }
  const g = groups.value[0]
  if (g) switchGroup(g.id)
}

async function loadInviteQrCode() {
  if (!inviteToken.value) return
  qrCodeLoading.value = true
  qrCodeError.value = ''
  qrCodeFileId.value = ''
  try {
    const res = await createInviteQrCode(inviteToken.value, inviteShortCode.value)
    qrCodeFileId.value = res.fileID
  } catch (err) {
    qrCodeError.value = err instanceof Error ? err.message : '二维码生成失败'
  } finally {
    qrCodeLoading.value = false
  }
}

async function handleGenerateInvite() {
  if (!currentGroupId.value) return
  generatingInvite.value = true
  try {
    const res = await createInvite(currentGroupId.value)
    inviteToken.value = res.token
    inviteShortCode.value = res.shortCode || ''
    inviteExpiresAt.value = res.expiresAt
    inviteRemaining.value = res.remainingUses
    showingInvite.value = true
    shareMessage.value = {
      title: `加入「${currentGroup.value?.name || '美食地图'}」一起添加好吃的`,
      path: `/pages/invite/index?publicId=${currentGroup.value?.publicId}&token=${encodeURIComponent(res.token)}`,
    }
    loadInviteQrCode()
  } catch (err) {
    uni.showToast({ title: err instanceof Error ? err.message : '生成失败', icon: 'none' })
  } finally {
    generatingInvite.value = false
  }
}

function onShare() {
  return shareMessage.value
}

onShareAppMessage(() => onShare())

function handleSaveQrCode() {
  if (!qrCodeFileId.value) return
  uni.authorize({
    scope: 'scope.writePhotosAlbum',
    success: () => {
      uni.showLoading({ title: '保存中…' })
      downloadFile(qrCodeFileId.value)
        .then((tempPath) => {
          uni.saveImageToPhotosAlbum({
            filePath: tempPath,
            success: () => {
              uni.hideLoading()
              uni.showToast({ title: '已保存到相册', icon: 'success' })
            },
            fail: () => {
              uni.hideLoading()
              uni.showToast({ title: '保存失败，请检查相册权限', icon: 'none' })
            },
          })
        })
        .catch(() => {
          uni.hideLoading()
          uni.showToast({ title: '图片下载失败', icon: 'none' })
        })
    },
    fail: () => {
      uni.showModal({
        title: '需要相册权限',
        content: '请在小程序设置中开启「保存到相册」权限后重试。',
        confirmText: '去设置',
        success: (res) => {
          if (res.confirm) {
            uni.openSetting()
          }
        },
      })
    },
  })
}

async function handleRevokeInvite() {
  if (!currentGroupId.value) return
  try {
    await revokeInvite(currentGroupId.value)
    showingInvite.value = false
    uni.showToast({ title: '已撤销邀请', icon: 'none' })
  } catch (err) {
    uni.showToast({ title: err instanceof Error ? err.message : '撤销失败', icon: 'none' })
  }
}

function confirmRemove(m: MemberView) {
  uni.showModal({
    title: '移除成员',
    content: `确认移除「${m.displayName}」？其添加的地点会保留。`,
    confirmText: '移除',
    confirmColor: '#36393B',
    success: async (res) => {
      if (!res.confirm || !currentGroupId.value) return
      removing.value = true
      try {
        await removeMember(currentGroupId.value, m.id)
        await loadMembers()
        uni.showToast({ title: '已移除', icon: 'none' })
      } catch (err) {
        uni.showToast({ title: err instanceof Error ? err.message : '移除失败', icon: 'none' })
      } finally {
        removing.value = false
      }
    },
  })
}

function goManage() {
  uni.reLaunch({ url: '/pages/manage/manage' })
}

function confirmEditGroup(g: GroupView) {
  uni.showModal({
    title: '修改清单名称',
    editable: true,
    placeholderText: g.name,
    confirmText: '保存',
    confirmColor: '#36393B',
    success: async (res) => {
      if (!res.confirm) return
      const name = (res.content || '').trim()
      if (!name) {
        uni.showToast({ title: '请输入清单名称', icon: 'none' })
        return
      }
      try {
        await updateGroupName(g.id, name)
        await loadGroups()
        store.markDataChanged()
        uni.showToast({ title: '已修改', icon: 'success' })
      } catch (err) {
        uni.showToast({ title: err instanceof Error ? err.message : '修改失败', icon: 'none' })
      }
    },
  })
}

function confirmDeleteGroup(g: GroupView) {
  uni.showModal({
    title: '删除清单',
    content: `确认删除「${g.name}」？将同时删除所有成员、邀请和地点记录，且不可恢复。`,
    confirmText: '删除',
    confirmColor: '#36393B',
    success: async (res) => {
      if (!res.confirm) return
      deleting.value = true
      try {
        await deleteGroup(g.id)
        if (currentGroupId.value === g.id) {
          currentGroupId.value = ''
          currentGroup.value = null
          members.value = []
          folders.value = []
          uncategorizedCount.value = 0
          store.clearFolders()
        }
        if (recentPublicGroup.value?.publicId === g.publicId) {
          store.clearRecentPublicGroup()
          recentPublicGroup.value = null
        }
        await refresh()
        store.markDataChanged()
        if (groups.value.length === 0) {
          openCreateMode()
        }
        uni.showToast({ title: '已删除', icon: 'none' })
      } catch (err) {
        uni.showToast({ title: err instanceof Error ? err.message : '删除失败', icon: 'none' })
      } finally {
        deleting.value = false
      }
    },
  })
}

function openMap() {
  uni.switchTab({ url: '/pages/index/index' })
}

function viewPublicMap() {
  if (!recentPublicGroup.value) return
  openMap()
}

onShow(() => {
  recentPublicGroup.value = store.getRecentPublicGroup()
  refresh()
})
</script>

<template>
  <view class="manage-page">
    <global-loading />

    <view v-if="cloudMissing" class="warn-card">
      <text class="warn-title">云环境未配置</text>
      <text class="muted">{{ state.message }}</text>
    </view>

    <view v-else-if="createMode" class="card create-card">
      <text class="section-title">创建共享清单</text>
      <input v-model="groupName" class="input" placeholder="清单名称（1-30 字）" maxlength="30" />
      <input v-model="displayName" class="input" placeholder="你的名称（1-20 字）" maxlength="20" />
      <text class="muted">名称仅清单成员可见，用于成员列表和店铺署名</text>
      <view class="row-gap">
        <button class="btn-plain" @click="createMode = false">取消</button>
        <button class="btn-primary" :loading="creating" :disabled="creating" @click="handleCreate">
          创建
        </button>
      </view>
    </view>

    <view v-else-if="groups.length === 0 && !recentPublicGroup" class="card empty-card">
      <text class="empty-title">创建你的第一份共享清单</text>
      <text class="muted">邀请朋友一起添加想吃的店</text>
      <button class="btn-primary" @click="openCreateMode">开始创建</button>
    </view>

    <view v-else-if="groups.length === 0 && recentPublicGroup" class="card empty-card">
      <text class="empty-title">{{ recentPublicGroup.name }}</text>
      <text class="muted">当前为只读访客 · 加入清单后可添加店铺或景点</text>
      <button class="btn-primary" @click="viewPublicMap">查看公开地图</button>
      <button class="btn-plain" @click="openCreateMode">创建自己的清单</button>
    </view>

    <template v-else-if="!viewingPublic">
      <!-- 当前清单 Hero -->
      <view class="hero-section">
        <view class="hero-card">
          <view class="hero-header">
            <view class="hero-info">
              <view class="hero-label">当前清单</view>
              <view class="hero-name">{{ heroName }}</view>
              <view class="hero-meta">{{ currentGroup?.isOwner ? '你是创建者' : '你是成员' }}</view>
            </view>
            <view v-if="currentGroup?.isOwner" class="hero-actions">
              <button class="mini-btn edit" @click="confirmEditCurrentGroup">编辑</button>
              <button class="mini-btn delete" @click="confirmDeleteCurrentGroup">删除</button>
            </view>
          </view>
          <view class="hero-stats">
            <view class="stat-item">
              <text class="stat-value">{{ folders.length }}</text>
              <text class="stat-label">城市</text>
            </view>
            <view class="stat-item">
              <text class="stat-value">{{ totalShops }}</text>
              <text class="stat-label">地点</text>
            </view>
            <view class="stat-item">
              <text class="stat-value">{{ members.length }}</text>
              <text class="stat-label">成员</text>
            </view>
          </view>
        </view>
      </view>

      <!-- 切换清单 -->
      <view class="switch-list">
        <button v-if="groups.length > 1" class="switch-btn" @click="openGroupSwitcher">
          切换清单
        </button>
      </view>

      <!-- 城市子清单 -->
      <view class="section-header">
        <text class="section-title">城市子清单</text>
      </view>

      <view class="city-list">
        <view v-for="f in folders" :key="f.id" class="city-row">
          <view class="city-info">
            <text class="city-name">{{ f.name }}</text>
            <text class="city-count">{{ f.shopCount ?? 0 }} 个地点</text>
          </view>
          <view class="city-actions">
            <button class="mini-btn edit" :disabled="renamingFolder" @click="confirmEditFolder(f)">改名</button>
            <button class="mini-btn delete" :disabled="removingFolder" @click="confirmDeleteFolder(f)">删除</button>
          </view>
        </view>

        <view v-if="uncategorizedCount > 0" class="city-row">
          <view class="city-info">
            <text class="city-name muted-name">未分类</text>
            <text class="city-count">{{ uncategorizedCount }} 个地点</text>
          </view>
          <view class="city-actions">
            <button class="mini-btn edit" :disabled="assigningUncategorized" @click="openAssignUncategorized">
              归类
            </button>
          </view>
        </view>

        <view v-if="loadingFolders && folders.length === 0" class="muted-center">加载中…</view>
        <view v-else-if="folders.length === 0 && uncategorizedCount === 0" class="muted-center">
          还没有城市子清单，点击下方新建
        </view>
      </view>

      <!-- 新建城市 -->
      <view class="add-city-row">
        <button class="add-city-btn" :disabled="creatingFolder" @click="openCreateFolder">
          新建城市
        </button>
      </view>

      <!-- 邀请朋友 -->
      <view class="invite-card">
        <view class="invite-title">邀请朋友</view>
        <view class="invite-desc">朋友无需加入就能浏览地图，确认加入后即可添加店铺或景点</view>
        <view class="invite-actions">
          <button class="btn-secondary" :disabled="!currentGroup?.isOwner" @click="handleRevokeInvite">
            撤销全部邀请
          </button>
          <button
            class="btn-primary"
            :loading="generatingInvite"
            :disabled="generatingInvite || !currentGroup?.isOwner"
            @click="handleGenerateInvite"
          >
            生成邀请链接
          </button>
        </view>
      </view>

      <!-- 成员 -->
      <view class="member-card">
        <view class="member-header">
          <text class="member-title">成员</text>
          <text class="member-hint">{{ currentGroup?.isOwner ? '创建者可管理全部' : '仅可管理自己添加的内容' }}</text>
        </view>
        <view v-if="loadingMembers && members.length === 0" class="muted-center">加载中…</view>
        <view v-else-if="members.length === 0" class="muted-center">暂无成员</view>
        <view v-else>
          <view v-for="m in members" :key="m.id" class="member-item">
            <view class="member-avatar">{{ initialOf(m.displayName) }}</view>
            <view class="member-info">
              <view class="member-name-row">
                <text class="member-name">{{ m.displayName }}</text>
                <text v-if="m.isSelf" class="member-self">我</text>
                <text v-if="m.role === 'owner'" class="member-role owner">创建者</text>
              </view>
            </view>
            <view class="member-actions">
              <button v-if="m.isSelf" class="mini-btn edit" :disabled="updatingMyName" @click="confirmEditMyName(m)">
                修改名称
              </button>
              <button
                v-else-if="currentGroup?.isOwner && m.role !== 'owner'"
                class="mini-btn remove"
                :disabled="removing"
                @click="confirmRemove(m)"
              >
                移除
              </button>
            </view>
          </view>
        </view>
      </view>

      <!-- 邀请二维码弹窗 -->
      <wd-popup v-model="showingInvite" position="bottom" custom-style="padding: 24rpx 32rpx 16rpx;">
        <view class="popup-body">
          <text class="section-title">邀请已生成</text>
          <text class="muted">
            7 天内有效，还可使用 {{ inviteRemaining }} 次。朋友扫码即可加入。
          </text>
          <view class="qr-wrap">
            <view v-if="qrCodeLoading" class="qr-placeholder">
              <text class="muted">小程序码生成中…</text>
            </view>
            <image
              v-else-if="qrCodeFileId"
              :src="qrCodeFileId"
              class="qr-img"
              mode="aspectFit"
              @click="handleSaveQrCode"
            />
            <view v-else class="qr-placeholder">
              <text class="muted">{{ qrCodeError || '小程序码生成失败' }}</text>
              <button v-if="qrCodeError" class="btn-plain mini" @click="loadInviteQrCode">重试</button>
            </view>
          </view>
          <view class="row-gap">
            <button class="btn-plain" @click="handleRevokeInvite">撤销此邀请</button>
            <button v-if="qrCodeFileId" class="btn-primary" @click="handleSaveQrCode">保存二维码到相册</button>
          </view>
        </view>
      </wd-popup>

      <view class="cta-space"></view>
    </template>

    <!-- 全局当前清单为公开(访客)清单时的只读浏览卡 -->
    <view v-else class="card browse-card">
      <view class="browse-head">
        <view class="browse-icon"><text>👀</text></view>
        <view class="browse-info">
          <text class="browse-label">当前浏览</text>
          <text class="browse-name">{{ viewingPublicName || recentPublicGroup?.name || '公开清单' }}</text>
        </view>
      </view>
      <text class="muted">这是一份朋友分享的公开清单，当前为只读访客浏览。切换到自己的清单后可管理成员和城市。</text>
      <view class="row-gap">
        <button class="btn-secondary" @click="openMap">查看公开地图</button>
        <button class="btn-primary" @click="switchToMyGroup">切换到我的清单</button>
      </view>
    </view>

    <!-- 底部创建新清单 -->
    <view v-if="!createMode && groups.length > 0 && !cloudMissing" class="bottom-cta">
      <button class="cta-btn" @click="openCreateMode">
        <text>+</text>
        <text>创建新清单</text>
      </button>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.manage-page {
  min-height: 100vh;
  background-color: #FAF8F5;
  padding-bottom: calc(120rpx + env(safe-area-inset-bottom));
}

/* ===== 卡片基础 ===== */
.card {
  background-color: #FFFFFF;
  border: none;
  border-radius: 40rpx;
  padding: 40rpx 32rpx;
  display: flex;
  flex-direction: column;
  gap: 24rpx;
  margin: 24rpx 32rpx;
  box-shadow: 0 8rpx 40rpx rgba(0, 0, 0, 0.05);
}

.warn-card {
  border-left: 8rpx solid #FF3B30;
  background-color: #FFFFFF;
}

.empty-card {
  align-items: center;
  text-align: center;
  padding: 80rpx 32rpx;
}

.emoji {
  font-size: 72rpx;
}

.empty-title {
  font-size: 36rpx;
  font-weight: 700;
  color: #1C1C1E;
}

.warn-title {
  font-size: 32rpx;
  font-weight: 700;
  color: #1C1C1E;
}

.muted {
  font-size: 26rpx;
  color: #8E8E93;
  line-height: 1.6;
}

.muted-center {
  font-size: 26rpx;
  color: #8E8E93;
  text-align: center;
  padding: 32rpx 0;
}

.section-title {
  font-size: 36rpx;
  font-weight: 700;
  color: #1C1C1E;
  letter-spacing: 0.5rpx;
}

/* ===== Hero 当前清单 ===== */
.hero-section {
  padding: 8rpx 32rpx 20rpx;
}

.hero-card {
  background: #FFFFFF;
  border-radius: 24rpx;
  padding: 40rpx 32rpx;
}

.hero-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 32rpx;
}

.hero-info {
  flex: 1;
  min-width: 0;
}

.hero-label {
  font-size: 24rpx;
  color: #8E8E93;
  font-weight: 600;
  letter-spacing: 1rpx;
  margin-bottom: 8rpx;
}

.hero-name {
  font-size: 48rpx;
  font-weight: 700;
  color: #1C1C1E;
  margin-bottom: 12rpx;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.hero-meta {
  font-size: 28rpx;
  color: #8E8E93;
}

.hero-actions {
  display: flex;
  gap: 12rpx;
  flex-shrink: 0;
}

.hero-actions .mini-btn {
  height: auto;
  min-height: 0;
  padding: 14rpx 28rpx;
}

.hero-stats {
  display: flex;
  gap: 48rpx;
  padding-top: 32rpx;
  border-top: 2rpx solid #F2F2F7;
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}

.stat-value {
  font-size: 40rpx;
  font-weight: 700;
  color: #1C1C1E;
}

.stat-label {
  font-size: 24rpx;
  color: #8E8E93;
  font-weight: 500;
}

/* ===== 切换清单 ===== */
.switch-list {
  padding: 0 32rpx 4rpx;
  display: flex;
  gap: 16rpx;
}

.switch-btn {
  flex: 1;
  padding: 12rpx 24rpx;
  background: #FFFFFF;
  border: 2rpx dashed #E5E5EA;
  border-radius: 18rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  font-size: 26rpx;
  font-weight: 600;
  color: #8E8E93;
  font-family: inherit;

  &::after {
    border: none;
  }
}

/* ===== 区块标题 ===== */
.section-header {
  padding: 16rpx 40rpx 12rpx;
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
}

.section-sub {
  font-size: 26rpx;
  color: #8E8E93;
  font-weight: 500;
}

/* ===== 城市列表 ===== */
.city-list {
  margin: 0 32rpx;
  background: #FFFFFF;
  border-radius: 24rpx;
  max-height: 400rpx;
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
}

.city-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 30rpx 28rpx;
  border-bottom: 2rpx solid #F2F2F7;

  &:last-child {
    border-bottom: none;
  }
}

.city-info {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 16rpx;
}

.city-name {
  font-size: 32rpx;
  font-weight: 600;
  color: #1C1C1E;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.muted-name {
  color: #8E8E93;
}

.city-count {
  font-size: 24rpx;
  color: #C7C7CC;
  flex-shrink: 0;
}

.city-actions {
  display: flex;
  gap: 12rpx;
  flex-shrink: 0;
}

/* ===== 小按钮 ===== */
.mini-btn {
  padding: 14rpx 28rpx;
  border-radius: 24rpx;
  font-size: 26rpx;
  font-weight: 600;
  border: none;
  font-family: inherit;
  line-height: 1.4;
  height: auto;
  min-height: 0;

  &::after {
    border: none;
  }

  &.edit {
    background: #F2F2F7;
    color: #3A3A3C;
  }

  &.delete,
  &.remove {
    background: #FFF0F0;
    color: #FF3B30;
  }
}

/* ===== 新建城市 ===== */
.add-city-row {
  padding: 8rpx 32rpx 0;
}

.add-city-btn {
  width: 100%;
  padding: 12rpx;
  background: #FFFFFF;
  border: 2rpx dashed #E5E5EA;
  border-radius: 18rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  font-size: 26rpx;
  font-weight: 600;
  color: #8E8E93;
  font-family: inherit;

  &::after {
    border: none;
  }
}

/* ===== 邀请朋友 ===== */
.invite-card {
  background: #FFFFFF;
  border-radius: 24rpx;
  padding: 28rpx;
  margin: 20rpx 32rpx 0;
}

.invite-title {
  font-size: 36rpx;
  font-weight: 700;
  color: #1C1C1E;
  margin-bottom: 16rpx;
}

.invite-desc {
  font-size: 28rpx;
  color: #8E8E93;
  line-height: 1.6;
  margin-bottom: 32rpx;
}

.invite-actions {
  display: flex;
  gap: 20rpx;
}

.invite-actions .btn-secondary,
.invite-actions .btn-primary {
  height: 88rpx;
  line-height: 88rpx;
  min-height: 88rpx;
  padding: 0 32rpx;
  box-sizing: border-box;
}

.invite-actions .btn-secondary {
  flex: 1;
  border-radius: 32rpx;
  border: 2rpx solid #E5E5EA;
  background: #FFFFFF;
  color: #3A3A3C;
  font-size: 30rpx;
  font-weight: 600;
  font-family: inherit;

  &::after {
    border: none;
  }
}

.invite-actions .btn-primary {
  flex: 1.5;
  border-radius: 32rpx;
  border: none;
  background: #1C1C1E;
  color: #FFFFFF;
  font-size: 30rpx;
  font-weight: 600;
  font-family: inherit;
  box-shadow: 0 8rpx 28rpx rgba(0, 0, 0, 0.12);

  &::after {
    border: none;
  }
}

/* ===== 成员 ===== */
.member-card {
  background: #FFFFFF;
  border-radius: 24rpx;
  padding: 28rpx;
  margin: 20rpx 32rpx 0;
}

.member-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8rpx;
}

.member-title {
  font-size: 32rpx;
  font-weight: 700;
  color: #1C1C1E;
}

.member-hint {
  font-size: 24rpx;
  color: #8E8E93;
}

.member-item {
  display: flex;
  align-items: center;
  gap: 24rpx;
  padding: 24rpx 0;
  border-bottom: 2rpx solid #F2F2F7;

  &:last-child {
    border-bottom: none;
  }
}

.member-avatar {
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  background: #F2F2F7;
  color: #3A3A3C;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28rpx;
  font-weight: 600;
  flex-shrink: 0;
}

.member-info {
  flex: 1;
  min-width: 0;
}

.member-name-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.member-name {
  font-size: 32rpx;
  font-weight: 600;
  color: #1C1C1E;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.member-self {
  flex: none;
  font-size: 22rpx;
  font-weight: 600;
  color: #8E8E93;
  border: 2rpx solid #D1D1D6;
  border-radius: 10rpx;
  padding: 2rpx 12rpx;
}

.member-role {
  font-size: 22rpx;
  font-weight: 600;
  padding: 4rpx 16rpx;
  border-radius: 12rpx;
  flex-shrink: 0;

  &.owner {
    background: #1C1C1E;
    color: #FFFFFF;
  }
}

.member-actions {
  display: flex;
  gap: 12rpx;
  flex-shrink: 0;
}

/* ===== 表单 ===== */
.create-card {
  margin-top: 24rpx;
}

.input {
  height: 80rpx;
  padding: 0 24rpx;
  border-radius: 24rpx;
  background-color: #F7F7F9;
  border: 2rpx solid #E5E5EA;
  font-size: 28rpx;
}

.row-gap {
  display: flex;
  gap: 24rpx;
  margin-top: 8rpx;
}

.btn-primary,
.btn-plain {
  flex: 1;
  border: none;
  border-radius: 32rpx;
  font-size: 28rpx;
  height: 80rpx;
  line-height: 80rpx;
  min-height: 80rpx;
  padding: 0 28rpx;

  &::after {
    border: none;
  }
}

.btn-primary {
  background-color: #1C1C1E;
  color: #FFFFFF;
}

.btn-plain {
  background-color: #F2F2F7;
  color: #3A3A3C;
}

/* ===== 弹窗 ===== */
.popup-body {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  padding-bottom: calc(16rpx + env(safe-area-inset-bottom));

  .btn-primary,
  .btn-plain {
    flex: 1;
    font-size: 26rpx;
    height: 64rpx;
    line-height: 64rpx;
    min-height: 64rpx;
    padding: 0 20rpx;
    border-radius: 24rpx;
  }

  > .row-gap {
    margin-top: 4rpx;
  }

  .btn-plain.mini {
    flex: none;
    width: 160rpx;
    height: 56rpx;
    line-height: 56rpx;
    min-height: 56rpx;
    font-size: 24rpx;
    margin-top: 12rpx;
  }
}

.qr-wrap {
  display: flex;
  justify-content: center;
  padding: 12rpx 0;
}

.qr-img {
  width: 360rpx;
  height: 360rpx;
  border-radius: 16rpx;
  background-color: #FFFFFF;
}

.qr-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 360rpx;
  height: 360rpx;
  border-radius: 16rpx;
  background-color: #F7F7F9;
  gap: 8rpx;
}

/* ===== 底部 CTA ===== */
.cta-space {
  height: 20rpx;
}

.bottom-cta {
  position: fixed;
  left: 0;
  right: 0;
  bottom: var(--window-bottom, 0);
  padding: 12rpx 40rpx 16rpx;
  background: rgba(250, 248, 245, 0.92);
  border-top: 2rpx solid rgba(0, 0, 0, 0.05);
  z-index: 99;
}

.cta-btn {
  width: 100%;
  height: 72rpx;
  line-height: 72rpx;
  min-height: 72rpx;
  padding: 0;
  background: #1C1C1E;
  color: #FFFFFF;
  border: none;
  border-radius: 24rpx;
  font-size: 28rpx;
  font-weight: 600;
  font-family: inherit;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  box-shadow: 0 8rpx 32rpx rgba(0, 0, 0, 0.15);

  &::after {
    border: none;
  }
}

/* ===== 公开(访客)清单只读浏览卡 ===== */
.browse-card {
  margin-top: 48rpx;
}

.browse-head {
  display: flex;
  align-items: center;
  gap: 24rpx;
}

.browse-icon {
  flex: none;
  width: 88rpx;
  height: 88rpx;
  border-radius: 50%;
  background: #f5f3ef;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 44rpx;
}

.browse-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}

.browse-label {
  font-size: 24rpx;
  color: #8E8E93;
}

.browse-name {
  font-size: 34rpx;
  font-weight: 700;
  color: #1C1C1E;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
</style>