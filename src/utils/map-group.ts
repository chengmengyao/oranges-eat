import type { GroupView } from '@/types/group'
import type { GroupViewState, RecentPublicGroup } from '@/stores/group'
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

// 依据全局唯一视图（view）解析当前应展示的清单。
// - 视图为公开(访客)清单且仍可访问 → 优先展示公开清单，不被成员清单顶回；
// - 视图为成员清单 / 公开清单已失效 → 走成员清单（当前成员位或第一个）；
// - 没有任何成员清单 → 兜底最近访问的公开清单。
export function resolveMapGroup(
  groups: GroupView[],
  view: GroupViewState,
  recent: RecentPublicGroup | null,
): MapGroupSelection {
  if (view.kind === 'public' && recent && recent.publicId === view.publicId) {
    return { group: visitorGroup(recent), publicId: recent.publicId, isMember: false }
  }

  const groupId = view.kind === 'member' ? view.groupId : ''
  const current = groups.find((group) => group.id === groupId) || groups[0]
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
