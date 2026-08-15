import { reactive } from 'vue'
import type { GroupView } from '@/types/group'

const CURRENT_GROUP_KEY = 'currentGroupId'
const RECENT_PUBLIC_GROUP_KEY = 'recentPublicGroup'

export interface RecentPublicGroup {
  publicId: string
  name: string
}

interface GroupState {
  groups: GroupView[]
  currentGroupId: string
  loaded: boolean
}

const state = reactive<GroupState>({
  groups: [],
  currentGroupId: '',
  loaded: false,
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
    setCurrentGroup,
    currentGroup,
    setRecentPublicGroup,
    getRecentPublicGroup,
    clearRecentPublicGroup,
    reset,
  }
}
