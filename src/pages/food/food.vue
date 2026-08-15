<script setup lang="ts">
import { computed, ref } from 'vue'
import { onShow, onReachBottom } from '@dcloudio/uni-app'
import type { PublicShopView, ShopCategory, ShopView } from '@/types/shop'
import type { GroupView } from '@/types/group'
import {
  listPublicShops,
  listMemberShops,
  createShop,
  updateShop,
  deleteShop,
} from '@/services/shop'
import { listMyGroups } from '@/services/group'
import { useGroupStore } from '@/stores/group'
import { resolveMapGroup } from '@/utils/map-group'
import { CATEGORY_LABELS, PAGE_SIZE } from '@/constants/shop'
import { validateShopForm, normalizeText } from '@/utils/shop-validation'

const store = useGroupStore()

type CategoryFilter = 'all' | ShopCategory
const category = ref<CategoryFilter>('all')
const tabs = [
  { value: 'all' as CategoryFilter, label: '全部' },
  { value: 'restaurant' as CategoryFilter, label: '饭店' },
  { value: 'cake' as CategoryFilter, label: '蛋糕店' },
  { value: 'milktea' as CategoryFilter, label: '奶茶店' },
]

const isMember = ref(false)
const currentGroup = ref<GroupView | null>(null)
const publicId = ref('')
const groupId = ref('')

const shops = ref<(ShopView | PublicShopView)[]>([])
const hasMore = ref(false)
const cursor = ref('')
const loading = ref(false)
const loadingMore = ref(false)
const errorMsg = ref('')
const firstLoaded = ref(false)

const requestSeq = ref(0)
const lastContext = ref('')

const showForm = ref(false)
const formMode = ref<'create' | 'edit'>('create')
const editingId = ref('')
const form = ref({
  name: '',
  category: 'restaurant' as ShopCategory,
  latitude: null as number | null,
  longitude: null as number | null,
  address: '',
  remark: '',
})
const formError = ref('')
const saving = ref(false)

const deletingId = ref('')

function isShopView(s: ShopView | PublicShopView): s is ShopView {
  return 'creatorName' in s
}

async function loadGroups() {
  const groups = await listMyGroups()
  store.setGroups(groups)
  const selection = resolveMapGroup(
    groups,
    store.state.currentGroupId,
    '',
    store.getRecentPublicGroup(),
  )
  currentGroup.value = selection.group
  groupId.value = selection.isMember ? selection.group?.id || '' : ''
  publicId.value = selection.publicId
  isMember.value = selection.isMember
}

async function loadPage(reset: boolean) {
  if (!reset && loading.value) return
  loading.value = true
  errorMsg.value = ''
  const seq = ++requestSeq.value
  const context = `${isMember.value ? 'member' : 'guest'}:${groupId.value || publicId.value}:${category.value}`
  if (reset) {
    if (context !== lastContext.value) {
      lastContext.value = context
      shops.value = []
      firstLoaded.value = false
    }
  }
  try {
    let nextCursor: string | undefined = undefined
    let list: (ShopView | PublicShopView)[] = []
    let more = false
    if (isMember.value && groupId.value) {
      const res = await listMemberShops(groupId.value, reset ? undefined : cursor.value, category.value)
      list = res.shops
      more = res.hasMore
      nextCursor = res.nextCursor
    } else if (publicId.value) {
      const res = await listPublicShops(publicId.value, reset ? undefined : cursor.value, category.value)
      list = res.shops
      more = res.hasMore
      nextCursor = res.nextCursor
    } else {
      throw new Error('尚未选择共享清单')
    }
    if (seq !== requestSeq.value) return
    if (reset) {
      shops.value = list
    } else {
      shops.value = [...shops.value, ...list]
    }
    hasMore.value = more
    cursor.value = nextCursor || ''
    firstLoaded.value = true
  } catch (err) {
    if (seq !== requestSeq.value) return
    const message = err instanceof Error ? err.message : '加载失败'
    // 成员身份失效（被移除）：降级为公开只读
    if (message.includes('未加入') || message.includes('FORBIDDEN')) {
      isMember.value = false
      groupId.value = ''
      if (currentGroup.value) {
        currentGroup.value = {
          ...currentGroup.value,
          id: '',
          role: 'member',
          isOwner: false,
        }
      }
      // 清理成员缓存，保留公开浏览
      store.reset()
      errorMsg.value = ''
      if (publicId.value) {
        try {
          const res = await listPublicShops(publicId.value, undefined, category.value)
          if (seq !== requestSeq.value) return
          shops.value = res.shops
          hasMore.value = res.hasMore
          cursor.value = res.nextCursor || ''
          firstLoaded.value = true
        } catch (publicErr) {
          if (seq !== requestSeq.value) return
          const publicMessage = publicErr instanceof Error ? publicErr.message : '加载失败'
          errorMsg.value = publicMessage
          shops.value = []
          firstLoaded.value = true
          if (publicMessage.includes('不存在') || publicMessage.includes('不可访问')) {
            store.clearRecentPublicGroup()
            currentGroup.value = null
            publicId.value = ''
          }
        }
        return
      }
    }
    errorMsg.value = message
    if (reset) shops.value = []
    firstLoaded.value = true
  } finally {
    if (seq === requestSeq.value) loading.value = false
    loadingMore.value = false
  }
}

function resetAndLoad() {
  cursor.value = ''
  hasMore.value = false
  return loadPage(true)
}

function onCategoryChange(value: CategoryFilter) {
  if (category.value === value) return
  category.value = value
  resetAndLoad()
}

function goManage() {
  uni.switchTab({ url: '/pages/manage/manage' })
}

async function refresh() {
  try {
    await loadGroups()
    await resetAndLoad()
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : '加载失败'
    firstLoaded.value = true
  }
}

function openCreate() {
  formMode.value = 'create'
  editingId.value = ''
  form.value = { name: '', category: 'restaurant', latitude: null, longitude: null, address: '', remark: '' }
  formError.value = ''
  showForm.value = true
}

function openEdit(s: ShopView) {
  formMode.value = 'edit'
  editingId.value = s.id
  form.value = {
    name: s.name,
    category: s.category,
    latitude: s.latitude,
    longitude: s.longitude,
    address: s.address,
    remark: s.remark || '',
  }
  formError.value = ''
  showForm.value = true
}

function chooseLocation() {
  uni.chooseLocation({
    success: (res) => {
      form.value.latitude = res.latitude
      form.value.longitude = res.longitude
      form.value.address = res.address || res.name || ''
    },
    fail: () => {
      // 取消选择不清空已有值
    },
  })
}

async function saveForm() {
  const err = validateShopForm({
    name: form.value.name,
    category: form.value.category,
    latitude: form.value.latitude,
    longitude: form.value.longitude,
    address: form.value.address,
    remark: form.value.remark,
  })
  if (err) {
    formError.value = err.message
    return
  }
  saving.value = true
  formError.value = ''
  try {
    const name = normalizeText(form.value.name, 40)
    const address = normalizeText(form.value.address, 120)
    const remark = normalizeText(form.value.remark, 200)
    const lat = form.value.latitude as number
    const lng = form.value.longitude as number
    if (formMode.value === 'create') {
      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
      await createShop(groupId.value, {
        name,
        category: form.value.category,
        latitude: lat,
        longitude: lng,
        address,
        remark,
        requestId,
      })
      uni.showToast({ title: '已添加', icon: 'success' })
    } else {
      const target = shops.value.find((s) => s.id === editingId.value) as ShopView | undefined
      if (!target) throw new Error('店铺已不存在')
      await updateShop(groupId.value, editingId.value, {
        name,
        category: form.value.category,
        latitude: lat,
        longitude: lng,
        address,
        remark,
        expectedUpdatedAt: new Date(target.updatedAt).getTime(),
      })
      uni.showToast({ title: '已保存', icon: 'success' })
    }
    showForm.value = false
    resetAndLoad()
  } catch (err) {
    formError.value = err instanceof Error ? err.message : '保存失败'
  } finally {
    saving.value = false
  }
}

function confirmDelete(s: ShopView) {
  uni.showModal({
    title: '删除店铺',
    content: `确认删除「${s.name}」？`,
    confirmText: '删除',
    confirmColor: '#36393B',
    success: async (res) => {
      if (!res.confirm) return
      deletingId.value = s.id
      try {
        await deleteShop(groupId.value, s.id)
        shops.value = shops.value.filter((x) => x.id !== s.id)
        uni.showToast({ title: '已删除', icon: 'none' })
      } catch (err) {
        uni.showToast({ title: err instanceof Error ? err.message : '删除失败', icon: 'none' })
      } finally {
        deletingId.value = ''
      }
    },
  })
}

function onLoadMore() {
  if (loading.value || loadingMore.value || !hasMore.value) return
  loadingMore.value = true
  loadPage(false)
}

const loadStatusText = computed(() => {
  if (loading.value && shops.value.length === 0) return '加载中…'
  if (errorMsg.value && shops.value.length === 0) return errorMsg.value
  if (shops.value.length === 0 && firstLoaded.value) return '还没有添加店铺'
  return ''
})

onShow(() => {
  refresh()
})

onReachBottom(() => {
  onLoadMore()
})
</script>

<template>
  <view class="food-page">
    <view class="sticky-header">
      <view v-if="currentGroup" class="group-bar">
        <text class="group-name">{{ currentGroup.name }}</text>
        <text class="group-tag">{{ isMember ? (currentGroup.isOwner ? '创建者' : '成员') : '访客' }}</text>
      </view>

      <scroll-view class="category-tabs" scroll-x :show-scrollbar="false">
        <view class="category-tabs-inner">
          <view
            v-for="tab in tabs"
            :key="tab.value"
            class="category-tab"
            :class="{ active: category === tab.value }"
            @click="onCategoryChange(tab.value)"
          >
            <text>{{ tab.label }}</text>
          </view>
        </view>
      </scroll-view>
    </view>

    <view v-if="loadStatusText && shops.length === 0" class="state-box">
      <text>{{ loadStatusText }}</text>
      <button
        v-if="errorMsg === '尚未选择共享清单'"
        class="btn-primary"
        @click="goManage"
      >
        去添加
      </button>
      <button v-else-if="errorMsg" class="btn-plain" @click="resetAndLoad">重试</button>
      <button v-else-if="isMember" class="btn-primary" @click="openCreate">去添加</button>
    </view>

    <view v-else class="shop-list">
      <view v-for="s in shops" :key="s.id" class="shop-card">
        <view class="shop-info" @click="showForm && (showForm = false)">
          <view class="shop-head">
            <text class="shop-name">{{ s.name }}</text>
            <text class="cat-tag">{{ CATEGORY_LABELS[s.category] }}</text>
          </view>
          <text class="shop-address">{{ s.address }}</text>
          <text v-if="s.remark" class="shop-remark">{{ s.remark }}</text>
        </view>
        <view v-if="isShopView(s) && (s.canEdit || s.canDelete)" class="shop-actions">
          <button v-if="s.canEdit" class="act-btn edit" @click="openEdit(s)">编辑</button>
          <button v-if="s.canDelete" class="act-btn del" :disabled="deletingId === s.id" @click="confirmDelete(s)">
            删除
          </button>
        </view>
      </view>

      <view class="load-more">
        <text v-if="loadingMore" class="muted">加载中…</text>
        <text v-else-if="hasMore" class="muted">上拉加载更多</text>
        <text v-else-if="shops.length > 0" class="muted">没有更多了</text>
      </view>
    </view>

    <button v-if="isMember" class="fab" @click="openCreate">＋</button>

    <wd-popup v-model="showForm" position="bottom" custom-style="padding: 40rpx 32rpx 24rpx; border-top-left-radius: 32rpx; border-top-right-radius: 32rpx;">
      <view class="form-body">
        <text class="form-title">{{ formMode === 'create' ? '新增店铺' : '编辑店铺' }}</text>
        <text class="form-hint">店铺名称、地址和备注会对拿到清单链接的访客公开</text>

        <input v-model="form.name" class="input" placeholder="店铺名称（1-40 字）" maxlength="40" />
        <wd-radio-group v-model="form.category">
          <wd-radio value="restaurant">饭店</wd-radio>
          <wd-radio value="cake">蛋糕店</wd-radio>
          <wd-radio value="milktea">奶茶店</wd-radio>
        </wd-radio-group>

        <view class="picker-row">
          <view class="picker-value" :class="{ empty: !form.address }" @click="chooseLocation">
            {{ form.address || '在地图上选点' }}
          </view>
          <button class="btn-plain picker-btn" @click="chooseLocation">选点</button>
        </view>

        <textarea
          v-model="form.remark"
          class="textarea"
          placeholder="备注（选填，200 字内）"
          maxlength="200"
        />

        <text v-if="formError" class="error">{{ formError }}</text>

        <view class="form-actions">
          <button class="btn-plain" @click="showForm = false">取消</button>
          <button class="btn-primary" :loading="saving" :disabled="saving" @click="saveForm">
            保存
          </button>
        </view>
      </view>
    </wd-popup>
  </view>
</template>

<style lang="scss" scoped>
.food-page {
  min-height: 100vh;
  padding: 20rpx 24rpx calc(140rpx + env(safe-area-inset-bottom));
}

.sticky-header {
  position: sticky;
  top: 0;
  z-index: 100;
  background-color: $page-bg;
  margin: -20rpx -24rpx 0;
  padding: 20rpx 24rpx 0;
}

.group-bar {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 16rpx;
}

.group-name {
  font-size: 30rpx;
  font-weight: 700;
  color: #37291a;
}

.group-tag {
  font-size: 22rpx;
  color: #36393B;
  background-color: #F5F5F5;
  border-radius: 8rpx;
  padding: 4rpx 12rpx;
}

.category-tabs {
  width: 100%;
  white-space: nowrap;
  border-bottom: 1rpx solid #E5E5E5;
}

.category-tabs-inner {
  display: flex;
  align-items: center;
}

.category-tab {
  position: relative;
  flex: 1 0 auto;
  min-width: 120rpx;
  padding: 22rpx 28rpx;
  text-align: center;
  color: #6B6F73;
  font-size: 28rpx;

  &.active {
    color: #37291a;
    font-weight: 700;

    &::after {
      position: absolute;
      left: 50%;
      bottom: 0;
      width: 40rpx;
      height: 6rpx;
      border-radius: 999rpx;
      background-color: #F6A623;
      content: '';
      transform: translateX(-50%);
    }
  }
}

.state-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20rpx;
  padding: 48rpx 32rpx;
  color: #6B6F73;

  button {
    height: 56rpx;
    line-height: 56rpx;
    font-size: 24rpx;
    min-height: 56rpx;
    padding: 0 28rpx;
  }
}

.shop-list {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
  margin-top: 24rpx;
}

.shop-card {
  background-color: #FEF9FF;
  border: 1rpx solid #E5E5E5;
  border-radius: 24rpx;
  padding: 32rpx 28rpx;
}

.shop-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.shop-name {
  font-size: 36rpx;
  font-weight: 700;
  color: #37291a;
  letter-spacing: 0.5rpx;
}

.cat-tag {
  font-size: 22rpx;
  color: #36393B;
  background-color: #F5F5F5;
  border-radius: 8rpx;
  padding: 4rpx 12rpx;
}

.shop-address {
  display: block;
  margin-top: 16rpx;
  font-size: 28rpx;
  color: #6B6F73;
  line-height: 1.5;
}

.shop-remark {
  display: block;
  margin-top: 10rpx;
  font-size: 28rpx;
  color: #37291a;
  line-height: 1.5;
}

.shop-actions {
  display: block;
  margin-top: 20rpx;
  text-align: right;
  font-size: 0;

  button {
    display: inline-block;
    vertical-align: middle;
    width: auto;
    min-width: 0;
    margin-left: 16rpx;

    &:first-child {
      margin-left: 0;
    }

    &::after {
      display: none;
    }
  }
}

.act-btn {
  border: none;
  border-radius: 16rpx;
  font-size: 26rpx;
  height: 56rpx;
  line-height: 56rpx;
  min-height: 56rpx;
  padding: 0 24rpx;
  width: auto;
  display: inline-block;
  vertical-align: middle;
  background-origin: content-box;

  &::after {
    border: none;
  }

  &.edit {
    background-color: #36393B;
    color: #FFFFFF;
  }

  &.del {
    background-color: transparent;
    color: #36393B;
    border: 1rpx solid #36393B;
  }
}

.load-more {
  text-align: center;
  padding: 24rpx 0;
}

.muted {
  font-size: 24rpx;
  color: #6B6F73;
}

.btn-primary,
.btn-plain {
  border: none;
  border-radius: 16rpx;
  font-size: 28rpx;
  padding: 0;
  margin: 0;

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

.fab {
  position: fixed;
  right: 40rpx;
  bottom: calc(140rpx + env(safe-area-inset-bottom));
  width: 96rpx;
  height: 96rpx;
  border-radius: 50%;
  background-color: #36393B;
  color: #FFFFFF;
  font-size: 48rpx;
  line-height: 96rpx;
  text-align: center;
  padding: 0;
  box-shadow: 0 8rpx 24rpx rgba(54, 57, 59, 0.30);
  border: none;

  &::after {
    border: none;
  }
}

.form-body {
  display: flex;
  flex-direction: column;
  gap: 32rpx;
  padding-top: 16rpx;
  padding-bottom: calc(16rpx + env(safe-area-inset-bottom));
}

.form-title {
  font-size: 34rpx;
  font-weight: 700;
  color: #37291a;
}

.form-hint {
  font-size: 22rpx;
  color: #6B6F73;
  line-height: 1.4;
  margin-top: -16rpx;
}

.input {
  width: 100%;
  box-sizing: border-box;
  border-radius: 16rpx;
  background-color: #FFFFFF;
  border: 1rpx solid #36393B;
  font-size: 28rpx;
  padding: 0 20rpx;
  height: 96rpx;
  line-height: 96rpx;
  display: block;
}

.textarea {
  width: 100%;
  box-sizing: border-box;
  border-radius: 16rpx;
  background-color: #FFFFFF;
  border: 1rpx solid #36393B;
  font-size: 28rpx;
  padding: 20rpx;
  height: 200rpx;
  line-height: 1.5;
  display: block;
}

.picker-row {
  display: flex;
  gap: 16rpx;
  align-items: center;
}

:deep(.wd-radio-group) {
  margin: 8rpx 0;
}

.picker-value {
  flex: 1;
  box-sizing: border-box;
  height: 96rpx;
  line-height: 94rpx;
  padding: 0 20rpx;
  border-radius: 16rpx;
  background-color: #FFFFFF;
  border: 1rpx solid #36393B;
  font-size: 26rpx;
  color: #37291a;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;

  &.empty {
    color: #6B6F73;
  }
}

.picker-btn {
  flex: none;
  height: 96rpx;
  line-height: 96rpx;
  padding: 0 36rpx;
  margin: 0;
  font-size: 26rpx;
}

.error {
  color: #36393B;
  font-size: 24rpx;
}

.form-actions {
  display: flex;
  gap: 24rpx;
  margin-top: 16rpx;
  padding: 0;

  button {
    flex: 1;
    height: 80rpx;
    line-height: 80rpx;
    font-size: 30rpx;
    padding: 0 24rpx;
    min-height: 80rpx;
    border-radius: 14rpx;
  }
}
</style>
