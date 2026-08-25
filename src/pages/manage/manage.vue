<script setup lang="ts">
import { ref } from 'vue'
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
  mergeGroups,
  assignUncategorizedShops,
} from '@/services/group'
import { useGroupStore } from '@/stores/group'
import { getCloudInitState, downloadFile } from '@/utils/cloud'
import { hideLoading, showLoading } from '@/utils/global-loading'

const store = useGroupStore()

const state = getCloudInitState()
const groups = ref<GroupView[]>([])
const currentGroupId = ref('')
const members = ref<MemberView[]>([])
const currentGroup = ref<GroupView | null>(null)

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

const showingMerge = ref(false)
const merging = ref(false)
const mergeTargetGroupId = ref('')
const mergeSourceIds = ref<string[]>([])

const cloudMissing = ref(!state.ready)
const recentPublicGroup = ref(store.getRecentPublicGroup())
const initialLoaded = ref(false)

function loadGroups() {
  return listMyGroups().then((list) => {
    const previousGroupId = currentGroupId.value
    groups.value = list
    store.setGroups(list)
    const cur = store.currentGroup()
    if (cur) {
      currentGroupId.value = cur.id
      currentGroup.value = cur
      if (previousGroupId !== cur.id) members.value = []
    } else {
      currentGroupId.value = ''
      currentGroup.value = null
      members.value = []
    }
  })
}

async function loadMembers() {
  if (!currentGroupId.value) return
  loadingMembers.value = true
  try {
    members.value = await listMembers(currentGroupId.value)
  } catch {
    members.value = []
  } finally {
    loadingMembers.value = false
  }
}

async function loadFolders() {
  if (!currentGroupId.value) return
  loadingFolders.value = true
  try {
    const res = await listFolders(currentGroupId.value)
    folders.value = res.folders
    uncategorizedCount.value = res.uncategorizedCount
    store.setFolders(folders.value)
  } catch {
    folders.value = []
    uncategorizedCount.value = 0
  } finally {
    loadingFolders.value = false
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
    content: `确认删除「${f.name}」？该城市下的店铺会保留并归为未分类。`,
    confirmText: '删除',
    confirmColor: '#36393B',
    success: async (res) => {
      if (!res.confirm) return
      removingFolder.value = true
      try {
        await deleteFolder(f.id)
        await loadFolders()
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
        uni.showToast({
          title: `已归类 ${result.updated} 家店`,
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

function openMergePanel() {
  const targets = groups.value.filter((g) => g.isOwner)
  if (targets.length < 2) return
  mergeTargetGroupId.value = currentGroupId.value || targets[0].id
  mergeSourceIds.value = []
  showingMerge.value = true
}

function toggleMergeSource(id: string) {
  const idx = mergeSourceIds.value.indexOf(id)
  if (idx >= 0) {
    mergeSourceIds.value.splice(idx, 1)
  } else {
    mergeSourceIds.value.push(id)
  }
}

function selectAllSources() {
  const sources = groups.value
    .filter((g) => g.isOwner && g.id !== mergeTargetGroupId.value)
    .map((g) => g.id)
  mergeSourceIds.value = sources
}

async function confirmMerge() {
  if (!mergeTargetGroupId.value || mergeSourceIds.value.length === 0) {
    uni.showToast({ title: '请选择要合并的清单', icon: 'none' })
    return
  }
  uni.showModal({
    title: '确认合并',
    content: `将把 ${mergeSourceIds.value.length} 个清单的店铺与成员并入目标清单，合并后原清单会被删除。`,
    confirmText: '合并',
    confirmColor: '#36393B',
    success: async (res) => {
      if (!res.confirm) return
      merging.value = true
      try {
        const result = await mergeGroups(mergeTargetGroupId.value, mergeSourceIds.value)
        showingMerge.value = false
        store.setCurrentGroup(result.group.id)
        currentGroupId.value = result.group.id
        currentGroup.value = result.group
        await refresh()
        uni.showToast({
          title: `已合并：${result.mergedFolders} 个城市、${result.mergedShops} 家店`,
          icon: 'none',
        })
      } catch (err) {
        uni.showToast({ title: err instanceof Error ? err.message : '合并失败', icon: 'none' })
      } finally {
        merging.value = false
      }
    },
  })
}

async function refresh() {
  const first = !initialLoaded.value
  if (first) showLoading()
  try {
    await loadGroups()
    await loadMembers()
    await loadFolders()
    initialLoaded.value = true
  } catch (err) {
    uni.showToast({ title: err instanceof Error ? err.message : '加载失败', icon: 'none' })
  } finally {
    if (first) hideLoading()
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
    await loadGroups()
    store.setCurrentGroup(res.group.id)
    currentGroupId.value = res.group.id
    currentGroup.value = res.group
    createMode.value = false
    uni.showToast({ title: '创建成功', icon: 'success' })
    await loadMembers()
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
  currentGroupId.value = id
  currentGroup.value = store.currentGroup()
  members.value = []
  loadMembers()
  loadFolders()
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
      title: `加入「${currentGroup.value?.name || '美食清单'}」一起添加好吃的`,
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
    content: `确认移除「${m.displayName}」？其添加的店铺会保留。`,
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
    content: `确认删除「${g.name}」？将同时删除所有成员、邀请和店铺记录，且不可恢复。`,
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
        }
        await loadGroups()
        store.setCurrentGroup(currentGroupId.value)
        uni.showToast({ title: '已删除', icon: 'none' })
      } catch (err) {
        uni.showToast({ title: err instanceof Error ? err.message : '删除失败', icon: 'none' })
      } finally {
        deleting.value = false
      }
    },
  })
}

function viewPublicMap() {
  if (!recentPublicGroup.value) return
  uni.switchTab({ url: '/pages/index/index' })
}

onShow(() => {
  recentPublicGroup.value = store.getRecentPublicGroup()
  refresh()
})
</script>

<template>
  <view class="manage-page">
    <global-loading />
    <view v-if="cloudMissing" class="card warn-card">
      <text class="warn-title">云环境未配置</text>
      <text class="muted">{{ state.message }}</text>
    </view>

    <view v-else-if="groups.length === 0 && !createMode && !recentPublicGroup" class="card empty-card">
      <image class="empty-image" src="/static/tabbar/调皮.png" mode="aspectFit" />
      <text class="empty-title">创建你的第一份共享清单</text>
      <text class="muted">邀请朋友一起添加想吃的店</text>
      <button class="btn-primary" @click="openCreateMode">开始创建</button>
    </view>

    <view v-else-if="groups.length === 0 && !createMode && recentPublicGroup" class="card empty-card">
      <text class="emoji">👀</text>
      <text class="empty-title">{{ recentPublicGroup.name }}</text>
      <text class="muted">当前为只读访客 · 加入清单后可添加店铺或景点</text>
      <button class="btn-primary" @click="viewPublicMap">查看公开地图</button>
      <button class="btn-plain" @click="openCreateMode">创建自己的清单</button>
    </view>

    <view v-else-if="createMode" class="card">
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

    <template v-else>
      <view class="card">
        <text class="section-title">我的清单</text>
        <view v-if="groups.length === 0" class="muted">还没有加入任何清单</view>
        <view
          v-for="g in groups"
          :key="g.id"
          class="group-item"
          :class="{ active: g.id === currentGroupId }"
          @click="switchGroup(g.id)"
        >
          <view class="group-info">
            <text class="group-name">{{ g.name }}</text>
            <text class="tag">{{ g.isOwner ? '创建者' : '成员' }}</text>
          </view>
          <view class="group-actions">
            <button
              v-if="g.isOwner"
              class="edit-btn"
              :disabled="deleting"
              @click.stop="confirmEditGroup(g)"
            >
              编辑
            </button>
            <button
              v-if="g.isOwner"
              class="remove-btn"
              :disabled="deleting"
              @click.stop="confirmDeleteGroup(g)"
            >
              删除
            </button>
            <text v-if="g.id === currentGroupId" class="check">✓</text>
          </view>
        </view>
        <view class="row-gap link-row">
          <button class="btn-plain create-link" @click="openCreateMode">+ 创建新清单</button>
          <button
            v-if="groups.filter((g) => g.isOwner).length >= 2"
            class="btn-plain create-link"
            @click="openMergePanel"
          >
            合并旧清单
          </button>
        </view>
      </view>

      <view v-if="currentGroup" class="card">
        <view class="section-row">
          <text class="section-title">城市子清单</text>
          <text class="muted">一次邀请，全部城市共享</text>
        </view>
        <text class="muted">在整体清单下按城市整理店铺与景点，添加时选择所属城市</text>
        <view v-if="loadingFolders && folders.length === 0" class="muted">加载中…</view>
        <view v-else-if="folders.length === 0" class="muted">还没有城市子清单</view>
        <view v-else>
          <view v-for="f in folders" :key="f.id" class="folder-row">
            <view class="folder-info">
              <text class="folder-name">{{ f.name }}</text>
              <text v-if="f.shopCount !== undefined" class="muted">
                {{ f.shopCount }} 家店
              </text>
              <text class="tag">{{ f.sortOrder + 1 }}</text>
            </view>
            <view class="group-actions">
              <button
                class="edit-btn"
                :disabled="renamingFolder"
                @click.stop="confirmEditFolder(f)"
              >
                改名
              </button>
              <button
                class="remove-btn"
                :disabled="removingFolder"
                @click.stop="confirmDeleteFolder(f)"
              >
                删除
              </button>
            </view>
          </view>
        </view>
        <view v-if="uncategorizedCount > 0" class="uncategorized-row">
          <view class="folder-info">
            <text class="folder-name muted-name">未分类</text>
            <text class="muted">{{ uncategorizedCount }} 家店</text>
          </view>
          <view class="group-actions">
            <button
              class="edit-btn"
              :disabled="assigningUncategorized"
              @click.stop="openAssignUncategorized"
            >
              归类到…
            </button>
          </view>
        </view>
        <button
          class="btn-plain create-link"
          :disabled="creatingFolder"
          @click="openCreateFolder"
        >
          + 新建城市
        </button>
      </view>

      <view v-if="currentGroup" class="card">
        <view class="section-row">
          <text class="section-title">邀请朋友</text>
        </view>
        <text class="muted">朋友无需加入就能浏览地图，确认加入后即可添加店铺或景点</text>
        <view class="row-gap">
          <button
            class="btn-plain"
            :disabled="!currentGroup.isOwner"
            @click="handleRevokeInvite"
          >
            撤销全部邀请
          </button>
          <button
            class="btn-primary"
            :loading="generatingInvite"
            :disabled="generatingInvite || !currentGroup.isOwner"
            @click="handleGenerateInvite"
          >
            生成邀请链接
          </button>
        </view>

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
      </view>

      <view class="card">
        <view class="section-row">
          <text class="section-title">成员</text>
          <text v-if="currentGroup" class="muted">
            {{ currentGroup.isOwner ? '创建者可管理全部' : '仅可管理自己添加的内容' }}
          </text>
        </view>
        <view v-if="loadingMembers && members.length === 0" class="muted">加载中…</view>
        <view v-else-if="members.length === 0" class="muted">暂无成员</view>
        <view v-else>
          <view v-for="m in members" :key="m.id" class="member-row">
            <view class="member-info">
              <text class="member-name">{{ m.displayName }}</text>
              <text class="tag">{{ m.role === 'owner' ? '创建者' : '成员' }}</text>
              <text v-if="m.isSelf" class="tag self">我</text>
            </view>
            <button
              v-if="m.isSelf"
              class="edit-btn"
              :disabled="updatingMyName"
              @click="confirmEditMyName(m)"
            >
              修改我的名称
            </button>
            <button
              v-else-if="currentGroup?.isOwner && m.role !== 'owner'"
              class="remove-btn"
              :disabled="removing"
              @click="confirmRemove(m)"
            >
              移除
            </button>
          </view>
        </view>
      </view>

      <wd-popup v-model="showingMerge" position="bottom" custom-style="padding: 24rpx 32rpx 16rpx;">
        <view class="popup-body">
          <text class="section-title">合并旧清单</text>
          <text class="muted">选择一个整体清单作为目标，把其他清单并入其中；原清单会按城市自动归类后删除。</text>
          <text class="muted">目标清单</text>
          <view class="group-picker-item" v-for="g in groups.filter((x) => x.isOwner)" :key="g.id" :class="{ active: mergeTargetGroupId === g.id }" @click="mergeTargetGroupId = g.id">
            <text class="group-picker-name">{{ g.name }}</text>
            <text v-if="mergeTargetGroupId === g.id" class="group-picker-check">✓</text>
          </view>
          <text class="muted">选择要并入的清单</text>
          <view class="merge-tools">
            <text class="merge-tool" @click="selectAllSources">全部选择</text>
            <text class="merge-tool" @click="mergeSourceIds = []">清空</text>
          </view>
          <view class="group-picker-item" v-for="g in groups.filter((x) => x.isOwner && x.id !== mergeTargetGroupId)" :key="g.id" :class="{ active: mergeSourceIds.includes(g.id) }" @click="toggleMergeSource(g.id)">
            <text class="group-picker-name">{{ g.name }}</text>
            <text v-if="mergeSourceIds.includes(g.id)" class="group-picker-check">✓</text>
          </view>
          <view class="row-gap">
            <button class="btn-plain" @click="showingMerge = false">取消</button>
            <button class="btn-primary" :loading="merging" :disabled="merging" @click="confirmMerge">
              确认合并
            </button>
          </view>
        </view>
      </wd-popup>
    </template>
  </view>
</template>

<style lang="scss" scoped>
.manage-page {
  padding: 24rpx;
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.card {
  background-color: #FEF9FF;
  border: 1rpx solid #36393B;
  border-radius: 24rpx;
  padding: 32rpx;
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.warn-card {
  border-left: 8rpx solid #36393B;
  background-color: #F5F5F5;
}

.empty-card {
  align-items: center;
  text-align: center;
  padding: 80rpx 32rpx;
}

.emoji {
  font-size: 72rpx;
}

.empty-image {
  width: 120rpx;
  height: 120rpx;
  margin-bottom: 16rpx;
}

.empty-title {
  font-size: 36rpx;
  font-weight: 700;
  color: #37291a;
}

.section-title {
  font-size: 36rpx;
  font-weight: 700;
  color: #37291a;
  letter-spacing: 0.5rpx;
}

.section-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.muted {
  font-size: 26rpx;
  color: #6B6F73;
  line-height: 1.5;
}

.warn-title {
  font-size: 32rpx;
  font-weight: 700;
  color: #36393B;
}

.input {
  height: 72rpx;
  padding: 0 24rpx;
  border-radius: 14rpx;
  background-color: #FFFFFF;
  border: 1rpx solid #36393B;
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
  border-radius: 14rpx;
  font-size: 28rpx;
  height: 72rpx;
  line-height: 72rpx;
  min-height: 72rpx;
  padding: 0 28rpx;

  &::after {
    border: none;
  }
}

.btn-primary {
  background-color: #36393B;
  color: #FFFFFF;
}

.btn-plain {
  background-color: #F5F5F5;
  color: #36393B;
}

.create-link {
  margin-top: 16rpx;
  height: 64rpx;
  line-height: 64rpx;
  min-height: 64rpx;
  font-size: 26rpx;
  flex: none;
  align-self: center;
  padding: 0 36rpx;
}

.link-row {
  justify-content: center;
  align-items: center;
}

.folder-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 24rpx;
  padding: 22rpx 0;
  border-bottom: 1rpx solid #E5E5E5;
}

.folder-info {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.folder-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 30rpx;
  color: #37291a;
}

.muted-name {
  color: #8a8a8a;
  font-style: italic;
}

.uncategorized-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 24rpx;
  padding: 22rpx 0;
  border-bottom: 1rpx solid #E5E5E5;
}

.group-picker-item {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 24rpx 20rpx;
  border-radius: 14rpx;
  background-color: #F5F5F5;
  margin-top: 8rpx;

  &.active {
    background-color: #E5E5E5;
  }
}

.group-picker-name {
  flex: 1;
  font-size: 28rpx;
  color: #37291a;
}

.group-picker-check {
  flex: none;
  font-size: 28rpx;
  color: #36393B;
}

.merge-tools {
  display: flex;
  gap: 24rpx;
  margin-top: 4rpx;
}

.merge-tool {
  font-size: 24rpx;
  color: #36393B;
  text-decoration: underline;
  padding: 4rpx 0;
}

.group-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 28rpx;
  border-radius: 18rpx;
  background-color: #FEF9FF;
  border: 1rpx solid #E5E5E5;

  &.active {
    border-color: #36393B;
    background-color: #F5F5F5;
  }
}

.group-info {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.group-actions {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.group-name {
  font-size: 32rpx;
  font-weight: 600;
  color: #37291a;
}

.check {
  color: #36393B;
  font-weight: 700;
  font-size: 36rpx;
}

.tag {
  flex-shrink: 0;
  font-size: 22rpx;
  color: #36393B;
  background-color: #F5F5F5;
  border-radius: 8rpx;
  padding: 4rpx 12rpx;

  &.self {
    background-color: #36393B;
    color: #FFFFFF;
  }
}

.member-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 24rpx;
  padding: 22rpx 0;
  border-bottom: 1rpx solid #E5E5E5;
}

.member-info {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.member-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 30rpx;
  color: #37291a;
}

.remove-btn {
  flex-shrink: 0;
  white-space: nowrap;
  background-color: transparent;
  color: #36393B;
  border: 1rpx solid #36393B;
  border-radius: 14rpx;
  font-size: 24rpx;
  height: 52rpx;
  line-height: 52rpx;
  min-height: 52rpx;
  padding: 0 24rpx;

  &::after {
    border: none;
  }
}

.edit-btn {
  flex-shrink: 0;
  white-space: nowrap;
  background-color: transparent;
  color: #36393B;
  border: 1rpx solid #36393B;
  border-radius: 14rpx;
  font-size: 24rpx;
  height: 52rpx;
  line-height: 52rpx;
  min-height: 52rpx;
  padding: 0 24rpx;

  &::after {
    border: none;
  }
}

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
  background-color: #F5F5F5;
  gap: 8rpx;
}
</style>
