# 🍊 橙子吃吃 · 共享美食地图

A shared food map WeChat Mini Program — friends co-maintain a favorite-restaurant list by forwarding invite links and scanning mini-program codes.

朋友共同维护的共享美食地图微信小程序：创建者建立共享清单，通过微信转发邀请链接或小程序码邀请朋友加入，成员共同添加想吃或喜欢的店；拿到公开清单链接的访客可只读浏览全部店铺，无需加入。

## ✨ 特性

- **共享美食清单**：创建者建清单，微信一键分享邀请朋友加入，成员共同维护店铺
- **城市子清单**：整体清单下按城市分组，支持新建 / 改名 / 删除，未分类店铺一键归类
- **邀请加入**：邀请链接 + 小程序码双通道（7 天有效、默认 50 次），扫码自动解析，访客加入前可预览，加入后自动进入该清单
- **移动店铺**：编辑店铺时跨清单 + 目标城市一键搬家，店铺与添加人署名完整保留
- **店铺归城**：添加 / 编辑店铺时可选择已有城市或当场新建城市
- **地图筛选与弹窗**：地图页按清单 + 城市两级筛选，点击 marker 弹出底部详情卡（分类 / 地址 / 备注 / 直线距离 / 导航 / 添加人），加载失败显示错误与重试
- **访客只读**：公开链接无需加入即可浏览全部店铺，最近访问的公开清单自动记忆
- **清单合并**：多个旧清单一键合并，按城市自动归类
- **成员管理**：成员可修改自己的显示名称，改名后该成员的历史店铺署名同步更新；创建者可移除成员
- **新加店铺高亮**：添加成功后地图上对应 marker 短暂放大提示
- **全局加载**：首次进入地图全屏加载层，浮层打开时自动隐藏 tabBar
- **安全权限**：业务统一经云函数鉴权访问，小程序端禁止直连数据库，邀请只存摘要

## 🛠 技术栈

- **框架**：uni-app（Vue 3 + TypeScript + Vite），模板 `dcloudio/uni-preset-vue#vite-ts`
- **UI**：Wot UI v2.3.2（npm 精确锁定，`package-lock.json` 已提交）
- **后端**：微信云开发（云函数 + 云数据库），`groups` / `members` / `invites` / `shops` / `folders` 五个集合仅管理端可读写
- **测试**：Vitest 单元测试，与云函数共用 `cloudfunctions/shared` 纯逻辑
- **主题**：SCSS 入口 `src/styles/theme.scss`（Pink Topaz 配色）

## 📂 目录结构

```
cloudfunctions/
├── shared/          # 与单元测试共用的权限/邀请/DTO 纯逻辑
├── groupApi/        # 清单、成员、邀请、城市子清单与分享鉴权
└── shopApi/         # 共享店铺查询、CRUD 鉴权与跨清单移动
src/
├── config/env.ts    # 从 Vite 环境变量读取云环境 ID
├── components/      # 全局 loading、清单/城市选择弹窗（group-city-picker）
├── pages/
│   ├── index/       # 地图页（清单/城市筛选、详情弹窗）
│   ├── food/        # 美食列表与编辑页（支持移动店铺）
│   ├── manage/      # 管理 Tab（清单/邀请/成员/城市子清单/合并）
│   └── invite/      # 微信分享邀请落地页（预览/加入）
├── services/        # 云函数调用唯一入口（页面禁止直连 db）
├── stores/          # 当前清单、城市子清单、最近访问、新加店铺高亮状态
├── utils/           # geo / cloud / location / marker / map-group / invite-entry ...
└── types/           # group / shop 数据契约
tests/               # Vitest 单元测试
scripts/             # gen-icons / gen-invite-png / rebuild-and-reload ...
```

## 🚀 本地开发

```bash
npm install
npm run dev:mp-weixin       # 开发构建
npm run gen:icons           # 重新生成 tabBar / marker PNG（可重复执行）
npm run type-check          # 零 TypeScript 错误
npm run test                # 运行单元测试
npm run build:mp-weixin     # 生产构建，并为「上传所有文件」安装本地云函数依赖
```

用「微信开发者工具」导入 `dist/build/mp-weixin` 即可运行。

### 一键重建

图片资源更新后增量构建可能漏复制文件，提供全量重建脚本：

```bash
npm run rebuild:mp-weixin   # 清理旧产物 + 全量构建
npm run rebuild:reload      # 重建后自动关闭并重新打开微信开发者工具（依赖本机开发者工具 CLI）
```

## 📦 构建产物

`npm run build:mp-weixin` 后，`dist/build/mp-weixin/cloudfunctions/groupApi` 和 `shopApi` 均已包含生产环境 `node_modules`。在微信开发者工具中分别右键两个函数，选择**上传所有文件**，不应再出现 `wx-server-sdk` 未安装提示。

若希望保持构建产物精简，改用 `npm run build:mp-weixin:cloud-install`，部署时选择**上传并部署：云端安装依赖（不上传 node_modules）**。两种模式不要混用。

## 🗄 数据库

五个集合全部设为**仅管理端可读写**（禁止小程序端直接读写）：

| 集合 | 索引 | 说明 |
| --- | --- | --- |
| `groups` | `publicId` 唯一 | 共享清单 |
| `members` | `groupId` + `userOpenId` 唯一（`_id` = sha256 摘要） | 成员关系 |
| `invites` | `tokenHash` 唯一 | 邀请记录（只存摘要，含 `shortCode` 扫码入口） |
| `shops` | `groupId` + `updatedAt` | 店铺（含 `folderId` 城市归属） |
| `folders` | `groupId` + `sortOrder` | 城市子清单（整体清单下按城市分组） |

完整索引清单与建库说明见 [cloudfunctions/数据库索引说明.md](./cloudfunctions/数据库索引说明.md)。

> 店铺新增采用 `requestId` 确定性幂等（同一请求重复提交只落一条数据）；成员改名时通过 `createdByOpenId` 索引同步更新本人历史店铺的署名。

## ⚙️ 配置

1. `src/manifest.json` → `mp-weixin.appid` 填入正式 AppID。
2. 生产构建从 `.env.production` 读取正式云环境 ID；开发调试先将 `.env.example` 复制为 `.env.development.local`，再填写独立的开发云环境 ID。`.env.development` 默认留空，防止调试数据误写入生产环境。
3. 微信后台申请 `getLocation`、`chooseLocation` 接口权限。
4. 配置「用户隐私保护指引」，说明位置信息用于显示当前位置、计算直线距离和地图选点。

## ✅ 验收步骤（三账号）

- A：创建清单 → 生成邀请（链接 + 小程序码）→ 新建城市子清单并归类店铺 → 分享到微信聊天
- B：打开卡片 → 预览清单 → 确认加入 → 添加店铺 → 将店铺移动到目标城市 / 目标清单
- C：不加入，只能看到全部店铺，无任何写入口

体验版只能分享给已配置的体验成员；正式发给普通朋友需完成审核发布。
