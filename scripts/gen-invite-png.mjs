import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const root = path.resolve(import.meta.dirname, '..')

const sources = [
  {
    name: 'hero',
    size: 240,
    svg: `<svg width="120" height="120" viewBox="0 0 120 120" fill="none">
      <circle cx="60" cy="60" r="52" fill="#f5f5f5" stroke="#e8e8e8" stroke-width="1"/>
      <path d="M60 28c-13.8 0-25 11.2-25 25 0 18.75 25 39 25 39s25-20.25 25-39c0-13.8-11.2-25-25-25z" fill="#1a1a1a"/>
      <path d="M60 42l3.09 6.26 6.91 1-5 4.87 1.18 6.87L60 57.77l-6.18 3.23 1.18-6.87-5-4.87 6.91-1L60 42z" fill="#fff"/>
      <path d="M28 38l2 2-2 2-2-2 2-2z" fill="#bbb"/>
      <path d="M92 34l2 2-2 2-2-2 2-2z" fill="#bbb"/>
      <circle cx="26" cy="52" r="2" fill="#ddd"/>
      <circle cx="94" cy="48" r="2" fill="#ddd"/>
    </svg>`,
  },
  {
    name: 'avatar-person',
    size: 48,
    svg: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8" r="4" fill="white" fill-opacity="0.9"/>
      <path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8" stroke="white" stroke-width="2" stroke-linecap="round" fill="none"/>
    </svg>`,
  },
  {
    name: 'food-stack',
    size: 80,
    svg: `<svg width="40" height="40" viewBox="0 0 40 40" fill="none">
      <ellipse cx="20" cy="14" rx="14" ry="5" fill="#d4a574"/>
      <rect x="6" y="16" width="28" height="3" rx="1.5" fill="#e85d75"/>
      <rect x="6" y="20" width="28" height="2" rx="1" fill="#4caf50"/>
      <rect x="6" y="23" width="28" height="3" rx="1.5" fill="#f5a623"/>
      <ellipse cx="20" cy="28" rx="14" ry="5" fill="#d4a574"/>
      <ellipse cx="20" cy="28" rx="14" ry="2" fill="#b8956a"/>
    </svg>`,
  },
  {
    name: 'user-white',
    size: 36,
    svg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>`,
  },
]

for (const { name, size, svg } of sources) {
  const output = path.join(root, 'src/static/invite', `${name}.png`)
  await mkdir(path.dirname(output), { recursive: true })
  await sharp(Buffer.from(svg))
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(output)
  console.log(`generated ${output} (${size}x${size})`)
}
console.log('done')
