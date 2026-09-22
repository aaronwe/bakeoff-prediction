export const TITLE = 'Players'
export const NAME = 'Name'
export const EMAIL = 'Email'
export const DELETE = 'Delete'
export const DELETE_HAD_NO_EFFECT =
  "Nothing was deleted — you may not have permission, or this player was already removed."
export const confirmDelete = (displayName) =>
  `Delete ${displayName}? This also deletes all of their answers and scores. This can't be undone.`
