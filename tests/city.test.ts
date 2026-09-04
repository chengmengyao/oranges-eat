import { describe, expect, it } from 'vitest'
import {
  cityFolderLabel,
  extractCityName,
  matchCityFolder,
  normalizeCityName,
} from '@/utils/city'

describe('extractCityName', () => {
  it('普通地级市', () => {
    expect(extractCityName('广东省深圳市南山区科技园路1号')).toBe('深圳市')
    expect(extractCityName('四川省成都市武侯区天府大道')).toBe('成都市')
  })

  it('直辖市', () => {
    expect(extractCityName('北京市东城区东直门')).toBe('北京市')
    expect(extractCityName('上海市浦东新区陆家嘴')).toBe('上海市')
  })

  it('自治区下的地级市', () => {
    expect(extractCityName('内蒙古自治区呼和浩特市赛罕区')).toBe('呼和浩特市')
    expect(extractCityName('广西壮族自治区南宁市青秀区')).toBe('南宁市')
  })

  it('自治州/地区/盟', () => {
    expect(extractCityName('新疆维吾尔自治区昌吉回族自治州昌吉市')).toBe('昌吉回族自治州')
    expect(extractCityName('内蒙古自治区阿拉善盟额济纳旗')).toBe('阿拉善盟')
    expect(extractCityName('黑龙江省大兴安岭地区漠河市')).toBe('大兴安岭地区')
  })

  it('香港澳门特别行政区', () => {
    expect(extractCityName('香港特别行政区九龙城区')).toBe('香港')
    expect(extractCityName('澳门特别行政区花地玛堂区')).toBe('澳门')
  })

  it('无法识别时返回 null', () => {
    expect(extractCityName('')).toBeNull()
    expect(extractCityName('某知名餐厅三楼')).toBeNull()
    expect(extractCityName(null)).toBeNull()
  })
})

describe('cityFolderLabel', () => {
  it('去除市尾缀作为子清单名', () => {
    expect(cityFolderLabel('成都市')).toBe('成都')
    expect(cityFolderLabel('北京市')).toBe('北京')
    expect(cityFolderLabel('深圳市')).toBe('深圳')
  })

  it('保留自治州等完整名称', () => {
    expect(cityFolderLabel('昌吉回族自治州')).toBe('昌吉回族自治州')
  })

  it('特别行政区', () => {
    expect(cityFolderLabel('香港特别行政区')).toBe('香港')
    expect(cityFolderLabel('澳门特别行政区')).toBe('澳门')
  })
})

describe('normalizeCityName', () => {
  it('去掉市后缀与括号备注', () => {
    expect(normalizeCityName('成都')).toBe('成都')
    expect(normalizeCityName('成都市')).toBe('成都')
    expect(normalizeCityName('成都（2024 出差）')).toBe('成都')
    expect(normalizeCityName('北京(探亲)')).toBe('北京')
  })
})

describe('matchCityFolder', () => {
  const folders = [
    { id: 'a', name: '成都' },
    { id: 'b', name: '北京市' },
    { id: 'c', name: '阿拉善盟' },
    { id: 'd', name: '深圳（出差）' },
  ]

  it('带后缀城市匹配到去后缀子清单', () => {
    expect(matchCityFolder(folders, '成都市')?.id).toBe('a')
    expect(matchCityFolder(folders, '阿拉善盟')?.id).toBe('c')
  })

  it('忽略括号备注', () => {
    expect(matchCityFolder(folders, '深圳市')?.id).toBe('d')
  })

  it('城市名匹配到带市后缀子清单', () => {
    expect(matchCityFolder(folders, '北京市')?.id).toBe('b')
  })

  it('城市子清单没有时返回 null', () => {
    expect(matchCityFolder(folders, '广州市')).toBeNull()
    expect(matchCityFolder(folders, '乌鲁木齐市')).toBeNull()
  })

  it('空输入返回 null', () => {
    expect(matchCityFolder(folders, '')).toBeNull()
    expect(matchCityFolder([], '成都市')).toBeNull()
  })
})
