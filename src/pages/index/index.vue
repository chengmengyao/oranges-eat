<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { onLoad, onShow, onUnload } from '@dcloudio/uni-app'
import type { PublicShopView, ShopView } from '@/types/shop'
import type { FolderView, GroupView } from '@/types/group'
import { listMemberMapShops, listPublicMapShops } from '@/services/shop'
import { listMyGroups, listPublicFolders } from '@/services/group'
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
import { resolveMapGroup, isRecentPublicGroupAvailable } from '@/utils/map-group'
import { hideLoading, showLoading } from '@/utils/global-loading'
import {
  buildMarkers,
  findShopIdByMarker,
  MARKER_HEIGHT,
  MARKER_WIDTH,
  MARKER_ICON_BY_CATEGORY,
} from '@/utils/marker'

const store = useGroupStore()

const MARKER_ICONS = MARKER_ICON_BY_CATEGORY

const LEGEND_EMOJIS: Record<string, string> = {
  restaurant: '🍝',
  spot: '🎫',
}

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
    display: 'BY_CLICK' | 'ALWAYS'
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
const locating = ref(false)

const currentGroup = ref<GroupView | null>(null)
const publicId = ref('')
const requestedPublicId = ref('')
const isMember = ref(false)

const groupOptions = ref<(GroupView | { id: ''; publicId: string; name: string })[]>([])
const showLayerPicker = ref(false)

const folders = ref<FolderView[]>([])
const uncategorizedCount = ref(0)
const folderFilter = ref('all')
const loadingFolders = ref(false)

const visibleShops = computed(() => {
  if (folderFilter.value === 'all') return shops.value
  if (folderFilter.value === 'none') {
    return shops.value.filter((s) => !s.folderId)
  }
  return shops.value.filter((s) => s.folderId === folderFilter.value)
})

const currentFilterLabel = computed(() => {
  if (folderFilter.value === 'all') return '全部'
  if (folderFilter.value === 'none') return '未分类'
  const f = folders.value.find((x) => x.id === folderFilter.value)
  return f ? f.name : '全部'
})

const loading = ref(false)
const loadedOnce = ref(false)
const errorMsg = ref('')
const loadFailed = ref(false)
const groupsSettled = ref(false)
const shopsSettled = ref(false)

const selectedShop = ref<(ShopView | PublicShopView) | null>(null)
const showDetail = ref(false)

const anyOverlayOpen = computed(() => showLayerPicker.value || showDetail.value)
watch(anyOverlayOpen, (open) => {
  if (open) {
    uni.hideTabBar({ animation: false })
  } else {
    uni.showTabBar({ animation: false })
  }
})

const showNearby = ref(false)

const highlightShopId = ref('')

let markerSeq = 0
let shopRequestSeq = 0
let refreshSeq = 0
let folderRequestSeq = 0
let highlightTimer: ReturnType<typeof setTimeout> | null = null

function isWeixinDevtools() {
  try {
    return uni.getDeviceInfo().platform === 'devtools'
  } catch {
    return false
  }
}

function moveMapToLocation(latitude: number, longitude: number) {
  // 微信开发者工具尚未实现 MapContext.moveToLocation，调用会抛出
  // appServiceSDKScriptError。开发工具中依靠响应式 center 更新即可移动地图。
  if (isWeixinDevtools()) return
  uni.createMapContext('shopMap').moveToLocation({
    latitude,
    longitude,
    fail: () => {
      // 真机定位中心已经由 center 同步，原生地图移动失败时无需再向上抛错。
    },
  })
}

function shopOf(s: ShopView | PublicShopView): ShopView | null {
  return 'creatorName' in s ? (s as ShopView) : null
}

function buildMarkerView(list: (ShopView | PublicShopView)[]) {
  const { markers: built, mapping } = buildMarkers(list, markerSeq)
  markerSeq += built.length
  markerMap.clear()
  mapping.forEach((shopId, id) => markerMap.set(id, shopId))
  markers.value = built.map((m) => {
    const highlighted = m.shopId === highlightShopId.value
    return {
      id: m.id,
      latitude: m.latitude,
      longitude: m.longitude,
      iconPath: m.iconPath,
      width: highlighted ? MARKER_WIDTH + 12 : MARKER_WIDTH,
      height: highlighted ? MARKER_HEIGHT + 12 : MARKER_HEIGHT,
      callout: {
        content: (list.find((s) => s.id === m.shopId)?.name) || '',
        color: '#37291a',
        fontSize: 12,
        borderRadius: 6,
        bgColor: '#FAF8F5',
        padding: 6,
        display: 'BY_CLICK' as const,
      },
    }
  })
}

function checkNewShopHighlight() {
  const id = store.state.lastAddedShopId
  if (!id) return
  store.clearLastAddedShopId()
  if (!shops.value.some((s) => s.id === id)) return
  highlightShopId.value = id
  buildMarkerView(visibleShops.value)
  if (highlightTimer) clearTimeout(highlightTimer)
  highlightTimer = setTimeout(() => {
    highlightShopId.value = ''
    if (shops.value.length > 0) buildMarkerView(visibleShops.value)
  }, 1600)
}

function clearShopState() {
  shops.value = []
  markers.value = []
  markerMap.clear()
  selectedShop.value = null
  showDetail.value = false
  highlightShopId.value = ''
}

async function fitShopMarkers(list: (ShopView | PublicShopView)[]) {
  if (list.length === 0) return
  await nextTick()
  const mapCtx = uni.createMapContext('shopMap')
  if (list.length === 1) {
    center.value = { latitude: list[0].latitude, longitude: list[0].longitude }
    mapScale.value = 15
    moveMapToLocation(list[0].latitude, list[0].longitude)
    return
  }
  mapCtx.includePoints({
    points: list.map((shop) => ({ latitude: shop.latitude, longitude: shop.longitude })),
    padding: [80, 40, 180, 40],
  })
}

async function loadGroups(seq: number) {
  let groups: GroupView[] = []
  try {
    groups = await listMyGroups()
  } catch {
    // 请求失败：无法确认真实清单，不误判为"没有清单"，保留旧状态
    if (seq === refreshSeq) {
      errorMsg.value = '加载失败，请重试'
      loadFailed.value = true
      loadedOnce.value = true
    }
    return false
  }
  if (seq !== refreshSeq) return false
  groupsSettled.value = true
  store.setGroups(groups)

  const recent = store.getRecentPublicGroup()
  const options: (GroupView | { id: ''; publicId: string; name: string })[] = [...groups]
  let recentAvailable = true
  if (recent && !groups.some((g) => g.publicId === recent.publicId)) {
    recentAvailable = await isRecentPublicGroupAvailable(recent)
    if (seq !== refreshSeq) return false
    if (recentAvailable) {
      options.push({ id: '', publicId: recent.publicId, name: recent.name })
    } else {
      // 最近访问的公开清单已被删除或失效：清理残留，避免在选择器里出现幽灵清单
      store.clearRecentPublicGroup()
    }
  }
  groupOptions.value = options

  const selection = resolveMapGroup(
    groups,
    store.state.currentGroupId,
    requestedPublicId.value,
    recentAvailable ? recent : null,
  )
  const publicIdChanged = publicId.value !== selection.publicId
  currentGroup.value = selection.group
  publicId.value = selection.publicId
  isMember.value = selection.isMember
  if (publicIdChanged) {
    folderFilter.value = 'all'
    folders.value = []
    uncategorizedCount.value = 0
    store.setFolders([])
  }
  if (selection.isMember && selection.group && selection.group.id !== store.state.currentGroupId) {
    store.setCurrentGroup(selection.group.id)
  }
  return true
}

async function loadShops() {
  const seq = ++shopRequestSeq
  const memberGroupId = currentGroup.value?.id || ''
  const isMemberView = isMember.value && Boolean(memberGroupId)
  const targetPublicId = publicId.value
  if (!isMemberView && !targetPublicId) {
    clearShopState()
    errorMsg.value = ''
    loadFailed.value = false
    loading.value = false
    loadedOnce.value = true
    shopsSettled.value = true
    return
  }
  loading.value = true
  errorMsg.value = ''
  loadFailed.value = false
  let loadedShops: (ShopView | PublicShopView)[] | null = null
  try {
    let list: (ShopView | PublicShopView)[]
    if (isMemberView) {
      try {
        list = await listMemberMapShops(memberGroupId)
      } catch (err) {
        // 仅当明确被移除/失去权限时才降级为公开只读，避免网络抖动被误判为访客
        const message = err instanceof Error ? err.message : ''
        const code = (err as { code?: string } | null)?.code
        const memberRemoved =
          code === 'FORBIDDEN' || message.includes('未加入') || message.includes('FORBIDDEN')
        if (!memberRemoved) throw err
        isMember.value = false
        if (currentGroup.value) {
          currentGroup.value = {
            ...currentGroup.value,
            id: '',
            role: 'member',
            isOwner: false,
          }
        }
        list = await listPublicMapShops(targetPublicId)
      }
    } else {
      list = await listPublicMapShops(targetPublicId)
    }
    if (seq !== shopRequestSeq || targetPublicId !== publicId.value) return
    shops.value = list
    buildMarkerView(visibleShops.value)
    checkNewShopHighlight()
    loadedShops = list
    loadedOnce.value = true
    shopsSettled.value = true
  } catch (err) {
    if (seq !== shopRequestSeq || targetPublicId !== publicId.value) return
    clearShopState()
    errorMsg.value = err instanceof Error ? err.message : '加载失败'
    loadFailed.value = true
    loadedOnce.value = true
    shopsSettled.value = true
  } finally {
    if (seq === shopRequestSeq) loading.value = false
  }
  if (loadedShops && seq === shopRequestSeq && targetPublicId === publicId.value) {
    await fitShopMarkers(visibleShops.value)
  }
}

async function loadFolders() {
  const seq = ++folderRequestSeq
  const targetPublicId = publicId.value
  if (!targetPublicId) {
    folders.value = []
    uncategorizedCount.value = 0
    store.setFolders([])
    return
  }
  loadingFolders.value = true
  try {
    const res = await listPublicFolders(targetPublicId)
    if (seq !== folderRequestSeq || targetPublicId !== publicId.value) return
    folders.value = res.folders
    uncategorizedCount.value = res.uncategorizedCount
    store.setFolders(folders.value)
  } catch {
    if (seq !== folderRequestSeq) return
    folders.value = []
    uncategorizedCount.value = 0
  } finally {
    if (seq === folderRequestSeq) loadingFolders.value = false
  }
}

function onFolderFilterChange(value: string) {
  if (folderFilter.value === value) return
  folderFilter.value = value
  selectedShop.value = null
  showDetail.value = false
  highlightShopId.value = ''
  buildMarkerView(visibleShops.value)
  void fitShopMarkers(visibleShops.value)
}

async function refresh() {
  const seq = ++refreshSeq
  const first = !loadedOnce.value
  if (first) showLoading()
  try {
    if (!(await loadGroups(seq)) || seq !== refreshSeq) return
    loadedOnce.value = true
    await loadFolders()
    await loadShops()
  } finally {
    if (seq === refreshSeq) hideLoading()
  }
}

async function updateCurrentLocation(showFailureModal: boolean) {
  if (locating.value) return
  locating.value = true
  const res = await getCurrentLocation()
  if (res.ok) {
    currentPosition.value = res.position
    hasPosition.value = true
    if (showFailureModal) {
      center.value = res.position
      mapScale.value = 16
      await nextTick()
      moveMapToLocation(res.position.latitude, res.position.longitude)
    }
  } else {
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
}

function formattedDistance(s: ShopView | PublicShopView): string {
  if (!currentPosition.value) return '未定位'
  return formatDistance(haversineDistance(currentPosition.value, s))
}

const nearbyList = computed(() => {
  if (!currentPosition.value) return []
  return sortByDistance(currentPosition.value, visibleShops.value)
})

const showEmptyState = computed(() => {
  return (
    loadedOnce.value &&
    groupsSettled.value &&
    shopsSettled.value &&
    !errorMsg.value &&
    visibleShops.value.length === 0 &&
    Boolean(currentGroup.value)
  )
})

function goAddShop() {
  uni.switchTab({ url: '/pages/food/food' })
}

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
  showLayerPicker.value = true
}

type GroupOption = (typeof groupOptions.value)[number]

function onPickerSelect({ publicId: pid, folderValue }: { publicId: string; folderValue?: string }) {
  if (pid !== publicId.value) {
    const opt = groupOptions.value.find((o) => o.publicId === pid)
    if (!opt) return
    refreshSeq += 1
    requestedPublicId.value = ''
    groupsSettled.value = true
    publicId.value = pid
    selectedShop.value = null
    showDetail.value = false
    highlightShopId.value = ''
    if (opt.id) {
      currentGroup.value = opt as GroupView
      isMember.value = true
      store.setCurrentGroup(opt.id)
    } else {
      currentGroup.value = {
        id: '',
        publicId: pid,
        name: opt.name,
        role: 'member',
        updatedAt: new Date(0),
        isOwner: false,
      }
      isMember.value = false
      store.setRecentPublicGroup({ publicId: pid, name: opt.name })
    }
    loadedOnce.value = true
    folderFilter.value = 'all'
    void loadFolders()
    void loadShops()
  }
  if (folderValue !== undefined) {
    onFolderFilterChange(folderValue)
  }
}

onLoad((query) => {
  if (query?.publicId) {
    try {
      requestedPublicId.value = decodeURIComponent(query.publicId as string)
    } catch {
      requestedPublicId.value = query.publicId as string
    }
    publicId.value = requestedPublicId.value
  }
})

onShow(() => {
  refresh()
  refreshAuthorizedLocation()
})

onUnload(() => {
  if (highlightTimer) clearTimeout(highlightTimer)
})
</script>

<template>
  <view class="map-page">
    <global-loading />
    <view v-if="errorMsg && loadFailed" class="center-loading">
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
        <text v-if="currentGroup" class="chip-tag">{{ currentFilterLabel }}</text>
        <text class="chip-arrow">▾</text>
      </view>
      <view class="legend">
        <view v-for="c in SHOP_CATEGORIES" :key="c" class="legend-item">
          <text v-if="LEGEND_EMOJIS[c]" class="legend-icon-emoji">{{ LEGEND_EMOJIS[c] }}</text>
          <image v-else :src="MARKER_ICONS[c]" class="legend-icon" mode="aspectFit" />
          <text class="legend-label">{{ CATEGORY_LABELS[c] }}</text>
        </view>
      </view>
    </view>

    <group-city-picker
      v-model="showLayerPicker"
      :options="groupOptions"
      :current-public-id="publicId"
      :current-folder-filter="folderFilter"
      mode="columns"
      @select="onPickerSelect"
    />

    <view v-if="!currentGroup && groupsSettled" class="no-group-tip" @click="goManage">
      <text class="tip-text">您还没有添加要共享的清单</text>
      <text class="tip-action">去添加 ›</text>
    </view>

    <view v-if="showEmptyState" class="empty-tip">
      <text class="empty-text">清单里还没有内容</text>
      <text v-if="isMember" class="empty-action" @click="goAddShop">去添加 ›</text>
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
        <image class="fab-icon fab-icon-location" src="/static/tabbar/位置.png" mode="aspectFit" />
      </view>
      <view class="fab" @click="openNearby">
        <image class="fab-icon" src="/static/tabbar/离我最近.png" mode="aspectFit" />
      </view>
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
        <view v-else-if="nearbyList.length === 0" class="sheet-empty">还没有内容</view>
        <scroll-view v-else scroll-y class="nearby-list" :show-scrollbar="false">
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
  background-color: #FAF8F5;
  color: #6B6F73;
}

.retry-btn {
  background-color: #36393B;
  color: #FFFFFF;
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
  flex-direction: row;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12rpx;
  pointer-events: none;
}

.no-group-tip {
  position: absolute;
  left: 16rpx;
  right: 16rpx;
  bottom: calc(24rpx + env(safe-area-inset-bottom));
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: rgba(255, 255, 255, 0.95);
  border: 1rpx solid #36393B;
  border-radius: 999rpx;
  padding: 16rpx 32rpx;
  box-shadow: 0 4rpx 16rpx rgba(54, 57, 59, 0.10);
}

.tip-text {
  font-size: 26rpx;
  color: #6B6F73;
}

.tip-action {
  font-size: 26rpx;
  font-weight: 600;
  color: #36393B;
}

.empty-tip {
  position: absolute;
  left: 16rpx;
  right: 16rpx;
  bottom: calc(24rpx + env(safe-area-inset-bottom));
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: rgba(255, 255, 255, 0.95);
  border: 1rpx solid #36393B;
  border-radius: 999rpx;
  padding: 16rpx 32rpx;
  box-shadow: 0 4rpx 16rpx rgba(54, 57, 59, 0.10);
}

.empty-text {
  font-size: 26rpx;
  font-weight: 400;
  color: #6B6F73;
}

.empty-action {
  font-size: 26rpx;
  font-weight: 600;
  color: #36393B;
}

.group-chip {
  align-self: flex-start;
  flex: none;
  max-width: 44%;
  display: flex;
  align-items: center;
  gap: 12rpx;
  background-color: #FAF8F5;
  border: 1rpx solid #E5E5E5;
  border-radius: 999rpx;
  padding: 10rpx 20rpx;
  box-shadow: 0 4rpx 16rpx rgba(54, 57, 59, 0.10);
  pointer-events: auto;
}

.chip-name {
  font-size: 28rpx;
  font-weight: 700;
  color: #37291a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chip-tag {
  font-size: 20rpx;
  color: #36393B;
  background-color: #F5F5F5;
  border-radius: 8rpx;
  padding: 2rpx 10rpx;
}

.chip-arrow {
  font-size: 24rpx;
  color: #6B6F73;
}

.legend {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8rpx 16rpx;
  max-width: 56%;
  background-color: rgba(255, 255, 255, 0.95);
  border: 1rpx solid #E5E5E5;
  border-radius: 999rpx;
  padding: 8rpx 16rpx;
  box-shadow: 0 4rpx 16rpx rgba(54, 57, 59, 0.10);
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

.legend-icon-emoji {
  font-size: 28rpx;
  line-height: 1;
}

.legend-label {
  font-size: 22rpx;
  color: #37291a;
}

.fab-group {
  position: absolute;
  right: 20rpx;
  bottom: calc(300rpx + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.zoom-group {
  position: absolute;
  right: 20rpx;
  bottom: calc(600rpx + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  align-items: center;
  background-color: rgba(255, 255, 255, 0.95);
  border: 1rpx solid #E5E5E5;
  border-radius: 16rpx;
  box-shadow: 0 4rpx 16rpx rgba(54, 57, 59, 0.10);
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
  background-color: #E5E5E5;
}

.fab {
  width: 72rpx;
  height: 72rpx;
  border-radius: 16rpx;
  background-color: #FFFFFF;
  border: 1rpx solid #E5E5E5;
  box-shadow: 0 4rpx 16rpx rgba(54, 57, 59, 0.10);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.fab-icon {
  width: 48rpx;
  height: 48rpx;
}

.fab-icon-location {
  width: 36rpx;
  height: 36rpx;
}

.detail-sheet {
  position: absolute;
  left: 16rpx;
  right: 16rpx;
  bottom: calc(24rpx + env(safe-area-inset-bottom));
  background-color: #FAF8F5;
  border-radius: 20rpx;
  padding: 24rpx;
  box-shadow: 0 8rpx 32rpx rgba(54, 57, 59, 0.18);
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
  color: #36393B;
  background-color: #F5F5F5;
  border-radius: 8rpx;
  padding: 4rpx 12rpx;
}

.close {
  font-size: 28rpx;
  color: #6B6F73;
  padding: 4rpx 8rpx;
}

.detail-address {
  font-size: 26rpx;
  color: #37291a;
  font-weight: 500;
}

.detail-remark {
  font-size: 24rpx;
  color: #6B6F73;
  background-color: #F5F5F5;
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
  color: #36393B;
}

.nav-btn {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  background-color: #36393B;
  color: #FFFFFF;
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
  background-color: rgba(55, 41, 26, 0.35);
  z-index: 10;
}

.nearby-sheet {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 60vh;
  background-color: #FAF8F5;
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
  color: #6B6F73;
}

.nearby-list {
  flex: 1;
  min-height: 0;
  height: 0;
}

.nearby-item {
  display: flex;
  gap: 20rpx;
  align-items: center;
  padding: 20rpx 0;
  border-bottom: 1rpx solid #E5E5E5;
}

.rank {
  width: 40rpx;
  height: 40rpx;
  border-radius: 50%;
  background-color: #36393B;
  color: #FFFFFF;
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
  color: #6B6F73;
}
</style>
