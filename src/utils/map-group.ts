import type { GroupView } from '@/types/group'
import type { RecentPublicGroup } from '@/stores/group'
import { getPublicGroup } from '@/services/group'

export interface MapGroupSelection {
  group: GroupView | null
  publicId: string
  isMember: boolean
}

function visitorGroup(recent: RecentPublicGroup): GroupView {
  return {
    id: '',
    publicId: recent.publicId,
    name: recent.name,
    role: 'member',
    updatedAt: new Date(0),
    isOwner: false,
  }
}

export function resolveMapGroup(
  groups: GroupView[],
  currentGroupId: string,
  requestedPublicId: string,
  recent: RecentPublicGroup | null,
): MapGroupSelection {
  if (requestedPublicId) {
    const requestedMemberGroup = groups.find((group) => group.publicId === requestedPublicId)
    if (requestedMemberGroup) {
      return { group: requestedMemberGroup, publicId: requestedPublicId, isMember: true }
    }
    const requestedRecent = recent?.publicId === requestedPublicId ? recent : null
    return {
      group: requestedRecent ? visitorGroup(requestedRecent) : null,
      publicId: requestedPublicId,
      isMember: false,
    }
  }

  const current = groups.find((group) => group.id === currentGroupId) || groups[0]
  if (current) {
    return { group: current, publicId: current.publicId, isMember: true }
  }
  if (recent) {
    return { group: visitorGroup(recent), publicId: recent.publicId, isMember: false }
  }
  return { group: null, publicId: '', isMember: false }
}

export function isGroupNotFoundError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code
  if (code === 'GROUP_NOT_FOUND') return true
  // 兜底：云端未带 code 时按历史文案判断
  const message = err instanceof Error ? err.message : ''
  return message.includes('不存在') || message.includes('不可访问')
}

// 校验最近访问的公开清单当前是否仍可访问。
// 明确提示清单不存在/不可访问（已被删除或失效）时返回 false；网络等其他错误不算失效。
export async function isRecentPublicGroupAvailable(
  recent: RecentPublicGroup,
): Promise<boolean> {
  try {
    await getPublicGroup(recent.publicId)
    return true
  } catch (err) {
    return !isGroupNotFoundError(err)
  }
}
