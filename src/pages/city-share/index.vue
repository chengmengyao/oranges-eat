<script setup lang="ts">
import { ref } from 'vue'
import { onLoad, onShareAppMessage } from '@dcloudio/uni-app'
import { acceptCityShare } from '@/services/shop'

const token = ref('')
const code = ref('')
const groupName = ref('')
const created = ref(false)
const loading = ref(true)
const errorMsg = ref('')

function sharePath() {
  return `/pages/city-share/index?token=${encodeURIComponent(token.value)}`
}

async function load() {
  if (!token.value && !code.value) {
    errorMsg.value = '分享链接无效'
    loading.value = false
    return
  }
  try {
    const result = await acceptCityShare(token.value, code.value)
    groupName.value = result.name
    created.value = true
    setTimeout(() => {
      uni.reLaunch({ url: '/pages/index/index' })
    }, 900)
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : '分享链接已失效'
  } finally {
    loading.value = false
  }
}

function openSearch() {
  uni.switchTab({ url: '/pages/food/food' })
}

onLoad((query) => {
  token.value = typeof query?.token === 'string' ? decodeURIComponent(query.token) : ''
  const scene = typeof query?.scene === 'string' ? decodeURIComponent(query.scene) : ''
  for (const part of scene.split('&')) {
    const separator = part.indexOf('=')
    if (separator >= 0 && part.slice(0, separator) === 's') {
      code.value = part.slice(separator + 1)
    }
  }
  load()
})

onShareAppMessage(() => ({
  title: groupName.value ? `${groupName.value}的城市店铺` : '城市店铺分享',
  path: sharePath(),
}))
</script>

<template>
  <view class="city-share-page">
    <view class="city-share-head">
      <text class="eyebrow">城市店铺</text>
      <text class="title">城市共享清单</text>
      <text class="subtitle">正在为你创建可共同添加的共享清单</text>
    </view>

    <view v-if="loading" class="state">正在创建共享清单…</view>
    <view v-else-if="errorMsg" class="state error">{{ errorMsg }}</view>
    <view v-else-if="created" class="state success">共享清单“{{ groupName }}”已创建，正在进入小程序…</view>

    <button class="open-btn" @click="openSearch">打开橙子吃吃</button>
  </view>
</template>

<style lang="scss" scoped>
.city-share-page {
  min-height: 100vh;
  padding: 72rpx 32rpx calc(48rpx + env(safe-area-inset-bottom));
  background: #faf8f5;
  box-sizing: border-box;
}

.city-share-head {
  margin-bottom: 36rpx;
}

.eyebrow {
  display: block;
  color: #8a857e;
  font-size: 24rpx;
}

.title {
  display: block;
  margin-top: 12rpx;
  color: #37291a;
  font-size: 54rpx;
  font-weight: 700;
}

.subtitle {
  display: block;
  margin-top: 12rpx;
  color: #8a857e;
  font-size: 26rpx;
}

.shop-list {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.shop-card {
  padding: 28rpx;
  border-radius: 28rpx;
  background: #ffffff;
}

.shop-head {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.shop-name {
  flex: 1;
  color: #1a1a1a;
  font-size: 32rpx;
  font-weight: 700;
}

.category {
  color: #8a857e;
  font-size: 22rpx;
}

.address,
.remark {
  display: block;
  margin-top: 14rpx;
  color: #6b6f73;
  font-size: 25rpx;
}

.remark {
  color: #8a857e;
}

.state {
  padding: 120rpx 20rpx;
  color: #8a857e;
  font-size: 28rpx;
  text-align: center;
}

.error {
  color: #b34d42;
}

.success {
  color: #4a7b57;
}

.open-btn {
  margin-top: 44rpx;
  border: 0;
  border-radius: 48rpx;
  background: #36393b;
  color: #ffffff;
  font-size: 30rpx;
}
</style>
