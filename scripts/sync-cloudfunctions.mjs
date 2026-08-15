import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const distDir = join(root, 'dist', 'build', 'mp-weixin')
const srcDir = join(root, 'cloudfunctions')
const targetDir = join(distDir, 'cloudfunctions')

if (!existsSync(distDir)) {
  console.log('[sync-cloudfunctions] dist 目录不存在，跳过')
  process.exit(0)
}

mkdirSync(targetDir, { recursive: true })

const functions = ['groupApi', 'shopApi']
for (const fn of functions) {
  const src = join(srcDir, fn)
  const dst = join(targetDir, fn)
  if (!existsSync(src)) continue
  cpSync(src, dst, {
    recursive: true,
    filter: (s) => !s.includes(`${fn}${join('', 'node_modules')}`) && !s.includes('node_modules'),
  })
  console.log(`[sync-cloudfunctions] 已同步 ${fn}`)
}

const projectConfigPath = join(distDir, 'project.config.json')
if (existsSync(projectConfigPath)) {
  const cfg = JSON.parse(readFileSync(projectConfigPath, 'utf8'))
  if (!cfg.cloudfunctionRoot) {
    cfg.cloudfunctionRoot = 'cloudfunctions/'
    writeFileSync(projectConfigPath, JSON.stringify(cfg, null, 2) + '\n')
    console.log('[sync-cloudfunctions] 已补回 cloudfunctionRoot')
  }
}

const appJsonPath = join(distDir, 'app.json')
if (existsSync(appJsonPath)) {
  const appCfg = JSON.parse(readFileSync(appJsonPath, 'utf8'))
  if (appCfg.lazyCodeLoading !== 'requiredComponents') {
    appCfg.lazyCodeLoading = 'requiredComponents'
    writeFileSync(appJsonPath, JSON.stringify(appCfg, null, 2) + '\n')
    console.log('[sync-cloudfunctions] 已注入 lazyCodeLoading=requiredComponents')
  }
}
