# Windows PowerShell + SSH 远端命令注意事项

本文件记录在 Windows PowerShell 中通过 `ssh` 执行 Linux 远端命令时已经踩过的坑。后续对服务器 `46.38.239.63:10022` 做热修、构建、部署时，优先按这里的规则执行。

## 核心问题

PowerShell 会先解析本地命令行，再把参数传给 `ssh`。如果远端命令里直接包含这些字符，可能会被本地 PowerShell 提前解释：

- 管道符：`|`
- 重定向：`>`, `>>`, `<`
- 花括号和格式字符串：`{{.Names}}`
- 复杂引号嵌套：`'...'`, `"..."`, `'\''`
- 正则里的括号和竖线：`(web|backend)`

典型错误表现：

- PowerShell 把远端 `grep -E 'a|b'` 当成本地管道解析。
- PowerShell 把远端命令片段当成本地命令，报 `The term 'web' is not recognized...`。
- 远端 `git diff | sed ...` 没有执行，反而本地 shell 报错。

## 推荐写法

### 1. 简单命令可以直接执行

```powershell
ssh -i $HOME\.ssh\id_sugar -p 10022 -o BatchMode=yes -o IdentitiesOnly=yes root@46.38.239.63 "cd /root/st-reforged-full && docker compose ps"
```

仅限不包含管道、复杂正则、复杂引号的命令。

### 2. 复杂远端命令用 PowerShell here-string 传给 ssh

推荐用于包含 `|`, `grep -E`, `sed`, `node <<'NODE'`, 多行脚本的场景。

```powershell
ssh -i $HOME\.ssh\id_sugar -p 10022 -o BatchMode=yes -o IdentitiesOnly=yes root@46.38.239.63 @'
set -e
cd /root/st-reforged-full
docker compose build web
docker compose up -d --no-deps web
docker ps --format '{{.Names}} {{.Status}} {{.Ports}}' | grep -E 'st-reforged-full-(web|backend|legacy-runtime)'
'@
```

这样管道和引号会作为 stdin 发给远端 shell，避免被本地 PowerShell 抢先解析。

### 3. 修改远端文件时优先备份，再用远端脚本

```powershell
ssh -i $HOME\.ssh\id_sugar -p 10022 -o BatchMode=yes -o IdentitiesOnly=yes root@46.38.239.63 @'
set -e
cd /root/st-reforged-full/source/app
stamp=$(date +%Y%m%d-%H%M%S)
cp src/views/ChatView.vue /root/st-reforged-full/backups/ChatView-$stamp.vue
node <<'NODE'
const fs = require('fs');
const path = 'src/views/ChatView.vue';
let text = fs.readFileSync(path, 'utf8');
// edit text here
fs.writeFileSync(path, text);
NODE
'@
```

注意：

- 远端脚本第一行加 `set -e`，避免中间失败后继续部署。
- 修改前备份到 `/root/st-reforged-full/backups/`。
- 对 CRLF/LF 不确定的文件，Node 脚本里不要用过于精确的整段字符串锚点；优先用换行无关的正则。

### 4. Docker 操作只碰目标服务

当前项目远端路径：

```text
/root/st-reforged-full
```

前端热修只执行：

```bash
docker compose build web
docker compose up -d --no-deps web
```

不要顺手执行全量 `docker compose up -d`，避免影响同机其他业务或本项目 backend / legacy-runtime。

## 验证清单

远端热修后至少确认：

```powershell
ssh -i $HOME\.ssh\id_sugar -p 10022 -o BatchMode=yes -o IdentitiesOnly=yes root@46.38.239.63 @'
set -e
cd /root/st-reforged-full
docker ps --format '{{.Names}} {{.Status}} {{.Ports}}' | grep -E 'st-reforged-full-(web|backend|legacy-runtime)'
'@
```

浏览器验证时，缓存参数要放在 hash 前：

```text
https://new-st.rua.chat/?v=some-fix-id#/chat
```

不要写成：

```text
https://new-st.rua.chat/#/chat?v=some-fix-id
```

后者不会刷新 `index.html` 入口资源，可能仍然加载旧 CSS/JS。

## 执行前自检

远端命令里只要出现 `|`, `grep -E`, `sed`, `awk`, `node <<`, `docker ps --format`, 多层引号，就不要直接塞进一行 PowerShell 字符串。改用 here-string 通过 stdin 传给 SSH。

