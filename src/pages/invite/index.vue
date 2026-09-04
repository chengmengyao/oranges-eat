<script setup lang="ts">
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import type { GroupPreview } from '@/types/group'
import {
  previewInvite,
  acceptInvite,
  getPublicGroup,
} from '@/services/group'
import { useGroupStore } from '@/stores/group'
import { parseInviteEntry } from '@/utils/invite-entry'
import { openPublicMap } from '@/utils/public-open'
import { hideLoading, showLoading } from '@/utils/global-loading'

const store = useGroupStore()

const token = ref('')
const code = ref('')
const publicId = ref('')
const preview = ref<GroupPreview | null>(null)
const joinName = ref('')
const joining = ref(false)
const joinError = ref('')
const loadError = ref('')
const mode = ref<'invite' | 'public'>('invite')

async function load() {
  loadError.value = ''
  preview.value = null
  showLoading()
  try {
    if (token.value || code.value) {
      const res = await previewInvite(token.value, code.value)
      if (res) {
        preview.value = res
        publicId.value = res.publicId
        store.setRecentPublicGroup({ publicId: res.publicId, name: res.name })
        mode.value = 'invite'
        return
      }
    }

    // token 无效或无 token：退化为公开只读
    if (publicId.value) {
      const res = await getPublicGroup(publicId.value)
      preview.value = res
      store.setRecentPublicGroup({ publicId: res.publicId, name: res.name })
      mode.value = 'public'
    }
  } catch (err) {
    console.error('加载邀请失败', err)
    loadError.value = '加载失败，请检查网络后重试'
  } finally {
    hideLoading()
  }
}

function goManage() {
  uni.reLaunch({ url: '/pages/manage/manage' })
}

function viewMap() {
  if (!publicId.value) return
  token.value = ''
  store.setRecentPublicGroup({ publicId: publicId.value, name: preview.value?.name || '美食地图' })
  openPublicMap(publicId.value, preview.value?.name || '美食地图')
}

async function confirmJoin() {
  const name = joinName.value.trim()
  if (!name) {
    joinError.value = '请输入名称'
    return
  }
  if (name.length > 20) {
    joinError.value = '名称不能超过 20 字'
    return
  }
  if (!token.value && !code.value) {
    joinError.value = '邀请无效或已过期'
    return
  }
  joining.value = true
  joinError.value = ''
  try {
    const res = await acceptInvite(token.value, name, code.value)
    token.value = ''
    code.value = ''
    preview.value = res
    publicId.value = res.publicId
    store.setRecentPublicGroup({ publicId: res.publicId, name: res.name })
    uni.showToast({ title: '加入成功', icon: 'success' })
    setTimeout(() => {
      openPublicMap(res.publicId, res.name)
    }, 600)
  } catch (err) {
    joinError.value = err instanceof Error ? err.message : '邀请无效或已过期'
  } finally {
    joining.value = false
  }
}

onLoad((query) => {
  const entry = parseInviteEntry(query)
  token.value = entry.token
  publicId.value = entry.publicId
  code.value = entry.code
  load()
})
</script>

<template>
  <view class="invite-page">
    <global-loading />

    <template v-if="preview">
      <view class="invite-content">
        <view class="hero">
          <image class="hero-image" src="/static/invite/hero.png" mode="aspectFit" />
        </view>

        <text class="tag">共享美食地图</text>
        <text class="hero-title">一起收藏好吃的</text>
        <text class="hero-copy">
          {{ mode === 'invite' ? '朋友邀请你共同维护一张美食地图' : '你正在查看一份朋友分享的美食地图' }}
        </text>

        <view class="preview-card">
          <view class="avatar">
            <image class="avatar-image" src="/static/invite/avatar-person.png" mode="aspectFit" />
          </view>
          <view class="preview-info">
            <text class="preview-label">邀请你加入</text>
            <text class="preview-title">{{ preview.name }}</text>
            <text class="preview-meta">{{ preview.memberCount }} 位成员 · 一起发现好店</text>
          </view>
          <image class="food-stack" src="/static/invite/food-stack.png" mode="aspectFit" />
        </view>

        <view v-if="mode === 'invite' && !preview.alreadyMember" class="input-section">
          <view class="input-header">
            <text class="input-label">加入后如何称呼你</text>
            <text class="input-required">必填</text>
          </view>
          <input
            v-model="joinName"
            class="input-field"
            placeholder="例如：小橙"
            placeholder-class="input-placeholder"
            maxlength="20"
            confirm-type="done"
            @confirm="confirmJoin"
          />
          <text class="input-hint">仅清单成员可见，用于成员列表和标记店铺由谁添加</text>
          <text v-if="joinError" class="error">{{ joinError }}</text>
        </view>
      </view>

      <view class="invite-actions">
        <button
          v-if="mode === 'invite' && !preview.alreadyMember"
          class="action-btn btn-primary"
          hover-class="btn-primary-hover"
          :disabled="joining"
          :loading="joining"
          @click="confirmJoin"
        >
          <image v-if="!joining" class="btn-icon" src="/static/invite/user-white.png" mode="aspectFit" />
          <text>加入这份清单</text>
        </button>
        <button
          v-else
          class="action-btn btn-primary"
          hover-class="btn-primary-hover"
          @click="viewMap"
        >
          {{ preview.alreadyMember ? '进入我的清单' : '查看共享地图' }}
        </button>
      </view>
    </template>

    <view v-else class="state-page invalid-page">
      <view class="invalid-visual">
        <text class="invalid-mark">!</text>
      </view>
      <text class="state-title">{{ loadError ? '邀请加载失败' : '这份邀请暂时打不开' }}</text>
      <text class="state-copy">
        {{ loadError || '邀请可能已过期或被撤销，请让朋友重新生成' }}
      </text>
      <button
        class="action-btn btn-primary state-action"
        hover-class="btn-primary-hover"
        @click="loadError ? load() : goManage()"
      >
        {{ loadError ? '重新加载' : '返回我的清单' }}
      </button>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.invite-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  padding: 90rpx 45rpx calc(60rpx + env(safe-area-inset-bottom));
  background-color: #ffffff;
  box-sizing: border-box;
}

.invite-content {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  width: 100%;
}

.hero {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 45rpx;
}

.hero-image {
  width: 225rpx;
  height: 225rpx;
}

.tag {
  padding: 8rpx 22rpx;
  border-radius: 11rpx;
  background-color: rgba(0, 0, 0, 0.05);
  color: #666;
  font-size: 22rpx;
  font-weight: 500;
}

.hero-title {
  margin-top: 22rpx;
  color: #111;
  font-size: 52rpx;
  font-weight: 600;
  line-height: 1.2;
}

.hero-copy {
  max-width: 590rpx;
  margin-top: 15rpx;
  color: #888;
  font-size: 28rpx;
  line-height: 1.5;
  text-align: center;
}

.preview-card {
  display: flex;
  align-items: center;
  width: 100%;
  margin-top: 52rpx;
  padding: 30rpx;
  border: 2rpx solid #e8e8e8;
  border-radius: 22rpx;
  background-color: #f5f5f5;
  box-sizing: border-box;
}

.avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 82rpx;
  height: 82rpx;
  flex-shrink: 0;
  border-radius: 19rpx;
  background: linear-gradient(135deg, #f5a623 0%, #e85d75 100%);
}

.avatar-image {
  width: 45rpx;
  height: 45rpx;
}

.preview-info {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  margin-left: 22rpx;
}

.preview-label {
  color: #999;
  font-size: 24rpx;
}

.preview-title {
  overflow: hidden;
  margin-top: 4rpx;
  color: #111;
  font-size: 32rpx;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-meta {
  margin-top: 4rpx;
  color: #999;
  font-size: 24rpx;
}

.food-stack {
  width: 90rpx;
  height: 90rpx;
  flex-shrink: 0;
}

.input-section {
  width: 100%;
  margin-top: 45rpx;
}

.input-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.input-label {
  color: #111;
  font-size: 28rpx;
  font-weight: 600;
}

.input-required {
  color: #bbb;
  font-size: 22rpx;
}

.input-field {
  width: 100%;
  height: 88rpx;
  margin-top: 15rpx;
  padding: 0 30rpx;
  border: 2rpx solid #e0e0e0;
  border-radius: 19rpx;
  background-color: #fff;
  color: #111;
  font-size: 30rpx;
  box-sizing: border-box;
}

.input-placeholder {
  color: #ccc;
}

.input-hint {
  display: block;
  margin-top: 11rpx;
  color: #bbb;
  font-size: 22rpx;
  line-height: 1.45;
}

.error {
  display: block;
  margin-top: 10rpx;
  color: #b23a48;
  font-size: 22rpx;
}

.invite-actions {
  width: 100%;
  margin-top: auto;
  padding-top: 60rpx;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 92rpx;
  margin: 0;
  padding: 0;
  border: none;
  border-radius: 999rpx;
  font-size: 30rpx;
  font-weight: 500;
  line-height: normal;

  &::after {
    border: none;
  }
}

.btn-primary {
  background-color: #1a1a1a;
  color: #fff;

  &::after {
    color: #fff;
  }
}

.btn-primary-hover {
  opacity: 0.85;
  transform: scale(0.98);
}

.btn-primary[disabled] {
  opacity: 0.72;

  &::after {
    color: rgba(255, 255, 255, 0.72);
  }
}

.btn-icon {
  width: 30rpx;
  height: 30rpx;
  margin-right: 15rpx;
}

.state-page {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: calc(100vh - 180rpx);
  text-align: center;
}

.invalid-visual {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 220rpx;
  height: 220rpx;
  margin-bottom: 45rpx;
  border: 2rpx solid #e8e8e8;
  border-radius: 50%;
  background-color: #f5f5f5;
}

.invalid-mark {
  color: #111;
  font-size: 96rpx;
  font-weight: 600;
}

.state-title {
  color: #111;
  font-size: 40rpx;
  font-weight: 600;
}

.state-copy {
  max-width: 540rpx;
  margin-top: 16rpx;
  color: #888;
  font-size: 26rpx;
  line-height: 1.55;
}

.state-action {
  margin-top: 60rpx;
}
</style>
