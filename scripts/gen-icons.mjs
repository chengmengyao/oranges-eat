import { mkdir } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')

const TAB_BAR_SIZE = 81

// 底部导航：透明底 emoji 图标
const tabbarEmojis = [
  ['🗺️', 'src/static/tabbar/map.png'],
  ['🔍', 'src/static/tabbar/food.png'],
  ['👥', 'src/static/tabbar/manage.png'],
]

// 地图标记点：白底圆形 + 分类 emoji（参考 HTML 的 pin-icon 风格）
const MARKER_EMOJI_SIZE = 72
const emojiScript = path.join(root, 'scripts', 'render-emoji.swift')
const markerEmojis = [
  ['🍝', 'src/static/markers/restaurant.png'],
  ['🍪', 'src/static/markers/cake.png'],
  ['🍸', 'src/static/markers/milktea.png'],
  ['🎡', 'src/static/markers/spot.png'],
]

function renderMarkerEmoji(emoji, output, circle = true, size = MARKER_EMOJI_SIZE) {
  const dest = path.join(root, output)
  mkdir(path.dirname(dest), { recursive: true })
  execFileSync('swift', [emojiScript, emoji, String(size), dest, circle ? '1' : ''], { stdio: 'inherit' })
  console.log(`generated ${output} (emoji ${emoji}${circle ? ' circle' : ''})`)
}

for (const [emoji, dest] of tabbarEmojis) {
  renderMarkerEmoji(emoji, dest, false, TAB_BAR_SIZE)
}
for (const [emoji, dest] of markerEmojis) {
  renderMarkerEmoji(emoji, dest, true)
}
console.log('done')
