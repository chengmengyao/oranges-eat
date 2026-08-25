import { reactive } from 'vue'
import type { FolderView, GroupView } from '@/types/group'

const CURRENT_GROUP_KEY = 'currentGroupId'
const RECENT_PUBLIC_GROUP_KEY = 'recentPublicGroup'

export interface RecentPublicGroup {
  publicId: string
  name: string
}

interface GroupState {
  groups: GroupView[]
  folders: FolderView[]
  currentGroupId: string
  loaded: boolean
  lastAddedShopId: string
}

const state = reactive<GroupState>({
  groups: [],
  folders: [],
  currentGroupId: '',
  loaded: false,
  lastAddedShopId: '',
})

export function useGroupStore() {
  function loadLocal() {
    state.currentGroupId = uni.getStorageSync(CURRENT_GROUP_KEY) || ''
  }

  function setGroups(groups: GroupView[]) {
    state.groups = groups
    state.loaded = true
    if (groups.length === 0) {
      state.currentGroupId = ''
      uni.removeStorageSync(CURRENT_GROUP_KEY)
      return
    }
    const exists = groups.some((g) => g.id === state.currentGroupId)
    if (!exists) {
      state.currentGroupId = groups[0].id
      uni.setStorageSync(CURRENT_GROUP_KEY, state.currentGroupId)
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

  function setCurrentGroup(id: string) {
    state.currentGroupId = id
    uni.setStorageSync(CURRENT_GROUP_KEY, id)
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
    uni.removeStorageSync(CURRENT_GROUP_KEY)
  }

  return {
    state,
    loadLocal,
    setGroups,
    setFolders,
    clearFolders,
    folderName,
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
