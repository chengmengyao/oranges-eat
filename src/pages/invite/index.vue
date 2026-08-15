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

const store = useGroupStore()

const token = ref('')
const code = ref('')
const publicId = ref('')
const loading = ref(true)
const preview = ref<GroupPreview | null>(null)
const joinName = ref('')
const joining = ref(false)
const joinError = ref('')
const mode = ref<'invite' | 'public'>('invite')

async function load() {
  loading.value = true
  if (token.value || code.value) {
    const res = await previewInvite(token.value, code.value)
    if (res) {
      preview.value = res
      publicId.value = res.publicId
      store.setRecentPublicGroup({ publicId: res.publicId, name: res.name })
      mode.value = 'invite'
      loading.value = false
      return
    }
  }
  // token 无效或无 token：退化为公开只读
  if (publicId.value) {
    try {
      const res = await getPublicGroup(publicId.value)
      preview.value = res
      store.setRecentPublicGroup({ publicId: res.publicId, name: res.name })
      mode.value = 'public'
    } catch {
      preview.value = null
    }
  }
  loading.value = false
}

function goManage() {
  uni.reLaunch({ url: '/pages/manage/manage' })
}

function viewMap() {
  if (!publicId.value) return
  uni.removeStorageSync('invite_token')
  token.value = ''
  store.setRecentPublicGroup({ publicId: publicId.value, name: preview.value?.name || '美食清单' })
  uni.reLaunch({ url: `/pages/index/index?publicId=${encodeURIComponent(publicId.value)}` })
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
    uni.removeStorageSync('invite_token')
    token.value = ''
    code.value = ''
    preview.value = res
    publicId.value = res.publicId
    store.setRecentPublicGroup({ publicId: res.publicId, name: res.name })
    uni.showToast({ title: '加入成功', icon: 'success' })
    setTimeout(() => {
      uni.reLaunch({ url: `/pages/index/index?publicId=${encodeURIComponent(res.publicId)}` })
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
  if (token.value) {
    uni.setStorageSync('invite_token', token.value)
  }
  load()
})
</script>

<template>
  <view class="invite-page">
    <view v-if="loading" class="state-page">
      <view class="loading-orbit">
        <view class="loading-dot" />
        <view class="loading-dot delay" />
        <view class="loading-dot delay-more" />
      </view>
      <text class="state-copy">正在打开邀请…</text>
    </view>

    <template v-else-if="preview">
      <view class="invite-content">
        <view class="hero-visual">
          <image class="hero-image" src="/static/tabbar/眨眼.jpg" mode="aspectFit" />
        </view>

        <text class="eyebrow">共享美食地图</text>
        <text class="hero-title">一起收藏好吃的</text>
        <text class="hero-copy">
          {{ mode === 'invite' ? '朋友邀请你共同维护一份美食清单' : '你正在查看一份朋友分享的美食清单' }}
        </text>

        <view class="group-card">
          <view class="group-info">
            <text class="group-label">邀请你加入</text>
            <text class="group-name">{{ preview.name }}</text>
            <text class="group-meta">{{ preview.memberCount }} 位成员 · 一起发现好店</text>
          </view>
          <view class="member-faces">
            <image src="/static/tabbar/汉堡2.jpg" mode="aspectFit" />
          </view>
        </view>

        <view
          v-if="mode === 'invite' && !preview.alreadyMember"
          class="name-card"
        >
          <view class="name-heading">
            <text class="name-label">加入后如何称呼你</text>
            <text class="required-tag">必填</text>
          </view>
          <input
            v-model="joinName"
            class="name-input"
            placeholder="例如：小橙"
            placeholder-class="input-placeholder"
            maxlength="20"
            confirm-type="done"
            @confirm="confirmJoin"
          />
          <text class="name-tip">仅清单成员可见，用于成员列表和标记店铺由谁添加</text>
          <text v-if="joinError" class="error">{{ joinError }}</text>
        </view>
      </view>

      <view class="invite-actions">
        <button
          v-if="mode === 'invite' && !preview.alreadyMember"
          class="action-btn primary-action"
          hover-class="primary-action-hover"
          :disabled="joining"
          :loading="joining"
          @click="confirmJoin"
        >
          加入这份清单
        </button>
        <button
          v-else
          class="action-btn primary-action"
          hover-class="primary-action-hover"
          @click="viewMap"
        >
          {{ preview.alreadyMember ? '进入我的清单' : '查看共享地图' }}
        </button>
        <button
          v-if="false && mode === 'invite' && !preview.alreadyMember"
          class="action-btn secondary-action"
          @click="viewMap"
        >
          先看看地图
        </button>
      </view>
    </template>

    <view v-else class="state-page invalid-page">
      <view class="invalid-visual">
        <image src="/static/tabbar/惊讶.png" mode="aspectFit" />
      </view>
      <text class="state-title">这份邀请暂时打不开</text>
      <text class="state-copy">邀请可能已过期或被撤销，请让朋友重新生成</text>
      <button class="action-btn primary-action state-action" hover-class="primary-action-hover" @click="goManage">
        返回我的清单
      </button>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.invite-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  padding: 28rpx 40rpx calc(32rpx + env(safe-area-inset-bottom));
  background-color: $page-bg;
}

.invite-content {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  width: 100%;
}

.hero-visual {
  position: relative;
  width: 380rpx;
  height: 236rpx;
  margin: 10rpx auto 4rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.hero-image {
  width: 200rpx;
  height: 200rpx;
  border-radius: 32rpx;
}

.eyebrow {
  margin-top: 4rpx;
  padding: 8rpx 18rpx;
  border-radius: 999rpx;
  background-color: rgba(255, 199, 39, 0.2);
  color: $text-primary;
  font-size: 22rpx;
  font-weight: 600;
  letter-spacing: 2rpx;
}

.hero-title {
  margin-top: 18rpx;
  color: $text-primary;
  font-size: 52rpx;
  font-weight: 800;
  letter-spacing: -1rpx;
  line-height: 1.18;
}

.hero-copy {
  max-width: 590rpx;
  margin-top: 14rpx;
  color: $text-secondary;
  font-size: 27rpx;
  line-height: 1.55;
  text-align: center;
}

.group-card {
  display: flex;
  align-items: center;
  width: 100%;
  margin-top: 32rpx;
  padding: 26rpx 24rpx;
  border: 1rpx solid rgba(54, 57, 59, 0.08);
  border-radius: 28rpx;
  background-color: $card-bg;
  box-shadow: 0 14rpx 34rpx rgba(55, 41, 26, 0.08);
}

.group-info {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  margin-left: 20rpx;
}

.group-label {
  color: $text-secondary;
  font-size: 21rpx;
}

.group-name {
  overflow: hidden;
  margin-top: 4rpx;
  color: $text-primary;
  font-size: 32rpx;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.group-meta {
  margin-top: 6rpx;
  color: $text-secondary;
  font-size: 22rpx;
}

.member-faces {
  display: flex;
  flex: none;
  margin-left: 12rpx;

  image {
    width: 90rpx;
    height: 90rpx;
    border: 4rpx solid $card-bg;
    border-radius: 50%;
    background-color: $section-bg;
  }
}

.name-card {
  width: 100%;
  margin-top: 22rpx;
  padding: 24rpx;
  border-radius: 24rpx;
  background-color: rgba(254, 252, 249, 0.72);
}

.name-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.name-label {
  color: $text-primary;
  font-size: 27rpx;
  font-weight: 650;
}

.required-tag {
  color: $text-secondary;
  font-size: 20rpx;
}

.name-input {
  width: 100%;
  height: 84rpx;
  margin-top: 16rpx;
  padding: 0 22rpx;
  border: 2rpx solid rgba(54, 57, 59, 0.16);
  border-radius: 18rpx;
  background-color: $card-bg;
  color: $text-primary;
  font-size: 28rpx;
}

.input-placeholder {
  color: rgba(107, 111, 115, 0.62);
}

.name-tip {
  display: block;
  margin-top: 12rpx;
  color: $text-secondary;
  font-size: 21rpx;
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
  padding-top: 30rpx;
}

.action-btn {
  width: 100%;
  margin: 0;
  border: none;
  font-size: 30rpx;
  font-weight: 700;

  &::after {
    border: none;
  }
}

.primary-action {
  height: 96rpx;
  border-radius: 48rpx;
  background-color: $pink-primary;
  color: #fff;
  line-height: 96rpx;
  box-shadow: 0 14rpx 28rpx rgba(54, 57, 59, 0.2);

  &::after {
    color: #fff;
  }
}

.primary-action[disabled] {
  opacity: 0.72;

  &::after {
    color: rgba(255, 255, 255, 0.72);
  }
}

.primary-action-hover {
  background-color: #2a2c2e;

  &::after {
    color: #fff;
  }
}

.action-star {
  margin-right: 12rpx;
  color: $warning;
}

.secondary-action {
  height: 84rpx;
  margin-top: 18rpx;
  border-radius: 42rpx;
  background-color: rgba(254, 252, 249, 0.72);
  color: $text-primary;
  line-height: 84rpx;
}

.state-page {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: calc(100vh - 120rpx);
  text-align: center;
}

.loading-orbit {
  display: flex;
  gap: 12rpx;
  margin-bottom: 24rpx;
}

.loading-dot {
  width: 18rpx;
  height: 18rpx;
  border-radius: 50%;
  background-color: $warning;
  opacity: 1;
}

.loading-dot.delay {
  opacity: 0.68;
}

.loading-dot.delay-more {
  opacity: 0.36;
}

.invalid-visual {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 220rpx;
  height: 220rpx;
  margin-bottom: 32rpx;
  border-radius: 50%;
  background-color: $card-bg;
  box-shadow: 0 18rpx 46rpx rgba(55, 41, 26, 0.1);

  image {
    width: 190rpx;
    height: 190rpx;
  }
}

.state-title {
  color: $text-primary;
  font-size: 40rpx;
  font-weight: 750;
}

.state-copy {
  max-width: 540rpx;
  margin-top: 16rpx;
  color: $text-secondary;
  font-size: 26rpx;
  line-height: 1.55;
}

.state-action {
  margin-top: 44rpx;
}
</style>
