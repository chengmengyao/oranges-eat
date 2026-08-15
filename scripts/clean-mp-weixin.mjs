import { existsSync, rmSync } from 'node:fs'
import { resolve, sep } from 'node:path'

const root = resolve(process.cwd())
const outputDir = resolve(root, 'dist', 'build', 'mp-weixin')
const expectedParent = `${resolve(root, 'dist', 'build')}${sep}`

if (!outputDir.startsWith(expectedParent) || outputDir === expectedParent.slice(0, -1)) {
  throw new Error(`[clean-mp-weixin] 拒绝清理非预期目录：${outputDir}`)
}

if (existsSync(outputDir)) {
  rmSync(outputDir, { recursive: true, force: true })
  console.log('[clean-mp-weixin] 已清理旧的小程序构建产物')
}
