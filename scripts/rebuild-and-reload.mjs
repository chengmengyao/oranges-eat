#!/usr/bin/env node
/**
 * 一键重建并让 IDE 重新加载项目
 * 用途：图片资源更新后增量构建未触发复制，手动全量重建可避免缓存问题
 *
 * 流程：清理缓存 → 彻底退出 IDE → 清理旧产物 → 完整构建 → 重新启动 IDE 项目
 *
 * 注意：必须用 cli quit 彻底退出 IDE 而非 cli close。close 只关闭项目，
 * 编译引擎与文件监听仍存活；此时删除 dist 会触发 IDE 对空目录自动编译，
 * 出现 “simulator launch ... Cannot read property 'subPackages' of undefined”
 * 导致首次页面报编译失败，重跑才成功。quit 后目录重建期间无任何 watcher。
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'

const root = resolve(process.cwd())
const outputDir = resolve(root, 'dist', 'build', 'mp-weixin')
const projectDir = outputDir
const cliPath = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli'
const privateConfigPath = resolve(outputDir, 'project.private.config.json')
let privateConfigContent = ''

function normalizePrivateConfig(content) {
  try {
    const config = JSON.parse(content)
    const conditions = config.condition?.miniprogram?.list
    if (Array.isArray(conditions)) {
      for (const condition of conditions) {
        if (typeof condition.query !== 'string') continue
        condition.query = condition.query
          .split('&')
          .map((part) => {
            if (!part.startsWith('scene=c=')) return part
            return `scene=${encodeURIComponent(part.slice('scene='.length))}`
          })
          .join('&')
      }
    }
    return `${JSON.stringify(config, null, 2)}\n`
  } catch {
    console.warn('[rebuild-and-reload] 私有调试配置无法解析，将按原样保留')
    return content
  }
}

function run(label, command, args, { ignoreFailure = false } = {}) {
  console.log(`\n${'='.repeat(60)}\n${label}\n${'='.repeat(60)}`)
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: false,
    cwd: root,
  })
  if (result.status !== 0) {
    console.error(`[rebuild-and-reload] ${label} 失败，退出码 ${result.status}`)
    if (ignoreFailure) return
    process.exit(result.status ?? 1)
  }
}

function validatePaths() {
  const expectedParent = `${resolve(root, 'dist', 'build')}${sep}`
  if (!outputDir.startsWith(expectedParent) || outputDir === expectedParent.slice(0, -1)) {
    console.error(`[rebuild-and-reload] 拒绝清理非预期目录：${outputDir}`)
    process.exit(1)
  }
  if (!existsSync(cliPath)) {
    console.error(`[rebuild-and-reload] 未找到微信开发者工具 CLI：${cliPath}`)
    console.error('为避免 IDE 仍监听构建目录，本次不会清理或构建')
    process.exit(1)
  }
}

function ideRunning() {
  const result = spawnSync('pgrep', ['-f', '/Applications/wechatwebdevtools.app/Contents/MacOS'], {
    stdio: 'pipe',
    encoding: 'utf8',
  })
  return result.status === 0
}

function cleanIdeCache() {
  if (!ideRunning()) {
    console.log('\n[1/5] IDE 未在运行，跳过缓存清理（本次将冷启动并重建缓存）')
    return
  }
  run(
    '[1/5] 清理 IDE 编译缓存',
    cliPath,
    ['cache', '--clean', 'compile', '--project', projectDir],
    { ignoreFailure: true },
  )
  run(
    '[1/5] 清理 IDE 文件缓存',
    cliPath,
    ['cache', '--clean', 'file', '--project', projectDir],
    { ignoreFailure: true },
  )
}

function quitIde() {
  run('[2/5] 退出 IDE（若未运行则跳过）', cliPath, ['quit'], { ignoreFailure: true })
}

function waitIdeExit(timeoutMs = 10000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const result = spawnSync('pgrep', ['-f', '/Applications/wechatwebdevtools.app/Contents/MacOS'], {
      stdio: 'pipe',
      encoding: 'utf8',
    })
    if (result.status !== 0) {
      console.log('[2/5] IDE 主进程已退出')
      return
    }
    const pending = (timeoutMs - (Date.now() - started)) / 1000
    console.log(`[2/5] 等待 IDE 退出…（最多 ${pending.toFixed(1)}s）`)
    const block = spawnSync('sleep', ['0.5'])
    if (block.status !== 0) return
  }
  console.error('[rebuild-and-reload] IDE 未在预期时间内退出，为安全起见中止后续删除')
  process.exit(1)
}

function cleanOutput() {
  if (existsSync(privateConfigPath)) {
    privateConfigContent = normalizePrivateConfig(readFileSync(privateConfigPath, 'utf8'))
    console.log('[3/5] 已暂存并规范化 IDE 私有调试配置')
  }
  if (existsSync(outputDir)) {
    console.log(`\n[3/5] 清理旧产物：${outputDir}`)
    rmSync(outputDir, { recursive: true, force: true })
  } else {
    console.log('\n[3/5] 无需清理（dist 不存在）')
  }
}

function buildProject() {
  run('[4/5] 重新编译', 'npm', ['run', 'build:mp-weixin'])
  if (privateConfigContent) {
    writeFileSync(privateConfigPath, privateConfigContent)
    console.log('[4/5] 已恢复 IDE 私有调试配置')
  }
  const appJson = resolve(outputDir, 'app.json')
  const projectConfig = resolve(outputDir, 'project.config.json')
  if (!existsSync(appJson) || !existsSync(projectConfig)) {
    console.error('[rebuild-and-reload] 构建产物不完整，拒绝重新打开 IDE')
    process.exit(1)
  }
}

function openProject() {
  run('[5/5] 重新打开 IDE 项目', cliPath, ['open', '--project', projectDir])
  console.log('\n✅ 全部完成！')
  console.log('   - IDE 已在清理前完全退出')
  console.log('   - 完整产物已重新生成并校验')
  console.log('   - IDE 已重新启动并打开项目，无需再手动编译')
}

validatePaths()
cleanIdeCache()
quitIde()
waitIdeExit()
cleanOutput()
buildProject()
openProject()
