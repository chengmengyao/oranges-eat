# 🍊 橙子吃吃 · 共享美食地图微信小程序

朋友共同维护的共享美食地图：创建者建立一个共享清单，通过微信转发邀请朋友加入，成员都能查看并添加想吃或喜欢的店；拿到公开清单链接的访客可只读浏览全部店铺。

## 技术栈

- uni-app（Vue 3 + TypeScript + Vite），模板 `dcloudio/uni-preset-vue#vite-ts`
- Wot UI v2.3.2（npm 精确锁定，`package-lock.json` 已提交）
- 微信云开发：`groups` / `members` / `invites` / `shops` / `folders` 五个集合（仅管理端可读写），业务只经云函数访问
- SCSS 主题入口 `src/styles/theme.scss`（Pink Topaz 配色）

## 目录结构

```
cloudfunctions/
├── shared/        # 与单元测试共用的权限/邀请/DTO 纯逻辑
├── groupApi/      # 清单、成员、邀请与分享鉴权
└── shopApi/       # 共享店铺查询与 CRUD 鉴权
src/
├── config/env.ts  # 从 Vite 环境变量读取云环境 ID
├── pages/
│   ├── index/     # 地图页
│   ├── food/      # 美食列表与编辑页
│   ├── manage/    # 管理 Tab（清单/邀请/成员）
│   └── invite/    # 微信分享邀请落地页
├── services/      # 云函数调用唯一入口（页面禁止直连 db）
├── stores/        # 当前清单状态
├── utils/         # geo / cloud / location / shop-validation / marker
└── types/         # group / shop 数据契约
tests/             # Vitest 单元测试
scripts/gen-icons.mjs  # SVG → PNG 生成脚本
```

## 安装与运行

```bash
npm install
npm run gen:icons    # 重新生成 tabBar / marker PNG（可重复执行）
npm run type-check   # 零 TypeScript 错误
npm run test         # 运行单元测试
npm run build:mp-weixin   # 生产构建，并为“上传所有文件”安装本地云函数依赖
```

用「微信开发者工具」导入 `dist/build/mp-weixin` 即可运行。

## 云函数部署

默认执行 `npm run build:mp-weixin` 后，`dist/build/mp-weixin/cloudfunctions/groupApi` 和 `shopApi` 均已包含生产环境 `node_modules`。在微信开发者工具中可以分别右键两个函数，选择**上传所有文件**；不应再出现 `wx-server-sdk` 未安装提示。

如果希望保持构建产物精简，可改用 `npm run build:mp-weixin:cloud-install`，然后部署时必须选择**上传并部署：云端安装依赖（不上传 node_modules）**。两种模式不要混用。

## 数据库

四个集合全部设为**仅管理端可读写**（禁止小程序端直接读写）：

| 集合 | 索引 | 说明 |
| --- | --- | --- |
| `groups` | `publicId` 唯一 | 共享清单 |
| `members` | `groupId` + `userOpenId` 唯一（`_id` = sha256 摘要） | 成员关系 |
| `invites` | `tokenHash` 唯一 | 邀请记录（只存摘要） |
| `shops` | `groupId` + `updatedAt` | 店铺 |
| `folders` | `groupId` + `sortOrder` | 城市子清单（整体清单下按城市分组） |

## 配置

1. `src/manifest.json` → `mp-weixin.appid` 填入正式 AppID。
2. 生产构建从 `.env.production` 读取正式云环境 ID；开发调试先将 `.env.example` 复制为 `.env.development.local`，再填写独立的开发云环境 ID。`.env.development` 默认留空，防止调试数据误写入生产环境。
3. 微信后台申请 `getLocation`、`chooseLocation` 接口权限。
4. 配置「用户隐私保护指引」，说明位置信息用于显示当前位置、计算直线距离和地图选点。

## 验收步骤（三账号）

- A：创建清单 → 生成邀请 → 分享到微信聊天
- B：打开卡片 → 只读看地图 → 确认加入 → 添加店铺
- C：不加入，只能看到全部店铺，无任何写入口

体验版只能分享给已配置的体验成员；正式发给普通朋友需完成审核发布。
