<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import type { PublicShopView, ShopView } from '@/types/shop'
import type { GroupView } from '@/types/group'
import { listPublicMapShops } from '@/services/shop'
import { listMyGroups } from '@/services/group'
import { useGroupStore } from '@/stores/group'
import { CATEGORY_LABELS, SHOP_CATEGORIES } from '@/constants/shop'
import {
  getCurrentLocation,
  getDefaultCenter,
  getLastPosition,
  hasLocationPermission,
  openLocationSettings,
} from '@/utils/location'
import { formatDistance, haversineDistance, sortByDistance } from '@/utils/geo'
import { resolveMapGroup } from '@/utils/map-group'
import {
  buildMarkers,
  findShopIdByMarker,
  MARKER_HEIGHT,
  MARKER_WIDTH,
  MARKER_ICON_BY_CATEGORY,
} from '@/utils/marker'

const store = useGroupStore()

const MARKER_ICONS = MARKER_ICON_BY_CATEGORY

interface Marker {
  id: number
  latitude: number
  longitude: number
  iconPath: string
  width: number
  height: number
  callout?: {
    content: string
    color: string
    fontSize: number
    borderRadius: number
    bgColor: string
    padding: number
    display: 'ALWAYS'
  }
}

interface MarkerInfo {
  id: number
  shopId: string
}

const shops = ref<(ShopView | PublicShopView)[]>([])
const markers = ref<Marker[]>([])
const markerMap = new Map<number, string>()

const cachedPosition = getLastPosition()
const center = ref(cachedPosition || getDefaultCenter())
const currentPosition = ref(cachedPosition)
const hasPosition = ref(Boolean(cachedPosition))
const locationMsg = ref(hasPosition.value ? '' : '尚未获取当前位置')
const locating = ref(false)

const currentGroup = ref<GroupView | null>(null)
const publicId = ref('')
const requestedPublicId = ref('')
const isMember = ref(false)

const groupOptions = ref<(GroupView | { id: ''; publicId: string; name: string })[]>([])
const showGroupPicker = ref(false)

const loading = ref(false)
const loadedOnce = ref(false)
const errorMsg = ref('')

const selectedShop = ref<(ShopView | PublicShopView) | null>(null)
const showDetail = ref(false)

const showNearby = ref(false)
const nearbyLoading = ref(false)

let markerSeq = 0

function shopOf(s: ShopView | PublicShopView): ShopView | null {
  return 'creatorName' in s ? (s as ShopView) : null
}

function buildMarkerView(list: (ShopView | PublicShopView)[]) {
  const { markers: built, mapping } = buildMarkers(list, markerSeq)
  markerSeq += built.length
  markerMap.clear()
  mapping.forEach((shopId, id) => markerMap.set(id, shopId))
  markers.value = built.map((m) => ({
    id: m.id,
    latitude: m.latitude,
    longitude: m.longitude,
    iconPath: m.iconPath,
    width: MARKER_WIDTH,
    height: MARKER_HEIGHT,
    callout: {
      content: (list.find((s) => s.id === m.shopId)?.name) || '',
      color: '#37291a',
      fontSize: 12,
      borderRadius: 6,
      bgColor: '#fefcf9',
      padding: 6,
      display: 'ALWAYS' as const,
    },
  }))
}

async function fitShopMarkers(list: (ShopView | PublicShopView)[]) {
  if (list.length === 0) return
  await nextTick()
  const mapCtx = uni.createMapContext('shopMap')
  if (list.length === 1) {
    center.value = { latitude: list[0].latitude, longitude: list[0].longitude }
    mapScale.value = 15
    mapCtx.moveToLocation({ latitude: list[0].latitude, longitude: list[0].longitude })
    return
  }
  mapCtx.includePoints({
    points: list.map((shop) => ({ latitude: shop.latitude, longitude: shop.longitude })),
    padding: [80, 40, 180, 40],
  })
}

async function loadGroups() {
  let groups: GroupView[] = []
  try {
    groups = await listMyGroups()
    store.setGroups(groups)
  } catch {
    groups = []
  }

  const recent = store.getRecentPublicGroup()
  const options: (GroupView | { id: ''; publicId: string; name: string })[] = [...groups]
  if (recent && !groups.some((g) => g.publicId === recent.publicId)) {
    options.push({ id: '', publicId: recent.publicId, name: recent.name })
  }
  groupOptions.value = options

  const selection = resolveMapGroup(
    groups,
    store.state.currentGroupId,
    requestedPublicId.value,
    recent,
  )
  currentGroup.value = selection.group
  publicId.value = selection.publicId
  isMember.value = selection.isMember
  if (selection.isMember && selection.group && selection.group.id !== store.state.currentGroupId) {
    store.setCurrentGroup(selection.group.id)
  }
}

async function loadShops() {
  if (!publicId.value) return
  loading.value = true
  errorMsg.value = ''
  let loadedShops: (ShopView | PublicShopView)[] | null = null
  try {
    const list = await listPublicMapShops(publicId.value)
    shops.value = list
    buildMarkerView(list)
    loadedShops = list
    loadedOnce.value = true
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : '加载失败'
  } finally {
    loading.value = false
  }
  if (loadedShops) await fitShopMarkers(loadedShops)
}

async function refresh() {
  await loadGroups()
  loadedOnce.value = true
  await loadShops()
}

async function updateCurrentLocation(showFailureModal: boolean) {
  if (locating.value) return
  locating.value = true
  locationMsg.value = '正在获取当前位置…'
  const res = await getCurrentLocation()
  if (res.ok) {
    currentPosition.value = res.position
    hasPosition.value = true
    locationMsg.value = ''
    if (showFailureModal) {
      center.value = res.position
      mapScale.value = 16
      await nextTick()
      uni.createMapContext('shopMap').moveToLocation({
        latitude: res.position.latitude,
        longitude: res.position.longitude,
      })
    }
  } else {
    locationMsg.value = hasPosition.value
      ? '当前定位失败，正在使用上次位置'
      : '定位失败，请检查权限设置'
    if (!showFailureModal) {
      locating.value = false
      return
    }
    uni.showModal({
      title: '定位不可用',
      content: '是否前往设置开启定位权限？',
      confirmText: '去设置',
      success: (r) => {
        if (r.confirm) openLocationSettings()
      },
    })
  }
  locating.value = false
}

async function onGetLocation() {
  await updateCurrentLocation(true)
}

async function refreshAuthorizedLocation() {
  if (await hasLocationPermission()) {
    await updateCurrentLocation(false)
  }
}

function onMarkerTap(e: { markerId?: number }) {
  const shopId = findShopIdByMarker(e.markerId as number, markerMap)
  if (!shopId) return
  const shop = shops.value.find((s) => s.id === shopId)
  if (shop) {
    selectedShop.value = shop
    showDetail.value = true
  }
}

function onTapMap() {
  if (showDetail.value) showDetail.value = false
  if (showNearby.value) showNearby.value = false
}

function openNearby() {
  showNearby.value = true
  if (!hasPosition.value) return
  nearbyLoading.value = true
  setTimeout(() => {
    nearbyLoading.value = false
  }, 300)
}

function formattedDistance(s: ShopView | PublicShopView): string {
  if (!currentPosition.value) return '未定位'
  return formatDistance(haversineDistance(currentPosition.value, s))
}

const nearbyList = computed(() => {
  if (!currentPosition.value) return []
  return sortByDistance(currentPosition.value, shops.value)
})

function navigate() {
  const s = selectedShop.value
  if (!s) return
  uni.openLocation({
    latitude: s.latitude,
    longitude: s.longitude,
    name: s.name,
    address: s.address,
  })
}

const mapScale = ref(12)

const MIN_SCALE = 3
const MAX_SCALE = 20

function zoomIn() {
  mapScale.value = Math.min(MAX_SCALE, mapScale.value + 1)
}

function zoomOut() {
  mapScale.value = Math.max(MIN_SCALE, mapScale.value - 1)
}

function goManage() {
  uni.switchTab({ url: '/pages/manage/manage' })
}

function openGroupPicker() {
  showGroupPicker.value = true
}

function selectGroup(option: (typeof groupOptions.value)[number]) {
  publicId.value = option.publicId
  if (option.id) {
    currentGroup.value = option as GroupView
    isMember.value = true
    store.setCurrentGroup(option.id)
  } else {
    currentGroup.value = {
      id: '',
      publicId: option.publicId,
      name: option.name,
      role: 'member',
      updatedAt: new Date(0),
      isOwner: false,
    }
    isMember.value = false
    store.setRecentPublicGroup({ publicId: option.publicId, name: option.name })
  }
  showGroupPicker.value = false
  loadedOnce.value = true
  loadShops()
}

onLoad((query) => {
  if (query?.publicId) {
    requestedPublicId.value = decodeURIComponent(query.publicId as string)
    publicId.value = requestedPublicId.value
  }
})

onShow(() => {
  refresh()
  refreshAuthorizedLocation()
})
</script>

<template>
  <view class="map-page">
    <view v-if="loading && !loadedOnce" class="center-loading">
      <text>加载店铺…</text>
    </view>
    <view v-else-if="errorMsg && !loadedOnce" class="center-loading">
      <text>{{ errorMsg }}</text>
      <button class="retry-btn" @click="refresh">重试</button>
    </view>

    <map
      v-else
      id="shopMap"
      :latitude="center.latitude"
      :longitude="center.longitude"
      :scale="mapScale"
      :markers="markers"
      :show-location="hasPosition"
      @markertap="onMarkerTap"
      @tap="onTapMap"
      class="map"
    />

    <view class="top-bar">
      <view class="group-chip" @click="openGroupPicker">
        <text class="chip-name">{{ currentGroup ? currentGroup.name : '未选择清单' }}</text>
        <text v-if="currentGroup" class="chip-tag">{{ isMember ? (currentGroup.isOwner ? '创建者' : '成员') : '访客' }}</text>
        <text class="chip-arrow">▾</text>
      </view>
      <view class="legend">
        <view v-for="c in SHOP_CATEGORIES" :key="c" class="legend-item">
          <image :src="MARKER_ICONS[c]" class="legend-icon" mode="aspectFit" />
          <text class="legend-label">{{ CATEGORY_LABELS[c] }}</text>
        </view>
      </view>
    </view>

    <view v-if="showGroupPicker" class="picker-mask" @click="showGroupPicker = false">
      <view class="picker-sheet" @click.stop>
        <view class="sheet-head">
          <text class="sheet-title">选择清单</text>
          <text class="sheet-close" @click="showGroupPicker = false">✕</text>
        </view>
        <scroll-view scroll-y class="picker-list">
          <view
            v-for="opt in groupOptions"
            :key="opt.publicId"
            class="picker-item"
            :class="{ active: publicId === opt.publicId }"
            @click="selectGroup(opt)"
          >
            <text class="picker-name">{{ opt.name }}</text>
            <text v-if="publicId === opt.publicId" class="picker-check">✓</text>
          </view>
        </scroll-view>
      </view>
    </view>

    <view v-if="!currentGroup" class="no-group-tip" @click="goManage">
      <text class="tip-text">尚未选择共享清单</text>
      <text class="tip-action">去管理 ›</text>
    </view>

    <view class="zoom-group">
      <view class="zoom-btn" @click="zoomIn">
        <text class="zoom-icon">+</text>
      </view>
      <view class="zoom-divider" />
      <view class="zoom-btn" @click="zoomOut">
        <text class="zoom-icon">−</text>
      </view>
    </view>

    <view class="fab-group">
      <view class="fab" @click="onGetLocation">
        <image class="fab-icon" src="/static/tabbar/位置.png" mode="aspectFit" />
        <text class="fab-text">获取位置</text>
      </view>
      <view class="fab" @click="openNearby">
        <image class="fab-icon" src="/static/tabbar/离我最近.png" mode="aspectFit" />
        <text class="fab-text">离我最近</text>
      </view>
    </view>

    <view class="location-status" @click="onGetLocation">
      <text>{{ locationMsg || '已定位当前位置' }}</text>
    </view>

    <!-- 店铺详情浮层 -->
    <view v-if="showDetail && selectedShop" class="detail-sheet" @click.stop>
      <view class="detail-head">
        <text class="detail-name">{{ selectedShop.name }}</text>
        <text class="cat-tag">{{ CATEGORY_LABELS[selectedShop.category] }}</text>
        <text class="close" @click="showDetail = false">✕</text>
      </view>
      <text class="detail-address">{{ selectedShop.address }}</text>
      <text v-if="selectedShop.remark" class="detail-remark">{{ selectedShop.remark }}</text>
      <view class="detail-bottom">
        <text class="detail-distance">直线距离：{{ formattedDistance(selectedShop) }}</text>
        <button class="nav-btn" @click="navigate">导航前往</button>
      </view>
      <text v-if="shopOf(selectedShop)" class="detail-creator">
        {{ shopOf(selectedShop)?.creatorName }} 添加
      </text>
    </view>

    <!-- 离我最近弹层 -->
    <view v-if="showNearby" class="nearby-mask" @click="showNearby = false">
      <view class="nearby-sheet" @click.stop>
        <view class="sheet-head">
          <text class="sheet-title">离我最近</text>
          <text class="close" @click="showNearby = false">✕</text>
        </view>
        <view v-if="!hasPosition" class="sheet-empty">
          <text>尚未获取当前位置</text>
          <button class="retry-btn" @click="onGetLocation">获取位置</button>
        </view>
        <view v-else-if="nearbyLoading" class="sheet-empty">计算中…</view>
        <view v-else-if="nearbyList.length === 0" class="sheet-empty">还没有店铺</view>
        <scroll-view v-else scroll-y class="nearby-list">
          <view
            v-for="(s, idx) in nearbyList"
            :key="s.id"
            class="nearby-item"
            @click="showDetail = true; selectedShop = s; showNearby = false"
          >
            <text class="rank">{{ idx + 1 }}</text>
            <view class="nearby-info">
              <text class="nearby-name">{{ s.name }}</text>
              <text class="nearby-distance">直线距离 {{ formattedDistance(s) }}</text>
            </view>
          </view>
        </scroll-view>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.map-page {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

.map {
  width: 100%;
  height: 100%;
}

.center-loading {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20rpx;
  background-color: #efe9d9;
  color: #73675a;
}

.retry-btn {
  background-color: #fd355a;
  color: #fff;
  border: none;
  border-radius: 14rpx;
  font-size: 26rpx;
  height: 64rpx;
  line-height: 64rpx;
  min-height: 64rpx;
  padding: 0 32rpx;

  &::after {
    border: none;
  }
}

.top-bar {
  position: absolute;
  top: 16rpx;
  left: 16rpx;
  right: 16rpx;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  pointer-events: none;
}

.no-group-tip {
  position: absolute;
  left: 16rpx;
  right: 16rpx;
  bottom: calc(160rpx + env(safe-area-inset-bottom));
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16rpx;
  background-color: rgba(254, 252, 249, 0.95);
  border: 1rpx solid #f5a7a2;
  border-radius: 999rpx;
  padding: 16rpx 32rpx;
  box-shadow: 0 4rpx 16rpx rgba(55, 41, 26, 0.08);
}

.tip-text {
  font-size: 26rpx;
  color: #73675a;
}

.tip-action {
  font-size: 26rpx;
  font-weight: 600;
  color: #980000;
}

.group-chip {
  align-self: flex-start;
  display: flex;
  align-items: center;
  gap: 12rpx;
  background-color: #fefcf9;
  border: 1rpx solid #ead8cf;
  border-radius: 999rpx;
  padding: 10rpx 20rpx;
  box-shadow: 0 4rpx 16rpx rgba(55, 41, 26, 0.08);
  pointer-events: auto;
}

.chip-name {
  font-size: 28rpx;
  font-weight: 700;
  color: #37291a;
}

.chip-tag {
  font-size: 20rpx;
  color: #980000;
  background-color: #ffdece;
  border-radius: 8rpx;
  padding: 2rpx 10rpx;
}

.chip-arrow {
  font-size: 24rpx;
  color: #73675a;
}

.picker-mask {
  position: absolute;
  inset: 0;
  z-index: 20;
  background-color: rgba(0, 0, 0, 0.35);
}

.picker-sheet {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 21;
  background-color: #fefcf9;
  border-radius: 24rpx 24rpx 0 0;
  padding: 32rpx 32rpx calc(32rpx + env(safe-area-inset-bottom));
}

.sheet-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 32rpx;
}

.sheet-title {
  font-size: 32rpx;
  font-weight: 700;
  color: #37291a;
}

.sheet-close {
  font-size: 32rpx;
  color: #73675a;
  padding: 4rpx 12rpx;
}

.picker-list {
  max-height: 50vh;
  display: block;
  margin-top: 32rpx;
}

.picker-item {
  display: flex;
  align-items: center;
  gap: 24rpx;
  padding: 40rpx 36rpx;
  border-radius: 24rpx;
  background-color: #f5efe5;
  margin-bottom: 32rpx;

  &:last-child {
    margin-bottom: 0;
  }

  &.active {
    background-color: #fde0d2;
  }
}

.picker-name {
  font-size: 32rpx;
  font-weight: 600;
  color: #37291a;
  line-height: 1.3;
  flex: 1;
}

.picker-check {
  color: #fd355a;
  font-size: 32rpx;
  font-weight: 700;
}

.legend {
  align-self: flex-start;
  display: flex;
  gap: 20rpx;
  background-color: rgba(254, 252, 249, 0.95);
  border: 1rpx solid #ead8cf;
  border-radius: 999rpx;
  padding: 8rpx 20rpx;
  box-shadow: 0 4rpx 16rpx rgba(55, 41, 26, 0.08);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6rpx;
}

.legend-icon {
  width: 28rpx;
  height: 28rpx;
}

.legend-label {
  font-size: 22rpx;
  color: #37291a;
}

.fab-group {
  position: absolute;
  right: 20rpx;
  bottom: calc(40rpx + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.zoom-group {
  position: absolute;
  right: 20rpx;
  bottom: calc(340rpx + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  align-items: center;
  background-color: rgba(254, 252, 249, 0.95);
  border: 1rpx solid #ead8cf;
  border-radius: 16rpx;
  box-shadow: 0 4rpx 16rpx rgba(55, 41, 26, 0.08);
  overflow: hidden;
}

.zoom-btn {
  width: 72rpx;
  height: 72rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.zoom-icon {
  font-size: 40rpx;
  color: #37291a;
  line-height: 1;
}

.zoom-divider {
  width: 40rpx;
  height: 1rpx;
  background-color: #ead8cf;
}

.fab {
  width: 104rpx;
  height: 104rpx;
  border-radius: 0;
  background-color: transparent;
  color: #37291a;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4rpx;
  font-size: 28rpx;
}

.fab-icon {
  width: 56rpx;
  height: 56rpx;
}

.fab-text {
  font-size: 22rpx;
}

.location-status {
  position: absolute;
  left: 20rpx;
  bottom: calc(40rpx + env(safe-area-inset-bottom));
  background-color: rgba(254, 252, 249, 0.95);
  border: 1rpx solid #ead8cf;
  border-radius: 999rpx;
  padding: 10rpx 20rpx;
  font-size: 22rpx;
  color: #73675a;
}

.detail-sheet {
  position: absolute;
  left: 16rpx;
  right: 16rpx;
  bottom: calc(24rpx + env(safe-area-inset-bottom));
  background-color: #fefcf9;
  border-radius: 20rpx;
  padding: 24rpx;
  box-shadow: 0 8rpx 32rpx rgba(55, 41, 26, 0.18);
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}

.detail-head {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.detail-name {
  font-size: 32rpx;
  font-weight: 700;
  color: #37291a;
  flex: 1;
}

.cat-tag {
  font-size: 20rpx;
  color: #980000;
  background-color: #ffebec;
  border-radius: 8rpx;
  padding: 4rpx 12rpx;
}

.close {
  font-size: 28rpx;
  color: #73675a;
  padding: 4rpx 8rpx;
}

.detail-address {
  font-size: 26rpx;
  color: #37291a;
  font-weight: 500;
}

.detail-remark {
  font-size: 24rpx;
  color: #73675a;
  background-color: #f8efe7;
  padding: 6rpx 12rpx;
  border-radius: 8rpx;
  line-height: 1.5;
  align-self: flex-start;
  max-width: 100%;
}

.detail-distance {
  font-size: 26rpx;
  color: #37291a;
}

.detail-bottom {
  position: relative;
  display: flex;
  align-items: center;
  margin-top: 4rpx;
  padding-right: 0;
}

.detail-creator {
  font-size: 22rpx;
  color: #980000;
}

.nav-btn {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  background-color: #fd355a;
  color: #fff;
  border: none;
  border-radius: 12rpx;
  font-size: 24rpx;
  height: 56rpx;
  line-height: 56rpx;
  min-height: 56rpx;
  padding: 0 24rpx;

  &::after {
    border: none;
  }
}

.nearby-mask {
  position: absolute;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.35);
  z-index: 10;
}

.nearby-sheet {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 60vh;
  background-color: #fefcf9;
  border-radius: 24rpx 24rpx 0 0;
  padding: 24rpx;
  display: flex;
  flex-direction: column;
}

.sheet-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16rpx;
}

.sheet-title {
  font-size: 32rpx;
  font-weight: 700;
  color: #37291a;
}

.sheet-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20rpx;
  color: #73675a;
}

.nearby-list {
  flex: 1;
}

.nearby-item {
  display: flex;
  gap: 20rpx;
  align-items: center;
  padding: 20rpx 0;
  border-bottom: 1rpx solid #f0e6dc;
}

.rank {
  width: 40rpx;
  height: 40rpx;
  border-radius: 50%;
  background-color: #fd355a;
  color: #fff;
  text-align: center;
  line-height: 40rpx;
  font-size: 22rpx;
  font-weight: 700;
  flex: none;
}

.nearby-info {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}

.nearby-name {
  font-size: 28rpx;
  color: #37291a;
}

.nearby-distance {
  font-size: 22rpx;
  color: #73675a;
}
</style>
