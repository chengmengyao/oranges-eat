export interface InviteEntry {
  token: string
  publicId: string
  code: string
}

function decode(value: unknown): string {
  if (typeof value !== 'string' || !value) return ''
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function codeFromScene(rawScene: unknown): string {
  const scene = decode(rawScene)
  for (const part of scene.split('&')) {
    const separator = part.indexOf('=')
    if (separator < 0) continue
    const key = decode(part.slice(0, separator))
    if (key === 'c' || key === 'code') {
      return decode(part.slice(separator + 1)).trim()
    }
  }
  return ''
}

export function parseInviteEntry(
  query?: Record<string, unknown>,
): InviteEntry {
  return {
    token: decode(query?.token).trim(),
    publicId: decode(query?.publicId).trim(),
    // code 方便开发者工具直接调试；scene 用于真实小程序码扫码入口。
    code: decode(query?.code).trim() || codeFromScene(query?.scene),
  }
}
