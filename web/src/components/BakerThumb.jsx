import { useState } from 'react'

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

export default function BakerThumb({ baker }) {
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
