# 项目约定 · 橙子吃吃（oranges-eat2）

## 提交与同步 GitHub

- 橙子酱说「提交代码」「提交 git」「提交」时，调用 **git-flow** skill 处理。
- 本项目默认同步提交到 GitHub 远程（`github` → `git@github.com:chengmengyao/oranges-eat.git`）。
- 「同步提交 GitHub」属于本项目**长期授权**的推送操作，push 时无需再次逐次确认，但合并 PR / 修改远程分支仍按 git-flow skill 安全边界执行。
- 遵循 git-flow skill：不在 `main` 上直接提交，先建 `cmy-<type>-<description>` 功能分支，完成后合并回 `main` 并推送 GitHub。

## GitHub 网络环境（重要）

本机 SSH 22 端口被本地网络阻断，直接 `git push github` / `git fetch github` 会失败，必须走 SSH-over-HTTPS 官方端口 + 本地代理隧道（本机代理 `127.0.0.1:7897`，用系统自带的 `nc` 做 CONNECT）：

```bash
# 推送分支到 GitHub
GIT_SSH_COMMAND='ssh -o "ProxyCommand=nc -X connect -x 127.0.0.1:7897 %h %p"' \
  git push ssh://git@ssh.github.com:443/chengmengyao/oranges-eat.git <branch>

# 合并前同步远程 main 引用
GIT_SSH_COMMAND='ssh -o "ProxyCommand=nc -X connect -x 127.0.0.1:7897 %h %p"' \
  git fetch ssh://git@ssh.github.com:443/chengmengyao/oranges-eat.git main:refs/remotes/github/main
```

- 验证连接：`ssh -o "ProxyCommand=nc -X connect -x 127.0.0.1:7897 %h %p" -T -p 443 git@ssh.github.com`
- 网络代理地址如有变化，以当前环境 `env | grep -i proxy` 的实际值为准。
