import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const functionsRoot = join(root, 'dist', 'build', 'mp-weixin', 'cloudfunctions')
const functions = ['groupApi', 'shopApi']

if (!existsSync(functionsRoot)) {
  throw new Error('[install-cloudfunction-deps] 云函数构建目录不存在，请先执行微信小程序构建')
}

for (const name of functions) {
  const functionDir = join(functionsRoot, name)
  const packagePath = join(functionDir, 'package.json')
  const lockPath = join(functionDir, 'package-lock.json')
  if (!existsSync(packagePath) || !existsSync(lockPath)) {
    throw new Error(`[install-cloudfunction-deps] ${name} 缺少 package.json 或 package-lock.json`)
  }

  console.log(`[install-cloudfunction-deps] 正在安装 ${name} 生产依赖`)
  execFileSync(
    'npm',
    [
      'ci',
      '--omit=dev',
      '--omit=optional',
      '--omit=peer',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
    ],
    { cwd: functionDir, stdio: 'inherit' },
  )

  const pkg = JSON.parse(readFileSync(packagePath, 'utf8'))
  for (const dependency of Object.keys(pkg.dependencies || {})) {
    const installedPackage = join(functionDir, 'node_modules', dependency, 'package.json')
    if (!existsSync(installedPackage)) {
      throw new Error(`[install-cloudfunction-deps] ${name} 依赖未安装：${dependency}`)
    }
  }
  console.log(`[install-cloudfunction-deps] ${name} 已可使用“上传所有文件”部署`)
}
