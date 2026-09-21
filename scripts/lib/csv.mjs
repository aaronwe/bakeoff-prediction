function escapeCsvField(value) {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export function toCsv(rows, columns) {
  const header = columns.join(',')
  const lines = rows.map((row) => columns.map((col) => escapeCsvField(row[col])).join(','))
  return [header, ...lines].join('\n') + '\n'
}
