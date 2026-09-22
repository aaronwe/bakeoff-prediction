import { useState } from 'react'
import * as copy from './BakerPicker.copy'

function initials(name) {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

// Photos aren't stored anywhere yet (bakers has no admin-managed photo field
// in the UI) — this guesses a path from the baker's name so photos already
// dropped in public/bakers/ show up with zero admin setup. A baker with no
// matching file just falls back to initials via the <img> onError below.
function photoSrc(name) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '')
  return `${import.meta.env.BASE_URL}bakers/${slug}.webp`
}

function BakerThumb({ baker }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return <span className="baker-thumb baker-thumb-fallback" aria-hidden="true">{initials(baker.name)}</span>
  }
  return (
    <img
      className="baker-thumb"
      src={photoSrc(baker.name)}
      alt=""
      onError={() => setFailed(true)}
    />
  )
}

export default function BakerPicker({ groupName, label, bakers, value, onChange, multiple = false, maxPicks }) {
  if (multiple) {
    const selected = value ?? []
    function toggle(bakerId) {
      if (selected.includes(bakerId)) {
        onChange(selected.filter((id) => id !== bakerId))
        return
      }
      if (selected.length >= maxPicks) return
      onChange([...selected, bakerId])
    }
    return (
      <fieldset className="baker-picker">
        <legend>{label}</legend>
        <div className="baker-picker-options">
          {bakers.map((b) => {
            const checked = selected.includes(b.id)
            const disabled = !checked && selected.length >= maxPicks
            return (
              <label key={b.id} className={`baker-option${checked ? ' selected' : ''}`}>
                <input
                  type="checkbox"
                  name={groupName}
                  checked={checked}
                  disabled={disabled}
                  onChange={() => toggle(b.id)}
                />
                <BakerThumb baker={b} />
                <span className="baker-name">{b.name}</span>
              </label>
            )
          })}
        </div>
      </fieldset>
    )
  }

  return (
    <fieldset className="baker-picker">
      <legend>{label}</legend>
      <div className="baker-picker-options">
        <label className={`baker-option baker-option-skip${value === '' ? ' selected' : ''}`}>
          <input
            type="radio"
            name={groupName}
            value=""
            checked={value === ''}
            onChange={() => onChange('')}
          />
          <span className="baker-thumb baker-thumb-fallback" aria-hidden="true">—</span>
          <span className="baker-name">{copy.NO_PICK}</span>
        </label>
        {bakers.map((b) => (
          <label key={b.id} className={`baker-option${value === b.id ? ' selected' : ''}`}>
            <input
              type="radio"
              name={groupName}
              value={b.id}
              checked={value === b.id}
              onChange={() => onChange(b.id)}
            />
            <BakerThumb baker={b} />
            <span className="baker-name">{b.name}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
