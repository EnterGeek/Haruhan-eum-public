const canonicalNumber = (value: number): string => {
  if (Number.isNaN(value)) return '"__NaN__"'
  if (value === Number.POSITIVE_INFINITY) return '"__Infinity__"'
  if (value === Number.NEGATIVE_INFINITY) return '"__-Infinity__"'
  if (Object.is(value, -0)) return '0'
  return JSON.stringify(value)
}

export function canonicalJson(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'number') return canonicalNumber(value)
  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value)
  }
  if (typeof value === 'undefined') return '"__undefined__"'
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (typeof value === 'object') {
    const object = value as Record<string, unknown>
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(String(value))
}

/** Stable non-cryptographic identifier used only to group equal failures. */
export function stableHash(value: unknown): string {
  const input = canonicalJson(value)
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}
