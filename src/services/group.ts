import { callFunction } from '@/utils/cloud'
import type {
  FolderView,
  GroupPreview,
  GroupView,
  MemberView,
} from '@/types/group'

export interface CreateGroupResult {
  group: GroupView
}

export interface CreateInviteResult {
  token: string
  shortCode: string
  expiresAt: number
  remainingUses: number
}

export interface InviteQrCodeResult {
  fileID: string
  publicId: string
  name: string
}

export async function bootstrap(): Promise<{ hasGroups: boolean }> {
  return callFunction('groupApi', { action: 'bootstrap' })
}

export async function getPublicGroup(
  publicId: string,
): Promise<GroupPreview> {
  return callFunction('groupApi', { action: 'getPublicGroup', publicId })
}

export async function createGroup(
  groupName: string,
  displayName: string,
): Promise<CreateGroupResult> {
  return callFunction('groupApi', {
    action: 'createGroup',
    groupName,
    displayName,
  })
}

export async function listMyGroups(): Promise<GroupView[]> {
  return callFunction('groupApi', { action: 'listMyGroups' })
}

export async function updateGroupName(
  groupId: string,
  name: string,
): Promise<{ updatedAt: number }> {
  return callFunction('groupApi', {
    action: 'updateGroup',
    groupId,
    name,
  })
}

export async function createInvite(
  groupId: string,
): Promise<CreateInviteResult> {
  return callFunction('groupApi', { action: 'createInvite', groupId })
}

export async function previewInvite(
  token: string,
  code?: string,
): Promise<GroupPreview | null> {
  return callFunction('groupApi', { action: 'previewInvite', token, code })
}

export async function acceptInvite(
  token: string,
  displayName: string,
  code?: string,
): Promise<GroupPreview> {
  return callFunction('groupApi', {
    action: 'acceptInvite',
    token,
    displayName,
    code,
  })
}

export async function createInviteQrCode(
  token: string,
  code?: string,
): Promise<InviteQrCodeResult> {
  return callFunction('groupApi', {
    action: 'createInviteQrCode',
    token,
    code,
  })
}

export async function revokeInvite(
  groupId: string,
): Promise<{ revoked: boolean }> {
  return callFunction('groupApi', { action: 'revokeInvite', groupId })
}

export async function listMembers(
  groupId: string,
): Promise<MemberView[]> {
  return callFunction('groupApi', { action: 'listMembers', groupId })
}

export async function updateMyDisplayName(
  groupId: string,
  displayName: string,
): Promise<{ displayName: string; updatedShops: number }> {
  return callFunction('groupApi', {
    action: 'updateMyDisplayName',
    groupId,
    displayName,
  })
}

export async function removeMember(
  groupId: string,
  memberId: string,
): Promise<{ removed: boolean }> {
  return callFunction('groupApi', {
    action: 'removeMember',
    groupId,
    memberId,
  })
}

export async function deleteGroup(groupId: string): Promise<{ deleted: boolean }> {
  return callFunction('groupApi', {
    action: 'deleteGroup',
    groupId,
  })
}

export interface ListFoldersResult {
  folders: FolderView[]
  uncategorizedCount: number
}

export async function listFolders(groupId: string): Promise<ListFoldersResult> {
  return callFunction('groupApi', { action: 'listFolders', groupId })
}

export async function listPublicFolders(publicId: string): Promise<ListFoldersResult> {
  return callFunction('groupApi', { action: 'listPublicFolders', publicId })
}

export async function createFolder(
  groupId: string,
  name: string,
): Promise<FolderView> {
  return callFunction('groupApi', { action: 'createFolder', groupId, name })
}

export async function updateFolder(
  folderId: string,
  name: string,
): Promise<{ updatedAt: number }> {
  return callFunction('groupApi', { action: 'updateFolder', folderId, name })
}

export async function deleteFolder(folderId: string): Promise<{ deleted: boolean }> {
  return callFunction('groupApi', { action: 'deleteFolder', folderId })
}

export interface MergeGroupsResult {
  group: GroupView
  mergedShops: number
  mergedFolders: number
}

export async function mergeGroups(
  targetGroupId: string,
  sourceGroupIds: string[],
): Promise<MergeGroupsResult> {
  return callFunction('groupApi', {
    action: 'mergeGroups',
    targetGroupId,
    sourceGroupIds,
  })
}

export interface AssignUncategorizedInput {
  groupId: string
  folderId?: string
  folderName?: string
}

export interface AssignUncategorizedResult {
  updated: number
  folderId: string
}

export async function assignUncategorizedShops(
  input: AssignUncategorizedInput,
): Promise<AssignUncategorizedResult> {
  return callFunction('groupApi', {
    action: 'assignUncategorizedShops',
    ...input,
  })
}
