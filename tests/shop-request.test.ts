import { describe, expect, it } from 'vitest'

const { shopRequestDocumentId } = require('../cloudfunctions/shopApi/shop-request') as {
  shopRequestDocumentId: (groupId: string, requestId: string) => string
}

describe('shop request id', () => {
  it('同一清单和请求生成稳定的文档 ID', () => {
    const first = shopRequestDocumentId('group-a', 'request-1')
    expect(first).toHaveLength(64)
    expect(shopRequestDocumentId('group-a', 'request-1')).toBe(first)
  })

  it('不同清单或请求不会共用文档 ID', () => {
    expect(shopRequestDocumentId('group-a', 'request-1')).not.toBe(
      shopRequestDocumentId('group-a', 'request-2'),
    )
    expect(shopRequestDocumentId('group-a', 'request-1')).not.toBe(
      shopRequestDocumentId('group-b', 'request-1'),
    )
  })
})
