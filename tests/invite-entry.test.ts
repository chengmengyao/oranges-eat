import { describe, expect, it } from 'vitest'
import { parseInviteEntry } from '../src/utils/invite-entry'

describe('邀请入口参数', () => {
  const shortCode = 'rx2qhK7VpXDH'

  it('解析真实小程序码传入的 scene', () => {
    expect(parseInviteEntry({ scene: `c=${shortCode}` }).code).toBe(shortCode)
  })

  it('解析开发者工具 URL 编码后的 scene', () => {
    expect(parseInviteEntry({ scene: `c%3D${shortCode}` }).code).toBe(shortCode)
  })

  it('支持开发者工具直接传入 code', () => {
    expect(parseInviteEntry({ code: shortCode }).code).toBe(shortCode)
  })

  it('兼容 scene 中的其他参数', () => {
    expect(parseInviteEntry({ scene: `from=qr&c=${shortCode}` }).code).toBe(shortCode)
  })

  it('安全处理异常编码', () => {
    expect(parseInviteEntry({ scene: 'c=%E0%A4%A' }).code).toBe('%E0%A4%A')
  })
})
