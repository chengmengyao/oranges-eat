const BRACKET_SPLIT_RE = /[（(]/
const SUFFIX_STRIP_RE = /(?:市|地区|盟|自治州)$/

function normalizeCityName(value) {
  const raw = typeof value === 'string' ? value.replace(/\s+/g, '').trim() : ''
  const main = raw.split(BRACKET_SPLIT_RE)[0]
  return main.replace(SUFFIX_STRIP_RE, '')
}

function cityCodeFromName(value) {
  const normalized = normalizeCityName(value)
  return normalized.length >= 2 ? normalized : ''
}

function cityDisplayName(value) {
  const raw = typeof value === 'string' ? value.replace(/\s+/g, '').trim() : ''
  const main = raw.split(BRACKET_SPLIT_RE)[0]
  if (main.startsWith('香港特别行政区')) return '香港'
  if (main.startsWith('澳门特别行政区')) return '澳门'
  return main.replace(/(?:市|地区|盟)$/, '')
}

function cityIdentity(folder) {
  if (!folder) return null
  const cityCode = cityCodeFromName(folder.cityCode || folder.cityName || folder.name)
  if (!cityCode) return null
  return {
    cityCode,
    cityName: cityDisplayName(folder.cityName || folder.name) || cityCode,
  }
}

module.exports = { normalizeCityName, cityCodeFromName, cityDisplayName, cityIdentity }
