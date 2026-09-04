import { reactive } from 'vue'
import type { FolderView, GroupView } from '@/types/group'

const CURRENT_GROUP_KEY = 'currentGroupId'
const RECENT_PUBLIC_GROUP_KEY = 'recentPublicGroup'
const CURRENT_VIEW_KEY = 'currentGroupView'

export interface RecentPublicGroup {
  publicId: string
  name: string
}

// 全局唯一的“当前查看清单”：
// - member：当前查看自己的成员清单（groupId）
// - public：当前查看朋友的公开/访客清单（publicId）
export type GroupViewState =
  | { kind: 'member'; groupId: string }
  | { kind: 'public'; publicId: string }

const DEFAULT_VIEW: GroupViewState = { kind: 'member', groupId: '' }

interface GroupState {
  groups: GroupView[]
  folders: FolderView[]
  currentGroupId: string
  view: GroupViewState
  loaded: boolean
  lastAddedShopId: string
  // 数据已变更标记：切换清单 / 增删改店铺与城市等操作后置位，
  // 页面 onShow 刷新时据此显示全局 loading，提升跨页同步的体验
  dataStale: boolean
}

const state = reactive<GroupState>({
  groups: [],
  folders: [],
  currentGroupId: '',
  view: { ...DEFAULT_VIEW },
  loaded: false,
  lastAddedShopId: '',
  dataStale: false,
})

function memberView(groupId: string): GroupViewState {
  return { kind: 'member', groupId }
}

function sameView(a: GroupViewState, b: GroupViewState): boolean {
  if (a.kind !== b.kind) return false
  return a.kind === 'member' ? a.groupId === (b as { groupId: string }).groupId : a.publicId === (b as { publicId: string }).publicId
}

function persistView() {
  uni.setStorageSync(CURRENT_VIEW_KEY, JSON.stringify(state.view))
}

function readStoredView(): GroupViewState | null {
  try {
    const raw = uni.getStorageSync(CURRENT_VIEW_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as GroupViewState
    if (!parsed || typeof parsed !== 'object') return null
    if (parsed.kind === 'member') {
      return { kind: 'member', groupId: String(parsed.groupId || '') }
    }
    if (parsed.kind === 'public') {
      return { kind: 'public', publicId: String(parsed.publicId || '') }
    }
    return null
  } catch {
    return null
  }
}

export function useGroupStore() {
  function loadLocal() {
    const storedCid = uni.getStorageSync(CURRENT_GROUP_KEY) || ''
    state.currentGroupId = storedCid
    const storedView = readStoredView()
    if (storedView) {
      state.view = storedView
    } else if (storedCid) {
      // 兼容旧版本：仅有 currentGroupId 时按成员视图初始化
      state.view = memberView(storedCid)
    } else {
      const recent = getRecentPublicGroup()
      state.view = recent ? { kind: 'public', publicId: recent.publicId } : { ...DEFAULT_VIEW }
    }
    persistView()
  }

  function setGroups(groups: GroupView[]) {
    state.groups = groups
    state.loaded = true
    if (groups.length === 0) {
      state.currentGroupId = ''
      uni.removeStorageSync(CURRENT_GROUP_KEY)
      if (state.view.kind === 'member' && state.view.groupId) {
        applyView({ ...DEFAULT_VIEW })
      }
      return
    }
    // 成员默认位：当前成员位失效时回落到第一个清单（兼容旧逻辑）
    const cidExists = groups.some((g) => g.id === state.currentGroupId)
    if (!cidExists) {
      state.currentGroupId = groups[0].id
      uni.setStorageSync(CURRENT_GROUP_KEY, state.currentGroupId)
    }
    // 成员视图指向的清单已被删除：跟随回落后的当前成员位
    const view = state.view
    if (view.kind === 'member') {
      const g = groups.find((x) => x.id === view.groupId)
      if (!g && state.currentGroupId) {
        applyView(memberView(state.currentGroupId))
      }
    }
  }

  function setFolders(folders: FolderView[]) {
    state.folders = folders
  }

  function clearFolders() {
    state.folders = []
  }

  function folderName(folderId: string | null | undefined): string {
    if (!folderId) return '未分类'
    const folder = state.folders.find((f) => f.id === folderId)
    return folder ? folder.name : '未分类'
  }

  // —— 全局“当前查看清单”唯一切换入口 ——

  // 记录数据已变更，页面切回时通过 consumeDataStale 感知并展示 loading
  function markDataChanged() {
    state.dataStale = true
  }

  // 读取并清空变更标记，返回是否有待同步的数据变更
  function consumeDataStale(): boolean {
    const stale = state.dataStale
    state.dataStale = false
    return stale
  }

  function applyView(next: GroupViewState) {
    if (!sameView(state.view, next)) state.dataStale = true
    state.view = next
    persistView()
  }

  // 直接写回视图（用于切换失败回滚等场景，不产生变更标记）
  function setView(view: GroupViewState) {
    state.view = view.kind === 'member' ? memberView(view.groupId) : { kind: 'public', publicId: view.publicId }
    persistView()
  }

  // 切换到某个成员清单
  function switchToGroup(groupId: string) {
    if (state.currentGroupId !== groupId || !sameView(state.view, memberView(groupId))) {
      state.dataStale = true
    }
    state.currentGroupId = groupId
    uni.setStorageSync(CURRENT_GROUP_KEY, groupId)
    state.view = memberView(groupId)
    persistView()
  }

  // 切换到公开(访客)清单：保留成员默认位供后续回落，但视图不再被成员清单顶回
  function switchToPublic(publicId: string, name?: string) {
    if (name) {
      const recent = getRecentPublicGroup()
      if (recent?.publicId !== publicId) setRecentPublicGroup({ publicId, name })
    }
    applyView({ kind: 'public', publicId })
  }

  // 按 publicId 智能切换：是成员组则切成员视图，否则切公开视图
  function switchByPublicId(publicId: string, name?: string) {
    const member = state.groups.find((g) => g.publicId === publicId)
    if (member) switchToGroup(member.id)
    else switchToPublic(publicId, name)
  }

  function setCurrentGroup(id: string) {
    switchToGroup(id)
  }

  function currentGroup(): GroupView | null {
    return state.groups.find((g) => g.id === state.currentGroupId) || null
  }

  function setRecentPublicGroup(group: RecentPublicGroup) {
    uni.setStorageSync(RECENT_PUBLIC_GROUP_KEY, JSON.stringify(group))
  }

  function getRecentPublicGroup(): RecentPublicGroup | null {
    try {
      const raw = uni.getStorageSync(RECENT_PUBLIC_GROUP_KEY)
      if (!raw) return null
      return JSON.parse(raw) as RecentPublicGroup
    } catch {
      return null
    }
  }

  function clearRecentPublicGroup() {
    uni.removeStorageSync(RECENT_PUBLIC_GROUP_KEY)
    // 清理的正是当前公开视图时，回落到成员默认位，避免指向失效的公开清单
    if (state.view.kind === 'public') {
      applyView(memberView(state.currentGroupId))
    }
  }

  function setLastAddedShopId(id: string) {
    state.lastAddedShopId = id
  }

  function clearLastAddedShopId() {
    state.lastAddedShopId = ''
  }

  function reset() {
    state.groups = []
    state.currentGroupId = ''
    state.loaded = false
    state.view = { ...DEFAULT_VIEW }
    state.dataStale = false
    uni.removeStorageSync(CURRENT_GROUP_KEY)
    uni.removeStorageSync(CURRENT_VIEW_KEY)
  }

  return {
    state,
    loadLocal,
    setGroups,
    setFolders,
    clearFolders,
    folderName,
    markDataChanged,
    consumeDataStale,
    setView,
    switchToGroup,
    switchToPublic,
    switchByPublicId,
    setCurrentGroup,
    currentGroup,
    setRecentPublicGroup,
    getRecentPublicGroup,
    clearRecentPublicGroup,
    setLastAddedShopId,
    clearLastAddedShopId,
    reset,
  }
}
