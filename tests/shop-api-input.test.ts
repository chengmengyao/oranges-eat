import { describe, expect, it } from 'vitest'
import { validateShopInput } from '../cloudfunctions/shopApi/shop-input'

function validInput() {
  return {
    name: '  测试饭店  ',
    category: 'restaurant',
    latitude: 39.9,
    longitude: 116.4,
    address: '  北京市朝阳区  ',
    remark: '  周末去  ',
  }
}

describe('shopApi validateShopInput', () => {
  it('合法输入返回统一成功协议及规范化数据', () => {
    expect(validateShopInput(validInput())).toEqual({
      ok: true,
      data: {
        name: '测试饭店',
        category: 'restaurant',
        latitude: 39.9,
        longitude: 116.4,
        address: '北京市朝阳区',
        remark: '周末去',
      },
    })
  })

  it('非法输入返回可被调用方识别的失败协议', () => {
    expect(validateShopInput({ ...validInput(), latitude: 91 })).toEqual({
      ok: false,
      error: '所选位置坐标无效',
      code: 'INVALID_PARAM',
    })
  })
})
