export function buildBonusFields({ type, options, includeEliminated, pickCount }) {
  return {
    options:
      type === 'multiple_choice' ? options.split(',').map((s) => s.trim()).filter(Boolean)
      // `|| 1` (not `??`): a cleared field yields Number('') === 0 and a
      // non-numeric one NaN, and a stored pick_count of 0/NaN disables every
      // checkbox for players and admins alike.
      : type === 'baker_multi_pick' ? { pick_count: Number(pickCount) || 1 }
      : null,
    include_eliminated: type === 'baker_pick' || type === 'baker_multi_pick' ? includeEliminated : false,
  }
}

export function formStateFromQuestion(bq) {
  return {
    type: bq.type,
    options: bq.type === 'multiple_choice' ? (bq.options ?? []).join(', ') : '',
    includeEliminated: bq.include_eliminated ?? false,
    pickCount: bq.type === 'baker_multi_pick' ? String(bq.options?.pick_count ?? 3) : '3',
  }
}
