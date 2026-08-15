const SHOP_CATEGORIES = ['restaurant', 'cake', 'milktea']

const MAX_NAME_LENGTH = 40
const MAX_ADDRESS_LENGTH = 120
const MAX_REMARK_LENGTH = 200

function ok(data) {
  return { ok: true, data }
}

function fail(error, code = 'INVALID_PARAM') {
  return { ok: false, error, code }
}

function normalizeText(value, maxLen) {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLen)
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function validateShopInput(event = {}) {
  const name = normalizeText(event.name, MAX_NAME_LENGTH)
  if (!name) return fail('请输入店铺名称')

  const category = normalizeText(event.category, 20)
  if (!SHOP_CATEGORIES.includes(category)) {
    return fail('请选择有效的店铺分类')
  }

  const address = normalizeText(event.address, MAX_ADDRESS_LENGTH)
  if (!address) return fail('请在地图上选点以获取地址')

  const latitude = event.latitude
  const longitude = event.longitude
  if (
    !isFiniteNumber(latitude) ||
    !isFiniteNumber(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return fail('所选位置坐标无效')
  }

  const remark = normalizeText(event.remark, MAX_REMARK_LENGTH)
  return ok({ name, category, address, latitude, longitude, remark })
}

module.exports = {
  SHOP_CATEGORIES,
  validateShopInput,
}
