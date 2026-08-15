#!/usr/bin/env node
/**
 * 一键重建并让 IDE 重新加载项目
 * 用途：图片资源更新后增量构建未触发复制，手动全量重建可避免缓存问题
 *
 * 流程：关闭 IDE 项目 → 清理旧产物 → 完整构建 → 重新打开 IDE 项目
 */

import { spawnSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { resolve, sep } from 'node:path'

const root = resolve(process.cwd())
const outputDir = resolve(root, 'dist', 'build', 'mp-weixin')
const projectDir = outputDir
const cliPath = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli'

function run(label, command, args) {
  console.log(`\n${'='.repeat(60)}\n${label}\n${'='.repeat(60)}`)
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: false,
    cwd: root,
  })
  if (result.status !== 0) {
    console.error(`[rebuild-and-reload] ${label} 失败，退出码 ${result.status}`)
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

function step1Close() {
  run('[1/4] 关闭 IDE 中的当前项目', cliPath, ['close', '--project', projectDir])
}

function step2Clean() {
  if (existsSync(outputDir)) {
    console.log(`\n[2/4] 清理旧产物：${outputDir}`)
    rmSync(outputDir, { recursive: true, force: true })
  } else {
    console.log('\n[2/4] 无需清理（dist 不存在）')
  }
}

function step3Build() {
  run('[3/4] 重新编译', 'npm', ['run', 'build:mp-weixin'])
  const appJson = resolve(outputDir, 'app.json')
  const projectConfig = resolve(outputDir, 'project.config.json')
  if (!existsSync(appJson) || !existsSync(projectConfig)) {
    console.error('[rebuild-and-reload] 构建产物不完整，拒绝重新打开 IDE')
    process.exit(1)
  }
}

function step4Open() {
  run('[4/4] 重新打开 IDE 项目', cliPath, ['open', '--project', projectDir])
  console.log('\n✅ 全部完成！')
  console.log('   - IDE 项目已在清理前关闭')
  console.log('   - 完整产物已重新生成并校验')
  console.log('   - IDE 已重新打开，无需再手动编译')
}

validatePaths()
step1Close()
step2Clean()
step3Build()
step4Open()
