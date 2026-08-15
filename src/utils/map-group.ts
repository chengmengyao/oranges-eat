import type { GroupView } from '@/types/group'
import type { RecentPublicGroup } from '@/stores/group'

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
