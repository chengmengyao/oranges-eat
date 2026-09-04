<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { FolderView, GroupView } from '@/types/group'
import { listPublicFolders } from '@/services/group'

export type GroupCityOption = GroupView | { id: ''; publicId: string; name: string }

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    options: GroupCityOption[]
    currentPublicId: string
    currentFolderFilter?: string
    mode?: 'tree' | 'columns' | 'group'
    title?: string
    hideAllOption?: boolean
    showUncategorizedAlways?: boolean
  }>(),
  {
    currentFolderFilter: 'all',
    mode: 'tree',
    title: '选择清单与城市',
    hideAllOption: false,
    showUncategorizedAlways: false,
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'select', payload: { publicId: string; folderValue?: string; folderName?: string }): void
}>()

const expandedPublicId = ref('')
const loadingFolderPublicId = ref('')
const folderCache = ref<Record<string, { folders: FolderView[]; uncategorizedCount: number }>>({})
const inflightFolderPids = new Set<string>()

const activeColumnPublicId = ref('')

const columnOptions = computed(() => props.options)
const activeColumnGroupName = computed(
  () =>
    columnOptions.value.find((o) => o.publicId === activeColumnPublicId.value)?.name || '',
)
const columnFolders = computed(() =>
  activeColumnPublicId.value ? folderCache.value[activeColumnPublicId.value] : null,
)
const currentColumnFolderValue = computed(() => {
  if (!activeColumnPublicId.value) return ''
  if (activeColumnPublicId.value !== props.currentPublicId) return ''
  return props.currentFolderFilter
})
const currentColumnFolderName = computed(() => {
  if (currentColumnFolderValue.value === 'all') return '全部'
  if (currentColumnFolderValue.value === 'none') return '未分类'
  const f = columnFolders.value?.folders.find((x) => x.id === currentColumnFolderValue.value)
  return f ? f.name : ''
})

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    if (props.mode === 'tree' && props.currentPublicId) {
      expandedPublicId.value = props.currentPublicId
      void loadFolderCache(props.currentPublicId, true)
    }
    if (props.mode === 'columns') {
      activeColumnPublicId.value =
        props.options.find((o) => o.publicId === props.currentPublicId)?.publicId ||
        props.options[0]?.publicId ||
        ''
      if (activeColumnPublicId.value) {
        void loadFolderCache(activeColumnPublicId.value, true)
      }
    }
  },
)

watch(activeColumnPublicId, (pid) => {
  if (pid) void loadFolderCache(pid)
})

function folderDataOf(pid: string) {
  return folderCache.value[pid]
}

async function loadFolderCache(pid: string, force = false) {
  if (!force && folderCache.value[pid]) return
  if (inflightFolderPids.has(pid)) return
  inflightFolderPids.add(pid)
  loadingFolderPublicId.value = pid
  try {
    const res = await listPublicFolders(pid)
    folderCache.value = { ...folderCache.value, [pid]: res }
  } catch {
    if (!folderCache.value[pid]) {
      folderCache.value = {
        ...folderCache.value,
        [pid]: { folders: [], uncategorizedCount: 0 },
      }
    }
  } finally {
    inflightFolderPids.delete(pid)
    if (loadingFolderPublicId.value === pid) loadingFolderPublicId.value = ''
  }
}

function toggleExpand(opt: GroupCityOption) {
  if (expandedPublicId.value === opt.publicId) {
    expandedPublicId.value = ''
    return
  }
  expandedPublicId.value = opt.publicId
  void loadFolderCache(opt.publicId)
}

function close() {
  emit('update:modelValue', false)
}

function selectFolder(opt: GroupCityOption, folderValue?: string, folderName?: string) {
  emit('select', { publicId: opt.publicId, folderValue, folderName })
  close()
}

function selectColumnFolder(folderValue?: string, folderName?: string) {
  const opt = columnOptions.value.find((o) => o.publicId === activeColumnPublicId.value)
  if (!opt) return
  emit('select', { publicId: opt.publicId, folderValue, folderName })
  close()
}

function pickColumnGroup(publicId: string) {
  if (publicId === activeColumnPublicId.value) return
  activeColumnPublicId.value = publicId
  void loadFolderCache(publicId)
}
</script>

<template>
  <wd-popup
    :model-value="modelValue"
    position="bottom"
    :z-index="1000"
    custom-style="background: #f2f2f2; padding: 16rpx 0 0; border-top-left-radius: 56rpx; border-top-right-radius: 56rpx;"
    modal-style="background: rgba(0, 0, 0, 0.35);"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <view class="gcp-body">
      <view class="gcp-head">
        <text class="gcp-title">{{ title }}</text>
        <view class="gcp-close" @click="close">
          <text>✕</text>
        </view>
      </view>
      <view v-if="mode === 'columns'" class="gcp-columns">
        <scroll-view scroll-y class="gcp-column-left" :show-scrollbar="false">
          <view
            v-for="opt in options"
            :key="opt.publicId"
            class="gcp-col-item"
            :class="{ active: activeColumnPublicId === opt.publicId }"
            @click="pickColumnGroup(opt.publicId)"
          >
            <text class="gcp-col-item-name">{{ opt.name }}</text>
          </view>
        </scroll-view>
        <scroll-view scroll-y class="gcp-column-right" :show-scrollbar="false">
          <template v-if="activeColumnPublicId">
            <view class="gcp-col-context">
              <text class="gcp-col-context-group">{{ activeColumnGroupName }}</text>
              <text class="gcp-col-context-sep">›</text>
              <text class="gcp-col-context-city">{{ currentColumnFolderName || '选择城市' }}</text>
            </view>
            <view v-if="loadingFolderPublicId === activeColumnPublicId" class="gcp-col-loading">
              加载中…
            </view>
            <template v-else>
              <view
                v-if="!hideAllOption"
                class="gcp-col-option"
                :class="{ selected: currentColumnFolderValue === 'all' }"
                @click="selectColumnFolder('all')"
              >
                <text class="gcp-col-option-name">全部</text>
              </view>
              <view
                v-if="
                  (columnFolders?.uncategorizedCount ?? 0) > 0 || showUncategorizedAlways
                "
                class="gcp-col-option"
                :class="{ selected: currentColumnFolderValue === 'none' }"
                @click="selectColumnFolder('none', '未分类')"
              >
                <text class="gcp-col-option-name">未分类</text>
              </view>
              <view
                v-for="f in columnFolders?.folders ?? []"
                :key="f.id"
                class="gcp-col-option"
                :class="{ selected: currentColumnFolderValue === f.id }"
                @click="selectColumnFolder(f.id, f.name)"
              >
                <text class="gcp-col-option-name">{{ f.name }}</text>
              </view>
            </template>
          </template>
          <view v-else class="gcp-col-loading">暂无清单</view>
        </scroll-view>
      </view>
      <scroll-view v-else scroll-y class="gcp-scroll" :show-scrollbar="false">
        <template v-if="mode === 'tree'">
          <view class="gcp-section-label">选择清单</view>
          <view v-for="opt in options" :key="opt.publicId">
            <view
              class="gcp-card"
              :class="{ selected: currentPublicId === opt.publicId }"
              @click="toggleExpand(opt)"
            >
              <view class="gcp-icon">
                <text>👥</text>
              </view>
              <text class="gcp-card-name">{{ opt.name }}</text>
              <view class="gcp-card-right">
                <view v-if="currentPublicId === opt.publicId" class="gcp-check">
                  <text>✓</text>
                </view>
                <text
                  v-else
                  class="gcp-arrow"
                  :class="{ expanded: expandedPublicId === opt.publicId }"
                >▼</text>
              </view>
            </view>
            <view v-if="expandedPublicId === opt.publicId" class="gcp-sub">
              <view v-if="loadingFolderPublicId === opt.publicId" class="gcp-sub-loading">
                加载中…
              </view>
              <template v-else>
                <view
                  v-if="!hideAllOption"
                  class="gcp-sub-card"
                  :class="{ selected: currentPublicId === opt.publicId && currentFolderFilter === 'all' }"
                  @click="selectFolder(opt, 'all')"
                >
                  <text class="gcp-sub-name">全部</text>
                  <view
                    v-if="currentPublicId === opt.publicId && currentFolderFilter === 'all'"
                    class="gcp-check"
                  >
                    <text>✓</text>
                  </view>
                </view>
                <view
                  v-if="(folderDataOf(opt.publicId)?.uncategorizedCount ?? 0) > 0 || showUncategorizedAlways"
                  class="gcp-sub-card"
                  :class="{ selected: currentPublicId === opt.publicId && currentFolderFilter === 'none' }"
                  @click="selectFolder(opt, 'none', '未分类')"
                >
                  <text class="gcp-sub-name">未分类</text>
                  <view class="gcp-sub-right">
                    <view
                      v-if="currentPublicId === opt.publicId && currentFolderFilter === 'none'"
                      class="gcp-check"
                    >
                      <text>✓</text>
                    </view>
                    <text
                      v-else-if="(folderDataOf(opt.publicId)?.uncategorizedCount ?? 0) > 0"
                      class="gcp-count"
                    >
                      {{ folderDataOf(opt.publicId)?.uncategorizedCount }} 个地点
                    </text>
                  </view>
                </view>
                <view
                  v-for="f in folderDataOf(opt.publicId)?.folders ?? []"
                  :key="f.id"
                  class="gcp-sub-card"
                  :class="{ selected: currentPublicId === opt.publicId && currentFolderFilter === f.id }"
                  @click="selectFolder(opt, f.id, f.name)"
                >
                  <text class="gcp-sub-name">{{ f.name }}</text>
                  <view class="gcp-sub-right">
                    <view
                      v-if="currentPublicId === opt.publicId && currentFolderFilter === f.id"
                      class="gcp-check"
                    >
                      <text>✓</text>
                    </view>
                    <text v-else-if="f.shopCount !== undefined" class="gcp-count">
                      {{ f.shopCount }} 个地点
                    </text>
                  </view>
                </view>
              </template>
            </view>
          </view>
        </template>
        <template v-else>
          <view class="gcp-section-label">选择清单</view>
          <view
            v-for="opt in options"
            :key="opt.publicId"
            class="gcp-card"
            :class="{ selected: currentPublicId === opt.publicId }"
            @click="selectFolder(opt)"
          >
            <view class="gcp-icon">
              <text>👥</text>
            </view>
            <text class="gcp-card-name">{{ opt.name }}</text>
            <view v-if="currentPublicId === opt.publicId" class="gcp-check">
              <text>✓</text>
            </view>
          </view>
        </template>
      </scroll-view>
    </view>
  </wd-popup>
</template>

<style scoped>
.gcp-body {
  display: flex;
  flex-direction: column;
  padding-bottom: calc(24rpx + env(safe-area-inset-bottom));
}

.gcp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 40rpx 28rpx;
}

.gcp-title {
  font-size: 40rpx;
  font-weight: 700;
  color: #1a1a1a;
  letter-spacing: -1rpx;
}

.gcp-close {
  flex: none;
  width: 64rpx;
  height: 64rpx;
  border-radius: 50%;
  background: #e8e8e8;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 36rpx;
  color: #666;
}

.gcp-scroll {
  max-height: 70vh;
}

/* ===== 左右两列联动 ===== */
.gcp-columns {
  display: flex;
  height: 62vh;
  margin: 0 24rpx;
  overflow: hidden;
  background: #ffffff;
}

.gcp-column-left {
  flex: none;
  width: 220rpx;
  background: #f7f5f2;
  border-right: 1rpx solid #f0ede8;
}

.gcp-col-item {
  position: relative;
  padding: 30rpx 16rpx 30rpx 28rpx;
}

.gcp-col-item.active {
  background: #ffffff;
}

.gcp-col-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 6rpx;
  height: 36rpx;
  border-radius: 6rpx;
  background: #36393b;
}

.gcp-col-item-name {
  display: block;
  font-size: 28rpx;
  line-height: 1.35;
  color: #6f6a63;
}

.gcp-col-item.active .gcp-col-item-name {
  font-weight: 600;
  color: #1a1a1a;
}

.gcp-column-right {
  flex: 1;
  min-width: 0;
  background: #ffffff;
}

.gcp-col-context {
  display: flex;
  align-items: center;
  gap: 8rpx;
  padding: 24rpx 28rpx 16rpx;
}

.gcp-col-context-group {
  max-width: 200rpx;
  font-size: 24rpx;
  color: #999;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.gcp-col-context-sep {
  font-size: 24rpx;
  color: #ccc;
}

.gcp-col-context-city {
  flex: 1;
  font-size: 24rpx;
  color: #36393b;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.gcp-col-loading {
  padding: 40rpx 28rpx;
  font-size: 26rpx;
  color: #999;
}

.gcp-col-option {
  position: relative;
  margin: 0 12rpx 4rpx;
  padding: 28rpx;
  border-radius: 20rpx;
}

.gcp-col-option:active {
  background: #f7f5f2;
}

.gcp-col-option.selected {
  background: #f5f3ef;
}

.gcp-col-option.selected::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 6rpx;
  height: 32rpx;
  border-radius: 6rpx;
  background: #36393b;
}

.gcp-col-option-name {
  display: block;
  font-size: 30rpx;
  color: #333;
}

.gcp-col-option.selected .gcp-col-option-name {
  font-weight: 600;
  color: #1a1a1a;
}

.gcp-section-label {
  font-size: 26rpx;
  font-weight: 600;
  color: #999;
  letter-spacing: 1rpx;
  margin: 8rpx 12rpx 20rpx;
}

.gcp-card {
  display: flex;
  align-items: center;
  gap: 28rpx;
  padding: 32rpx 36rpx;
  background: #ffffff;
  border-radius: 36rpx;
  box-shadow: 0 2rpx 6rpx rgba(0, 0, 0, 0.04);
  margin-bottom: 16rpx;
}

.gcp-card:active {
  transform: scale(0.98);
  background: #f8f8f8;
}

.gcp-icon {
  flex: none;
  width: 80rpx;
  height: 80rpx;
  border-radius: 50%;
  background: #f5f5f5;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 40rpx;
}

.gcp-card-name {
  flex: 1;
  font-size: 32rpx;
  font-weight: 500;
  color: #1a1a1a;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.gcp-card.selected .gcp-card-name {
  font-weight: 600;
}

.gcp-card-right {
  flex: none;
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.gcp-check {
  flex: none;
  width: 44rpx;
  height: 44rpx;
  border-radius: 50%;
  background: #1a1a1a;
  color: #ffffff;
  font-size: 24rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.gcp-arrow {
  flex: none;
  font-size: 24rpx;
  color: #bbb;
  transition: transform 0.2s;
}

.gcp-arrow.expanded {
  transform: rotate(180deg);
}

.gcp-sub {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  margin-bottom: 16rpx;
  padding-left: 24rpx;
}

.gcp-sub-card {
  display: flex;
  align-items: center;
  gap: 24rpx;
  padding: 28rpx 32rpx;
  background: #ffffff;
  border-radius: 32rpx;
  box-shadow: 0 2rpx 6rpx rgba(0, 0, 0, 0.04);
}

.gcp-sub-card:active {
  transform: scale(0.98);
  background: #f8f8f8;
}

.gcp-sub-name {
  flex: 1;
  font-size: 30rpx;
  font-weight: 500;
  color: #333;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.gcp-sub-card.selected .gcp-sub-name {
  font-weight: 600;
  color: #1a1a1a;
}

.gcp-sub-right {
  flex: none;
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.gcp-count {
  flex: none;
  font-size: 28rpx;
  color: #999;
}

.gcp-sub-loading {
  padding: 28rpx 32rpx;
  font-size: 26rpx;
  color: #999;
}
</style>
