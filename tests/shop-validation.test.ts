import { describe, expect, it } from 'vitest'
import {
  normalizeText,
  validateCoordinate,
  validateShopForm,
  type ShopForm,
} from '@/utils/shop-validation'

function validForm(): ShopForm {
  return {
    name: '测试饭店',
    category: 'restaurant',
    latitude: 39.9,
    longitude: 116.4,
    address: '北京市朝阳区',
    remark: '',
  }
}

describe('normalizeText', () => {
  it('trim 空白', () => {
    expect(normalizeText('  ab  ', 10)).toBe('ab')
  })

  it('超长截断', () => {
    expect(normalizeText('1234567890', 5)).toBe('12345')
  })

  it('非字符串返回空', () => {
    expect(normalizeText(undefined, 5)).toBe('')
    expect(normalizeText(123 as unknown as string, 5)).toBe('')
  })
})

describe('validateCoordinate', () => {
  it('有效坐标通过', () => {
    expect(validateCoordinate(39.9, 116.4)).toBeNull()
  })

  it('非有限数值失败', () => {
    expect(validateCoordinate(NaN, 116.4)).not.toBeNull()
    expect(validateCoordinate(Infinity, 116.4)).not.toBeNull()
    expect(validateCoordinate('39.9', 116.4)).not.toBeNull()
  })

  it('越界失败', () => {
    expect(validateCoordinate(91, 116.4)).not.toBeNull()
    expect(validateCoordinate(-91, 116.4)).not.toBeNull()
    expect(validateCoordinate(39.9, 181)).not.toBeNull()
    expect(validateCoordinate(39.9, -181)).not.toBeNull()
  })
})

describe('validateShopForm', () => {
  it('合法表单通过', () => {
    expect(validateShopForm(validForm())).toBeNull()
  })

  it('名称为空失败', () => {
    const f = validForm()
    f.name = ''
    expect(validateShopForm(f)?.field).toBe('name')
  })

  it('地址为空失败', () => {
    const f = validForm()
    f.address = ''
    expect(validateShopForm(f)?.field).toBe('address')
  })

  it('未选点（坐标为空）失败', () => {
    const f = validForm()
    f.latitude = null
    f.longitude = null
    expect(validateShopForm(f)?.field).toBe('coordinate')
  })

  it('分类非法失败', () => {
    const f = validForm()
    f.category = 'hotel' as typeof f.category
    expect(validateShopForm(f)?.field).toBe('category')
  })

  it('备注超长失败', () => {
    const f = validForm()
    f.remark = 'x'.repeat(201)
    expect(validateShopForm(f)?.field).toBe('remark')
  })
})
