export interface CityFolderLike {
  id: string
  name: string
}

interface SuffixMatch {
  index: number
  length: number
}

const REGION_SUFFIX_TOKENS = ['市', '自治州', '地区', '盟'] as const

const PROVINCE_STRIP_RE = /^[\u4e00-\u9fa5]{1,12}?(?:省|自治区)/
const BRACKET_SPLIT_RE = /[（(]/
const SUFFIX_STRIP_RE = /(?:市|地区|盟|自治州)$/

function firstRegionSuffixAt(value: string): SuffixMatch | null {
  let best: SuffixMatch | null = null
  for (const token of REGION_SUFFIX_TOKENS) {
    const index = value.indexOf(token)
    if (index === -1) continue
    if (!best || index < best.index || (index === best.index && token.length > best.length)) {
      best = { index, length: token.length }
    }
  }
  return best
}

/**
 * 从微信选点返回的行政区划地址中提取地级城市名（含后缀，如「成都市」「昌吉回族自治州」）。
 * 无法可靠识别时返回 null，调用方不要自动创建城市。
 */
export function extractCityName(address: string | null | undefined): string | null {
  const raw = (address ?? '').replace(/\s+/g, '').trim()
  if (!raw) return null
  if (raw.startsWith('香港特别行政区')) return '香港'
  if (raw.startsWith('澳门特别行政区')) return '澳门'
  const withoutProvince = raw.replace(PROVINCE_STRIP_RE, '')
  const match = firstRegionSuffixAt(withoutProvince)
  if (!match || match.index <= 0) return null
  const city = withoutProvince.slice(0, match.index + match.length)
  if (city.length < 2) return null
  return city
}

/**
 * 城市子清单的展示/新建名：去掉「市/地区/盟」尾缀，自治州等保留完整写法。
 */
export function cityFolderLabel(cityName: string): string {
  const raw = (cityName ?? '').replace(/\s+/g, '').trim()
  if (!raw) return ''
  if (raw.startsWith('香港特别行政区')) return '香港'
  if (raw.startsWith('澳门特别行政区')) return '澳门'
  return raw.replace(/(?:市|地区|盟)$/, '')
}

/**
 * 归一化城市文本用于相互比对：去空白、忽略括号备注、去掉行政区尾缀。
 */
export function normalizeCityName(value: string): string {
  const raw = (value ?? '').replace(/\s+/g, '').trim()
  const main = raw.split(BRACKET_SPLIT_RE)[0]
  return main.replace(SUFFIX_STRIP_RE, '')
}

/**
 * 在城市子清单中寻找与给定城市匹配的一项：名称精确一致或互为简称包含，忽略括号备注。
 * 找不到返回 null。
 */
export function matchCityFolder<T extends CityFolderLike>(
  folders: T[],
  cityName: string,
): T | null {
  const cityKey = normalizeCityName(cityName)
  if (!cityKey || cityKey.length < 2) return null
  let best: { score: number; item: T } | null = null
  for (const folder of folders) {
    const folderKey = normalizeCityName(folder.name)
    if (!folderKey || folderKey.length < 2) continue
    let score = 0
    if (folderKey === cityKey) {
      score = 3
    } else if (cityKey.includes(folderKey) || folderKey.includes(cityKey)) {
      score = 1
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { score, item: folder }
    }
  }
  return best ? best.item : null
}
