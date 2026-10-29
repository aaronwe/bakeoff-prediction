export const TITLE = 'Players'
export const NAME = 'Name'
export const EMAIL = 'Email'
export const DELETE = 'Delete'
export const DELETE_HAD_NO_EFFECT =
  "Nothing was deleted — you may not have permission, or this player was already removed."
export const confirmDelete = (displayName) =>
  `Delete ${displayName}? This also deletes all of their answers and scores. This can't be undone.`

export const MERGE_TITLE = 'Merge players'
export const MERGE_HELP =
  "Check two players who are really the same person. For any episode they both played, the higher score is kept; everything else is combined into the player you keep."
export const MERGE_PICK_TWO = 'Check two players below to merge them.'
export const KEEP = 'Keep'
export const MERGE = 'Merge'
export const MERGING = 'Merging…'
export const MERGE_FAILED = 'Merge failed — nothing was changed.'
export const confirmMerge = (keepName, keepEmail, dropName, dropEmail) =>
  `Merge ${dropName} (${dropEmail}) into ${keepName} (${keepEmail})? ${dropName}'s player will be deleted. This can't be undone.`
export const mergeDone = (keepName, overlapping) =>
  overlapping === 0
    ? `Merged into ${keepName}. They had no episodes in common.`
    : `Merged into ${keepName}. ${overlapping} ${overlapping === 1 ? 'episode' : 'episodes'} overlapped; the higher score was kept for each.`
