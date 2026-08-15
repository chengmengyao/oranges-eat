import type { ShopCategory } from './shop'

export type MemberRole = 'owner' | 'member'
export type MemberStatus = 'active' | 'removed'
export type InviteStatus = 'active' | 'revoked'

export interface Group {
  _id: string
  publicId: string
  name: string
  ownerOpenId: string
  visibility: 'public_read'
  status: 'active'
  createdAt: Date
  updatedAt: Date
}

export interface Member {
  _id: string
  groupId: string
  userOpenId: string
  displayName: string
  role: MemberRole
  status: MemberStatus
  joinedAt: Date
  updatedAt: Date
}

export interface Invite {
  _id: string
  groupId: string
  tokenHash: string
  createdByOpenId: string
  status: InviteStatus
  expiresAt: Date
  maxUses: number
  usedCount: number
  createdAt: Date
}

export type GroupView = {
  id: string
  publicId: string
  name: string
  role: MemberRole
  updatedAt: Date
  isOwner: boolean
}

export type MemberView = {
  id: string
  displayName: string
  role: MemberRole
  status: MemberStatus
  joinedAt: Date
  isSelf: boolean
}

export type GroupPreview = {
  publicId: string
  name: string
  memberCount: number
  inviteStatus: 'valid' | 'expired' | 'revoked' | 'used-up' | 'invalid'
  inviteExpiresAt?: Date
  inviteRemainingUses?: number
  alreadyMember: boolean
}
