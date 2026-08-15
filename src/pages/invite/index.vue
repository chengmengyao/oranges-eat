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
    joinError.value = '请输入显示名称'
    return
  }
  if (name.length > 20) {
    joinError.value = '显示名称不能超过 20 字'
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
    <view v-if="loading" class="center">
      <wd-loading size="40rpx" />
      <text class="muted">加载中…</text>
    </view>

    <template v-else-if="preview">
      <view class="card hero-card">
        <text class="emoji">🍊</text>
        <text class="title">{{ preview.name }}</text>
        <text class="muted">{{ preview.memberCount }} 位成员在共同维护这份美食地图</text>

        <view v-if="mode === 'invite'" class="entry-list">
          <button class="btn-primary" @click="viewMap">直接看看地图</button>
          <view class="join-box">
            <text class="muted">加入后可以一起添加店铺</text>
            <input
              v-model="joinName"
              class="input"
              placeholder="输入显示名称（1-20 字）"
              maxlength="20"
            />
            <text v-if="joinError" class="error">{{ joinError }}</text>
            <button
              class="btn-primary"
              :disabled="joining"
              :loading="joining"
              @click="confirmJoin"
            >
              确认加入
            </button>
          </view>
        </view>

        <view v-else class="entry-list">
          <text class="muted">当前为只读访客，可直接浏览公开美食地图</text>
          <button class="btn-primary" @click="viewMap">查看地图</button>
        </view>
      </view>
    </template>

    <view v-else class="center card">
      <image class="empty-image" src="/static/tabbar/惊讶.png" mode="aspectFit" />
      <text class="title">清单不存在或链接已失效</text>
      <text class="muted">请向创建者获取新的邀请链接</text>
      <button class="btn-primary" @click="goManage">前往管理</button>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.invite-page {
  padding: 32rpx;
}

.center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20rpx;
  padding: 80rpx 24rpx;
}

.hero-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;
  padding: 56rpx 32rpx;
  text-align: center;
}

.emoji {
  font-size: 72rpx;
}

.empty-image {
  width: 120rpx;
  height: 120rpx;
  margin-bottom: 16rpx;
}

.title {
  font-size: 40rpx;
  font-weight: 700;
  color: #37291a;
}

.muted {
  font-size: 26rpx;
  color: #6B6F73;
}

.entry-list {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 20rpx;
  margin-top: 16rpx;
}

.btn-primary {
  background-color: #36393B;
  color: #FFFFFF;
  border-radius: 14rpx;
  border: none;
  font-size: 28rpx;
  height: 72rpx;
  line-height: 72rpx;
  min-height: 72rpx;
  padding: 0 28rpx;

  &::after {
    border: none;
  }
}

.join-box {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  padding: 24rpx;
  border-radius: 16rpx;
  background-color: #F5F5F5;
}

.input {
  height: 80rpx;
  padding: 0 20rpx;
  border-radius: 12rpx;
  background-color: #FEF9FF;
  border: 1rpx solid #36393B;
}

.error {
  color: #36393B;
  font-size: 24rpx;
}
</style>
