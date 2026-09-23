import { useState } from 'react'
import * as copy from './JudgeHostPicker.copy'

function initials(name) {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

// Same convention as BakerPicker: guess the photo path from the person's
// name so a file dropped in public/judges-hosts/ shows up with zero admin
// setup. No matching file just falls back to initials via onError below.
function photoSrc(name) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '')
  return `${import.meta.env.BASE_URL}judges-hosts/${slug}.webp`
}

function PersonThumb({ person }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return <span className="baker-thumb baker-thumb-fallback" aria-hidden="true">{initials(person.name)}</span>
  }
  return (
    <img
      className="baker-thumb"
      src={photoSrc(person.name)}
      alt=""
      onError={() => setFailed(true)}
    />
  )
}

export default function JudgeHostPicker({ groupName, label, people, value, onChange, multiple = false, maxPicks }) {
  if (multiple) {
    const selected = value ?? []
    const effectiveMaxPicks =
      Number.isFinite(maxPicks) && maxPicks > 0 ? maxPicks : people.length
    function toggle(personId) {
      if (selected.includes(personId)) {
        onChange(selected.filter((id) => id !== personId))
        return
      }
      if (selected.length >= effectiveMaxPicks) return
      onChange([...selected, personId])
    }
    return (
      <fieldset className="baker-picker">
        <legend>{label}</legend>
        <div className="baker-picker-options">
          {people.map((p) => {
            const checked = selected.includes(p.id)
            const disabled = !checked && selected.length >= effectiveMaxPicks
            return (
              <label key={p.id} className={`baker-option${checked ? ' selected' : ''}`}>
                <input
                  type="checkbox"
                  name={groupName}
                  checked={checked}
                  disabled={disabled}
                  onChange={() => toggle(p.id)}
                />
                <PersonThumb person={p} />
                <span className="baker-name">{p.shortName ?? p.name}</span>
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
        {people.map((p) => (
          <label key={p.id} className={`baker-option${value === p.id ? ' selected' : ''}`}>
            <input
              type="radio"
              name={groupName}
              value={p.id}
              checked={value === p.id}
              onChange={() => onChange(p.id)}
            />
            <PersonThumb person={p} />
            <span className="baker-name">{p.shortName ?? p.name}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
