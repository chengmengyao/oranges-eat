<script setup lang="ts">
import { ref } from 'vue'
import { onShow, onShareAppMessage } from '@dcloudio/uni-app'
import type { GroupView, MemberView } from '@/types/group'
import {
  bootstrap,
  createGroup,
  listMyGroups,
  listMembers,
  createInvite,
  createInviteQrCode,
  revokeInvite,
  removeMember,
  deleteGroup,
  updateGroupName,
} from '@/services/group'
import { useGroupStore } from '@/stores/group'
import { getCloudInitState, downloadFile } from '@/utils/cloud'

const store = useGroupStore()

const state = getCloudInitState()
const groups = ref<GroupView[]>([])
const currentGroupId = ref('')
const members = ref<MemberView[]>([])
const currentGroup = ref<GroupView | null>(null)

const createMode = ref(false)
const displayName = ref('')
const groupName = ref('')
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
const deleting = ref(false)

const cloudMissing = ref(!state.ready)
const recentPublicGroup = store.getRecentPublicGroup()

function loadGroups() {
  return listMyGroups().then((list) => {
    groups.value = list
    store.setGroups(list)
    const cur = store.currentGroup()
    if (cur) {
      currentGroupId.value = cur.id
      currentGroup.value = cur
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

async function refresh() {
  try {
    await loadGroups()
    await loadMembers()
  } catch (err) {
    uni.showToast({ title: err instanceof Error ? err.message : '加载失败', icon: 'none' })
  }
}

async function handleCreate() {
  const name = displayName.value.trim()
  const gname = groupName.value.trim()
  if (!name) {
    uni.showToast({ title: '请输入显示名称', icon: 'none' })
    return
  }
  if (!gname) {
    uni.showToast({ title: '请输入清单名称', icon: 'none' })
    return
  }
  creating.value = true
  try {
    const res = await createGroup(name, gname)
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

function switchGroup(id: string) {
  store.setCurrentGroup(id)
  currentGroupId.value = id
  currentGroup.value = store.currentGroup()
  members.value = []
  loadMembers()
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
  if (!recentPublicGroup) return
  uni.switchTab({ url: '/pages/index/index' })
}

onShow(() => {
  refresh()
})
</script>

<template>
  <view class="manage-page">
    <view v-if="cloudMissing" class="card warn-card">
      <text class="warn-title">云环境未配置</text>
      <text class="muted">{{ state.message }}</text>
    </view>

    <view v-else-if="groups.length === 0 && !createMode && !recentPublicGroup" class="card empty-card">
      <image class="empty-image" src="/static/tabbar/调皮.png" mode="aspectFit" />
      <text class="empty-title">创建你的第一份共享清单</text>
      <text class="muted">邀请朋友一起添加想吃的店</text>
      <button class="btn-primary" @click="createMode = true">开始创建</button>
    </view>

    <view v-else-if="groups.length === 0 && !createMode && recentPublicGroup" class="card empty-card">
      <text class="emoji">👀</text>
      <text class="empty-title">{{ recentPublicGroup.name }}</text>
      <text class="muted">当前为只读访客 · 加入清单后可添加店铺</text>
      <button class="btn-primary" @click="viewPublicMap">查看公开地图</button>
      <button class="btn-plain" @click="createMode = true">创建自己的清单</button>
    </view>

    <view v-else-if="createMode" class="card">
      <text class="section-title">创建共享清单</text>
      <input v-model="displayName" class="input" placeholder="我的显示名称（1-20 字）" maxlength="20" />
      <input v-model="groupName" class="input" placeholder="清单名称（1-30 字）" maxlength="30" />
      <view class="row-gap">
        <button class="btn-primary" :loading="creating" :disabled="creating" @click="handleCreate">
          创建
        </button>
        <button class="btn-plain" @click="createMode = false">取消</button>
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
        <button class="btn-plain create-link" @click="createMode = true">+ 创建新清单</button>
      </view>

      <view v-if="currentGroup" class="card">
        <view class="section-row">
          <text class="section-title">邀请朋友</text>
        </view>
        <text class="muted">朋友无需加入就能浏览地图，确认加入后即可添加店铺</text>
        <view class="row-gap">
          <button
            class="btn-primary"
            :loading="generatingInvite"
            :disabled="generatingInvite || !currentGroup.isOwner"
            @click="handleGenerateInvite"
          >
            生成邀请链接
          </button>
          <button
            class="btn-plain"
            :disabled="!currentGroup.isOwner"
            @click="handleRevokeInvite"
          >
            撤销全部邀请
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
              <button v-if="qrCodeFileId" class="btn-primary" @click="handleSaveQrCode">保存二维码到相册</button>
              <button class="btn-plain" @click="handleRevokeInvite">撤销此邀请</button>
            </view>
          </view>
        </wd-popup>
      </view>

      <view class="card">
        <view class="section-row">
          <text class="section-title">成员</text>
          <text v-if="currentGroup" class="muted">
            {{ currentGroup.isOwner ? '创建者可管理全部' : '仅可管理自己的店铺' }}
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
              v-if="currentGroup?.isOwner && !m.isSelf && m.role !== 'owner'"
              class="remove-btn"
              :disabled="removing"
              @click="confirmRemove(m)"
            >
              移除
            </button>
          </view>
        </view>
      </view>
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
  padding: 22rpx 0;
  border-bottom: 1rpx solid #E5E5E5;
}

.member-info {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.member-name {
  font-size: 30rpx;
  color: #37291a;
}

.remove-btn {
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
