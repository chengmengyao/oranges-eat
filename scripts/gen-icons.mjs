import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const root = path.resolve(import.meta.dirname, '..')

const TAB_BAR_SIZE = 81
const MARKER_SIZE = 72

const tabbarSources = [
  ['svg/地图.svg', 'src/static/tabbar/map.png'],
  ['svg/美食.svg', 'src/static/tabbar/food.png'],
  ['svg/管理.svg', 'src/static/tabbar/manage.png'],
]

const markerSources = [
  ['svg/肉食.svg', 'src/static/markers/restaurant.png'],
  ['svg/甜甜圈.svg', 'src/static/markers/cake.png'],
  ['svg/奶茶.svg', 'src/static/markers/milktea.png'],
]

async function render(input, output, size) {
  await mkdir(path.dirname(path.join(root, output)), { recursive: true })
  await sharp(path.join(root, input))
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(path.join(root, output))
  console.log(`generated ${output} (${size}x${size})`)
}

for (const [src, dest] of tabbarSources) {
  await render(src, dest, TAB_BAR_SIZE)
}
for (const [src, dest] of markerSources) {
  await render(src, dest, MARKER_SIZE)
}
console.log('done')
