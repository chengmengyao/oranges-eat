<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { onShow, onReachBottom } from '@dcloudio/uni-app'
import type { FolderView, GroupView } from '@/types/group'
import type { PublicShopView, ShopCategory, ShopView } from '@/types/shop'
import {
  listPublicShops,
  listMemberShops,
  createShop,
  updateShop,
  deleteShop,
} from '@/services/shop'
import { listMyGroups, listFolders, listPublicFolders, createFolder } from '@/services/group'
import { useGroupStore } from '@/stores/group'
import { resolveMapGroup, isRecentPublicGroupAvailable } from '@/utils/map-group'
import { CATEGORY_LABELS, PAGE_SIZE } from '@/constants/shop'
import { validateShopForm, normalizeText } from '@/utils/shop-validation'
import { hideLoading, showLoading } from '@/utils/global-loading'

const store = useGroupStore()

type CategoryFilter = 'all' | ShopCategory
const category = ref<CategoryFilter>('all')
const tabs = [
  { value: 'all' as CategoryFilter, label: '全部' },
  { value: 'restaurant' as CategoryFilter, label: '饭店' },
  { value: 'cake' as CategoryFilter, label: '甜品' },
  { value: 'milktea' as CategoryFilter, label: '饮品' },
  { value: 'spot' as CategoryFilter, label: '景点' },
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
  folderId: null as string | null,
})
const formError = ref('')
const saving = ref(false)
const createRequestId = ref('')
const targetGroupId = ref('')
const showGroupPicker = ref(false)
const showMoveTargetPicker = ref(false)
const groupsLoading = ref(false)

const folders = ref<FolderView[]>([])
const uncategorizedCount = ref(0)
const showFolderPicker = ref(false)
const newFolderName = ref('')
const creatingFolder = ref(false)
const folderFilter = ref('all')
const cityTabLoading = ref(false)

const anyOverlayOpen = computed(
  () =>
    showForm.value ||
    showFolderPicker.value ||
    showGroupPicker.value ||
    showMoveTargetPicker.value,
)

watch(anyOverlayOpen, (open) => {
  if (open) {
    uni.hideTabBar({ animation: false })
  } else {
    uni.showTabBar({ animation: false })
  }
})

const deletingId = ref('')

function isShopView(s: ShopView | PublicShopView): s is ShopView {
  return 'creatorName' in s
}

const groupsLoadSeq = ref(0)

async function loadGroups() {
  const seq = ++groupsLoadSeq.value
  const groups = await listMyGroups()
  if (seq !== groupsLoadSeq.value) return
  store.setGroups(groups)
  const recent = store.getRecentPublicGroup()
  let recentAvailable = true
  if (recent && !groups.some((g) => g.publicId === recent.publicId)) {
    recentAvailable = await isRecentPublicGroupAvailable(recent)
    if (seq !== groupsLoadSeq.value) return
    if (!recentAvailable) {
      // 最近访问的公开清单已被删除或失效：清理残留，避免在选择器里出现幽灵清单
      store.clearRecentPublicGroup()
    }
  }
  if (seq !== groupsLoadSeq.value) return
  const selection = resolveMapGroup(
    groups,
    store.state.currentGroupId,
    '',
    recentAvailable ? recent : null,
  )
  currentGroup.value = selection.group
  groupId.value = selection.isMember ? selection.group?.id || '' : ''
  publicId.value = selection.publicId
  isMember.value = selection.isMember
  await loadFolders()
}

async function loadFolders() {
  cityTabLoading.value = true
  try {
    let res
    if (isMember.value && groupId.value) {
      res = await listFolders(groupId.value)
    } else if (publicId.value) {
      res = await listPublicFolders(publicId.value)
    } else {
      res = { folders: [], uncategorizedCount: 0 }
    }
    folders.value = res.folders
    uncategorizedCount.value = res.uncategorizedCount
    store.setFolders(folders.value)
  } catch {
    folders.value = []
    uncategorizedCount.value = 0
  } finally {
    cityTabLoading.value = false
  }
}

const groupPickerOptions = computed(() => {
  const options: (GroupView | { id: ''; publicId: string; name: string })[] = [
    ...store.state.groups,
  ]
  const recent = store.getRecentPublicGroup()
  if (recent && !options.some((g) => g.publicId === recent.publicId)) {
    options.push({ id: '', publicId: recent.publicId, name: recent.name })
  }
  return options
})

const currentFilterLabel = computed(() => {
  if (folderFilter.value === 'all') return '全部'
  if (folderFilter.value === 'none') return '未分类'
  const f = folders.value.find((x) => x.id === folderFilter.value)
  return f ? f.name : '全部'
})

async function loadPage(reset: boolean) {
  if (!reset && loading.value) return
  loading.value = true
  errorMsg.value = ''
  const seq = ++requestSeq.value
  const context = `${isMember.value ? 'member' : 'guest'}:${groupId.value || publicId.value}:${category.value}:${folderFilter.value}`
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
      const res = await listMemberShops(groupId.value, reset ? undefined : cursor.value, category.value, folderFilter.value)
      list = res.shops
      more = res.hasMore
      nextCursor = res.nextCursor
    } else if (publicId.value) {
      const res = await listPublicShops(publicId.value, reset ? undefined : cursor.value, category.value, folderFilter.value)
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
    const code = (err as { code?: string } | null)?.code
    // 成员身份失效（被移除）：降级为公开只读
    if (code === 'FORBIDDEN' || message.includes('未加入') || message.includes('FORBIDDEN')) {
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
          const res = await listPublicShops(publicId.value, undefined, category.value, folderFilter.value)
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
          const publicCode = (publicErr as { code?: string } | null)?.code
          if (publicCode === 'GROUP_NOT_FOUND' || publicMessage.includes('不存在') || publicMessage.includes('不可访问')) {
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

function onFolderFilterChange(value: string) {
  if (folderFilter.value === value) return
  folderFilter.value = value
  resetAndLoad()
}

function goManage() {
  uni.switchTab({ url: '/pages/manage/manage' })
}

async function refresh() {
  const first = !firstLoaded.value
  if (first) showLoading()
  try {
    await loadGroups()
    await resetAndLoad()
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : '加载失败'
    firstLoaded.value = true
  } finally {
    if (first) hideLoading()
  }
}

function openCreate() {
  formMode.value = 'create'
  editingId.value = ''
  createRequestId.value = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  targetGroupId.value = groupId.value
  const defaultFolderId =
    folderFilter.value !== 'all' && folderFilter.value !== 'none' ? folderFilter.value : null
  selectedFolderName.value = defaultFolderId ? store.folderName(defaultFolderId) : ''
  form.value = {
    name: '',
    category: 'restaurant',
    latitude: null,
    longitude: null,
    address: '',
    remark: '',
    folderId: defaultFolderId,
  }
  formError.value = ''
  showForm.value = true
}

function openEdit(s: ShopView) {
  formMode.value = 'edit'
  editingId.value = s.id
  targetGroupId.value = groupId.value
  selectedFolderName.value = s.folderId ? store.folderName(s.folderId) || '' : '未分类'
  form.value = {
    name: s.name,
    category: s.category,
    latitude: s.latitude,
    longitude: s.longitude,
    address: s.address,
    remark: s.remark || '',
    folderId: s.folderId || null,
  }
  formError.value = ''
  showForm.value = true
}

function openFolderPicker() {
  if (creatingFolder.value) return
  newFolderName.value = ''
  showFolderPicker.value = true
}

function selectFolder(value: string | null) {
  form.value.folderId = value
  showFolderPicker.value = false
}

async function createNewFolder() {
  const name = newFolderName.value.trim()
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
    if (!isMember.value || !groupId.value) {
      uni.showToast({ title: '加入清单后才能创建城市', icon: 'none' })
      return
    }
    const folder = await createFolder(groupId.value, name)
    folders.value = [...folders.value, folder]
    store.setFolders(folders.value)
    form.value.folderId = folder.id
    showFolderPicker.value = false
    if (folderFilter.value === 'all' && folders.value.length > 0) {
      // 新建城市后保持在全部视图，便于查看新城市店铺
    }
    uni.showToast({ title: '已创建', icon: 'success' })
  } catch (err) {
    uni.showToast({ title: err instanceof Error ? err.message : '创建失败', icon: 'none' })
  } finally {
    creatingFolder.value = false
  }
}

const targetGroupName = computed(() => {
  if (!targetGroupId.value) return ''
  const g = store.state.groups.find((x) => x.id === targetGroupId.value)
  if (g) return g.name
  if (currentGroup.value && currentGroup.value.id === targetGroupId.value) return currentGroup.value.name
  return ''
})

const selectedFolderName = ref('')

const targetPublicId = computed(() => {
  if (targetGroupId.value) {
    const g = store.state.groups.find((x) => x.id === targetGroupId.value)
    if (g) return g.publicId
  }
  return publicId.value
})

const moveTargetOptions = computed(() => store.state.groups)

async function openGroupPicker() {
  if (groupsLoading.value) return
  groupsLoading.value = true
  try {
    const groups = await listMyGroups()
    store.setGroups(groups)
  } catch {
    // 拉取失败时沿用已有清单列表
  } finally {
    groupsLoading.value = false
    showGroupPicker.value = true
  }
}

function openMoveTargetPicker() {
  showMoveTargetPicker.value = true
}

function onGroupBarTap() {
  if (store.state.groups.length > 0) {
    openGroupPicker()
  }
}

async function onPickerSelect({
  publicId: pid,
  folderValue,
}: {
  publicId: string
  folderValue?: string
}) {
  let switched = false
  if (pid !== publicId.value) {
    const prevGroupId = store.state.currentGroupId
    const prevRecent = store.getRecentPublicGroup()
    const g = store.state.groups.find((x) => x.publicId === pid)
    if (g) {
      store.setCurrentGroup(g.id)
    } else {
      const opt = groupPickerOptions.value.find((o) => o.publicId === pid)
      if (opt) store.setRecentPublicGroup({ publicId: pid, name: opt.name })
    }
    folderFilter.value = 'all'
    try {
      await loadGroups()
    } catch {
      // 拉取失败：回滚存储指向，避免页面与当前清单不一致导致写入错清单
      store.setCurrentGroup(prevGroupId)
      if (prevRecent) store.setRecentPublicGroup(prevRecent)
      else store.clearRecentPublicGroup()
      uni.showToast({ title: '切换失败，请重试', icon: 'none' })
      return
    }
    switched = true
  }
  if (folderValue !== undefined && folderValue !== folderFilter.value) {
    folderFilter.value = folderValue
    resetAndLoad()
  } else if (switched) {
    resetAndLoad()
  }
}

function onMoveTargetSelect({
  publicId: pid,
  folderValue,
  folderName,
}: {
  publicId: string
  folderValue?: string
  folderName?: string
}) {
  const g = store.state.groups.find((x) => x.publicId === pid)
  if (g) targetGroupId.value = g.id
  if (folderValue === 'none') {
    form.value.folderId = null
  } else if (folderValue && folderValue !== 'all') {
    form.value.folderId = folderValue
  }
  selectedFolderName.value = folderName || ''
}

function chooseLocation() {
  uni.chooseLocation({
    success: (res) => {
      form.value.latitude = res.latitude
      form.value.longitude = res.longitude
      form.value.address = res.address || res.name || ''
      if (!form.value.name && res.name) {
        form.value.name = res.name
      }
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
      // 保存失败后复用同一请求 ID，避免云函数已写入但响应丢失时重复创建。
      const requestId = createRequestId.value || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
      createRequestId.value = requestId
      const created = await createShop(groupId.value, {
        name,
        category: form.value.category,
        latitude: lat,
        longitude: lng,
        address,
        remark,
        folderId: form.value.folderId,
        requestId,
      })
      store.setLastAddedShopId(created.id)
      uni.showToast({ title: '已添加', icon: 'success' })
    } else {
      const target = shops.value.find((s) => s.id === editingId.value) as ShopView | undefined
      if (!target) throw new Error('店铺已不存在')
      const updated = await updateShop(groupId.value, editingId.value, {
        name,
        category: form.value.category,
        latitude: lat,
        longitude: lng,
        address,
        remark,
        folderId: form.value.folderId,
        targetGroupId: targetGroupId.value,
        expectedUpdatedAt: new Date(target.updatedAt).getTime(),
      })
      if (updated.moved === true) {
        const movedName = targetGroupName.value || '目标清单'
        uni.showToast({ title: `已移动到「${movedName}」`, icon: 'success' })
      } else if (updated.moved === undefined && targetGroupId.value !== groupId.value) {
        throw new Error('云函数版本过旧，移动失败，请先更新云函数')
      } else {
        uni.showToast({ title: '已保存', icon: 'success' })
      }
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
    title: '删除地点',
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
  if (errorMsg.value && shops.value.length === 0) return errorMsg.value
  if (shops.value.length === 0 && firstLoaded.value) return '还没有添加店铺或景点'
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
    <global-loading />
    <view class="sticky-header">
      <view v-if="currentGroup" class="group-bar" :class="{ switchable: store.state.groups.length > 0 }" @click="onGroupBarTap">
        <text class="group-name">{{ currentGroup.name }}</text>
        <text class="group-tag">{{ currentFilterLabel }}</text>
        <text v-if="store.state.groups.length > 0" class="group-arrow">▾</text>
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
      <view v-for="s in shops" :key="s.id" class="shop-card" :class="`cat-${s.category}`">
        <view class="shop-info" @click="showForm && (showForm = false)">
          <view class="shop-head">
            <text class="shop-name">{{ s.name }}</text>
            <text class="cat-tag">{{ CATEGORY_LABELS[s.category] }}</text>
          </view>
          <view class="shop-meta">
            <text class="meta-pin">📍</text>
            <text class="city-name">{{ store.folderName(s.folderId) }}</text>
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

    <wd-popup v-model="showForm" position="bottom" :z-index="1000" custom-style="padding: 40rpx 32rpx 24rpx; border-top-left-radius: 32rpx; border-top-right-radius: 32rpx;">
      <view class="form-body">
        <text class="form-title">{{ formMode === 'create' ? '新增地点' : '编辑地点' }}</text>
        <text class="form-hint">名称、地址和备注会对拿到清单链接的访客公开</text>

        <view class="picker-row">
          <view class="picker-value" :class="{ empty: !form.address }" @click="chooseLocation">
            {{ form.address || '在地图上选点' }}
          </view>
          <button class="btn-plain picker-btn" @click="chooseLocation">选点</button>
        </view>

        <view v-if="formMode === 'create'" class="picker-row">
          <view class="picker-value" :class="{ empty: !form.folderId }" @click="openFolderPicker">
            {{ form.folderId ? store.folderName(form.folderId) : '选择所属城市' }}
          </view>
          <button class="btn-plain picker-btn" @click="openFolderPicker">选择</button>
        </view>

        <view v-else class="picker-row">
          <view class="picker-value" :class="{ empty: !selectedFolderName }" @click="openMoveTargetPicker">
            {{ targetGroupName || '当前清单' }} › {{ selectedFolderName || '选择城市' }}
          </view>
          <button class="btn-plain picker-btn" @click="openMoveTargetPicker">切换</button>
        </view>

        <input v-model="form.name" class="input" placeholder="名称（1-40 字）" maxlength="40" />
        <wd-radio-group v-model="form.category" direction="horizontal">
          <wd-radio value="restaurant">饭店</wd-radio>
          <wd-radio value="cake">甜品</wd-radio>
          <wd-radio value="milktea">饮品</wd-radio>
          <wd-radio value="spot">景点</wd-radio>
        </wd-radio-group>

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

    <group-city-picker
      v-model="showGroupPicker"
      :options="groupPickerOptions"
      :current-public-id="publicId"
      :current-folder-filter="folderFilter"
      mode="columns"
      title="选择清单与城市"
      @select="onPickerSelect"
    />

    <group-city-picker
      v-model="showMoveTargetPicker"
      :options="moveTargetOptions"
      :current-public-id="targetPublicId"
      :current-folder-filter="form.folderId || 'none'"
      mode="columns"
      title="选择清单与城市"
      :hide-all-option="true"
      :show-uncategorized-always="true"
      @select="onMoveTargetSelect"
    />

    <wd-popup v-model="showFolderPicker" position="bottom" :z-index="1000" custom-style="padding: 24rpx 32rpx 24rpx; border-top-left-radius: 32rpx; border-top-right-radius: 32rpx;">
      <view class="group-picker-body">
        <view class="group-picker-head">
          <text class="group-picker-title">选择所属城市</text>
          <text class="sheet-close" @click="showFolderPicker = false">✕</text>
        </view>
        <view
          v-if="isMember"
          class="group-picker-item"
          :class="{ active: form.folderId === null }"
          @click="selectFolder(null)"
        >
          <text class="group-picker-name">未分类</text>
          <text v-if="form.folderId === null" class="group-picker-check">✓</text>
        </view>
        <view
          v-for="f in folders"
          :key="f.id"
          class="group-picker-item"
          :class="{ active: form.folderId === f.id }"
          @click="selectFolder(f.id)"
        >
          <text class="group-picker-name">{{ f.name }}</text>
          <text v-if="form.folderId === f.id" class="group-picker-check">✓</text>
        </view>
        <view v-if="isMember" class="new-folder-row">
          <input v-model="newFolderName" class="new-folder-input" placeholder="新城市名（如：成都）" maxlength="30" />
          <button class="btn-plain new-folder-btn" :loading="creatingFolder" :disabled="creatingFolder" @click="createNewFolder">
            新建
          </button>
        </view>
      </view>
    </wd-popup>
  </view>
</template>

<style lang="scss" scoped>
.food-page {
  min-height: 100vh;
  background-color: #FAF8F5;
  padding: 20rpx 24rpx calc(140rpx + env(safe-area-inset-bottom));
}

.sticky-header {
  position: sticky;
  top: 0;
  z-index: 100;
  background-color: #FAF8F5;
  margin: -20rpx -24rpx 0;
  padding: 20rpx 24rpx 12rpx;
}

.group-bar {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 12rpx;

  &.switchable {
    align-self: flex-start;
  }
}

.group-arrow {
  font-size: 22rpx;
  color: #8E8E93;
}

.group-name {
  font-size: 40rpx;
  font-weight: 700;
  color: #1C1C1E;
}

.group-tag {
  font-size: 22rpx;
  font-weight: 500;
  color: #8E8E93;
  background-color: #F2F2F7;
  border-radius: 24rpx;
  padding: 6rpx 24rpx;
}

.category-tabs {
  width: 100%;
  white-space: nowrap;
}

.category-tabs-inner {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.category-tab {
  flex: 1 0 auto;
  min-width: 132rpx;
  padding: 16rpx 36rpx;
  text-align: center;
  color: #3A3A3C;
  font-size: 28rpx;
  font-weight: 500;
  background-color: #FFFFFF;
  border-radius: 40rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.04);

  &.active {
    color: #FFFFFF;
    font-weight: 600;
    background-color: #1C1C1E;
  }
}

.state-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20rpx;
  padding: 48rpx 32rpx;
  color: #8E8E93;

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
  background-color: #FFFFFF;
  border: none;
  border-radius: 40rpx;
  padding: 36rpx 32rpx;
  box-shadow: 0 8rpx 40rpx rgba(0, 0, 0, 0.05);
  animation: shopSlideUp 0.45s ease-out forwards;
}

@keyframes shopSlideUp {
  from {
    opacity: 0;
    transform: translateY(16rpx);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.shop-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20rpx;
}

.shop-meta {
  display: flex;
  align-items: center;
  gap: 8rpx;
  margin-top: 12rpx;
}

.meta-pin {
  font-size: 24rpx;
}

.city-name {
  font-size: 26rpx;
  color: #8E8E93;
  font-weight: 500;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.shop-name {
  flex: 1;
  min-width: 0;
  font-size: 34rpx;
  font-weight: 700;
  color: #1C1C1E;
  line-height: 1.3;
  letter-spacing: 0.5rpx;
}

.cat-tag {
  flex-shrink: 0;
  font-size: 24rpx;
  padding: 8rpx 20rpx;
  border-radius: 20rpx;
  font-weight: 600;
}

.cat-restaurant .cat-tag {
  color: #34C759;
  background-color: #E8F9EE;
}

.cat-cake .cat-tag {
  color: #FF9500;
  background-color: #FFF5E6;
}

.cat-milktea .cat-tag {
  color: #007AFF;
  background-color: #E8F2FF;
}

.cat-spot .cat-tag {
  color: #AF52DE;
  background-color: #F5E8FF;
}

.shop-address {
  display: block;
  margin-top: 12rpx;
  font-size: 26rpx;
  color: #C7C7CC;
  line-height: 1.5;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  margin-bottom: 28rpx;
}

.shop-remark {
  display: block;
  margin-top: 10rpx;
  margin-bottom: 20rpx;
  font-size: 26rpx;
  color: #8E8E93;
  line-height: 1.5;
}

.shop-actions {
  display: flex;
  justify-content: flex-end;
  gap: 16rpx;
  margin-top: 4rpx;
  font-size: 0;

  button {
    display: inline-block;
    vertical-align: middle;
    width: auto;
    min-width: 0;
    margin: 0;

    &::after {
      display: none;
    }
  }
}

.act-btn {
  border: none;
  border-radius: 28rpx;
  font-size: 26rpx;
  font-weight: 600;
  height: 64rpx;
  line-height: 64rpx;
  min-height: 64rpx;
  padding: 0 32rpx;
  width: auto;
  display: inline-block;
  vertical-align: middle;
  background-origin: content-box;

  &::after {
    border: none;
  }

  &.edit {
    background-color: #FFFFFF;
    color: #3A3A3C;
    border: 2rpx solid #E5E5EA;
  }

  &.del {
    background-color: #FF3B30;
    color: #FFFFFF;

    &[disabled] {
      opacity: 0.5;
    }
  }
}

.load-more {
  text-align: center;
  padding: 24rpx 0;
}

.muted {
  font-size: 24rpx;
  color: #8E8E93;
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
  background-color: #1C1C1E;
  color: #FFFFFF;
}

.btn-plain {
  background-color: #F5F5F5;
  color: #36393B;
}

.fab {
  position: fixed;
  right: 40rpx;
  bottom: calc(100rpx + env(safe-area-inset-bottom));
  width: 112rpx;
  height: 112rpx;
  border-radius: 50%;
  background-color: #1C1C1E;
  color: #FFFFFF;
  font-size: 56rpx;
  font-weight: 300;
  line-height: 112rpx;
  text-align: center;
  padding: 0;
  box-shadow: 0 16rpx 48rpx rgba(0, 0, 0, 0.2);
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

.group-picker-body {
  display: flex;
  flex-direction: column;
  padding-bottom: calc(16rpx + env(safe-area-inset-bottom));
}

.group-picker-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16rpx;
}

.group-picker-title {
  font-size: 32rpx;
  font-weight: 700;
  color: #37291a;
}

.sheet-close {
  font-size: 32rpx;
  color: #6B6F73;
  padding: 4rpx 12rpx;
}

.group-picker-item {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 28rpx 20rpx;
  border-radius: 16rpx;
  margin-top: 8rpx;

  &.active {
    background-color: #F5F5F5;
  }
}

.group-picker-name {
  flex: 1;
  font-size: 30rpx;
  color: #37291a;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.group-picker-check {
  flex: none;
  font-size: 28rpx;
  color: #36393B;
}

.new-folder-row {
  display: flex;
  gap: 16rpx;
  align-items: center;
  margin-top: 16rpx;
  padding-top: 16rpx;
  border-top: 1rpx solid #E5E5E5;
}

.new-folder-input {
  flex: 1;
  box-sizing: border-box;
  height: 80rpx;
  line-height: 80rpx;
  padding: 0 20rpx;
  border-radius: 14rpx;
  background-color: #FFFFFF;
  border: 1rpx solid #36393B;
  font-size: 26rpx;
  color: #37291a;
}

.new-folder-btn {
  flex: none;
  height: 80rpx;
  line-height: 80rpx;
  padding: 0 32rpx;
  margin: 0;
  font-size: 26rpx;
}
</style>
