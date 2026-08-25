<template>
  <view v-if="state.visible" class="global-loading">
    <view class="global-loading-card">
      <wd-loading type="circular" size="48" color="#36393B" />
      <text class="global-loading-text">{{ state.text }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { useGlobalLoading } from '@/utils/global-loading'

const { state } = useGlobalLoading()
</script>

<style lang="scss" scoped>
.global-loading {
  position: fixed;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(254, 249, 255, 0.7);
}

.global-loading-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24rpx;
  padding: 48rpx 64rpx;
  border-radius: 24rpx;
  background-color: rgba(255, 255, 255, 0.92);
  box-shadow: 0 8rpx 32rpx rgba(54, 57, 59, 0.12);
}

.global-loading-text {
  font-size: 26rpx;
  color: #37291a;
}
</style>
