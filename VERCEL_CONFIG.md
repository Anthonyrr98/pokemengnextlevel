# Vercel 项目配置详细指南

本文说明如何在 Vercel 里为 AicanGo 项目做完整配置（前后端同站）。

---

## 一、导入项目

1. 打开 [Vercel](https://vercel.com)，用 GitHub 登录。
2. 点击右上角 **「Add New…」** → **「Project」**。
3. 在 **Import Git Repository** 里选择你的 **AicanGo** 仓库（若未列出，先点 **Configure** 授权对应 GitHub 账号/组织）。
4. 点击该仓库右侧 **「Import」**。

---

## 二、项目设置（第一次导入时）

导入后会出现 **Configure Project** 页面，按下面填写即可。

### 2.1 基本信息

| 项 | 建议值 | 说明 |
|----|--------|------|
| **Project Name** | `aicango` 或自定义 | 会变成域名的一部分，如 `aicango.vercel.app` |
| **Framework Preset** | **Vite** | 若未自动识别，手动选 Vite |
| **Root Directory** | **留空**（`.`） | 使用仓库根目录，不要选 `backend` |
| **Build Command** | `npm run build` | 一般会自动填好 |
| **Output Directory** | `dist` | 一般会自动填好 |
| **Install Command** | `npm install && (cd backend && npm install)` | 必须包含后端安装，否则 API 会报错 |

### 2.2 环境变量（先不填）

这一步可以先点 **「Deploy」** 跳过，部署失败没关系；配置好环境变量后再 **Redeploy** 即可。  
也可以在这里就按下一节提前填好环境变量再 Deploy。

---

## 三、环境变量配置（必做）

部署前或首次部署失败后，到项目里补全环境变量。

### 3.1 进入环境变量页面

1. 在 Vercel 打开你的 **AicanGo 项目**。
2. 顶部点 **「Settings」**。
3. 左侧点 **「Environment Variables」**。

### 3.2 需要填的变量

按下面逐个添加（Name 必须一致，Value 按你的实际情况填）。

---

#### 1）`DATABASE_URL`（必填，后端用）

- **Name**：`DATABASE_URL`
- **Value**：MySQL 连接字符串，格式：
  ```text
  mysql://用户名:密码@主机:端口/数据库名
  ```
  示例：
  ```text
  mysql://user:your_password@mysql.example.com:3306/aicango
  ```
- **Environment**：三个都勾选（Production / Preview / Development）。
- **说明**：数据库必须支持**外网连接**（Vercel 服务器在国外），例如：
  - [PlanetScale](https://planetscale.com)（有免费额度）
  - [Railway](https://railway.app) 的 MySQL
  - 自建 MySQL 需开放外网并放行 Vercel IP（不推荐新手）

---

#### 2）`VITE_BACKEND_URL`（必填，前端用）

- **Name**：`VITE_BACKEND_URL`
- **Value**：你的 **Vercel 项目访问地址**，不要带路径、不要末尾斜杠。
  - 第一次部署前不知道域名时，可先填：`https://你的项目名.vercel.app`
  - 部署完成后，在 **Settings → Domains** 里可以看到正式域名，再回来改成正式域名即可。
  示例：
  ```text
  https://aicango.vercel.app
  ```
- **Environment**：三个都勾选。
- **说明**：前端会请求 `VITE_BACKEND_URL + '/api/xxx'`，例如 `https://aicango.vercel.app/api/health`、`/api/auth/register` 等，所以这里必须是你 Vercel 项目的根 URL。

---

#### 3）`ADMIN_USERNAME`（可选，后端用）

- **Name**：`ADMIN_USERNAME`
- **Value**：你希望作为管理员的用户名，例如：`admin`
- **Environment**：按需勾选（一般勾 Production 即可）。

---

#### 4）`ADMIN_PASSWORD`（可选，后端用）

- **Name**：`ADMIN_PASSWORD`
- **Value**：该管理员账号的密码（强密码）。
- **Environment**：与 `ADMIN_USERNAME` 一致。

说明：若同时设置了 `ADMIN_USERNAME` 和 `ADMIN_PASSWORD`，后端在冷启动时会尝试创建或更新该用户为管理员。

---

#### 5）`ALLOWED_ORIGINS`（可选，后端用）

- **Name**：`ALLOWED_ORIGINS`
- **Value**：允许跨域的来源，多个用英文逗号分隔，例如：
  ```text
  https://aicango.vercel.app,https://www.你的自定义域名.com
  ```
- **Environment**：按需勾选。
- **说明**：不填时后端默认允许所有来源（`*`）；生产环境建议只填你的前端域名，提高安全性。

---

### 3.3 在界面里怎么填（示意）

在 **Environment Variables** 页面：

1. **Key** 输入变量名（如 `DATABASE_URL`）。
2. **Value** 输入对应的值（粘贴时注意不要多空格或换行）。
3. 选择 **Production / Preview / Development**（一般全选）。
4. 点击 **「Save」**。
5. 重复以上步骤，把上面列出的变量都加完。

添加完成后，列表里应能看到至少：`DATABASE_URL`、`VITE_BACKEND_URL`，以及你需要的可选变量。

---

## 四、确认构建配置（与 vercel.json 一致）

项目根目录的 `vercel.json` 已包含推荐配置，通常无需在网页里再改一遍。可对照检查：

- **Build Command**：`npm run build`
- **Output Directory**：`dist`
- **Install Command**：`npm install && (cd backend && npm install)`

若在 **Settings → General** 里改了 **Build & Development Settings**，请保证和上面一致，尤其是 **Install Command** 必须安装后端依赖。

---

## 五、部署与重新部署

1. **首次部署**：在 **Configure Project** 时点 **「Deploy」**，或配置好环境变量后到 **Deployments** 里点 **「Redeploy」**。
2. **修改环境变量后**：  
   - 进入 **Deployments**，在最新一次部署右侧点 **「⋯」** → **「Redeploy」**，  
   - 或推送一次新 commit 触发自动部署。  

环境变量只有在**重新构建**时才会被注入，所以改完变量一定要 Redeploy。

---

## 六、部署完成后要做的

### 6.1 确认域名

- 打开 **Settings → Domains**，看 **Production** 的域名，例如：`aicango.vercel.app`。
- 若你之前 `VITE_BACKEND_URL` 填的是「项目名.vercel.app」且和这里一致，则无需修改；若不一致，把 `VITE_BACKEND_URL` 改成这里显示的域名，保存后再 **Redeploy** 一次。

### 6.2 初始化数据库表

后端依赖 MySQL 里已有的表（如 `User`、`GameSave` 等）。若数据库是新建的，需要先执行 Prisma 迁移或 push：

- 在**本机**（已安装 Node、可连到该数据库）执行：
  ```bash
  cd backend
  # 在 backend/.env 里配置同一份 DATABASE_URL
  npx prisma db push
  ```
- 或使用 Prisma Studio / 其他工具连接该数据库，确认表结构已存在。

### 6.3 验证接口

在浏览器或 Postman 访问：

- 健康检查：`https://你的域名.vercel.app/api/health`  
  正常应返回类似：`{"status":"ok","database":"connected"}`

若返回 503 或 database 错误，多半是 `DATABASE_URL` 未填、填错或数据库未放行 Vercel 访问。

---

## 七、环境变量速查表

| 变量名 | 必填 | 用途 | 示例 |
|--------|------|------|------|
| `DATABASE_URL` | 是 | 后端连接 MySQL | `mysql://user:pass@host:3306/aicango` |
| `VITE_BACKEND_URL` | 是 | 前端请求 API 的根地址 | `https://aicango.vercel.app` |
| `ADMIN_USERNAME` | 否 | 管理员账号名 | `admin` |
| `ADMIN_PASSWORD` | 否 | 管理员密码 | （强密码） |
| `ALLOWED_ORIGINS` | 否 | CORS 允许的来源 | `https://aicango.vercel.app` |

---

## 八、常见问题

**Q：改完环境变量后页面还是旧的？**  
A：到 **Deployments** 里对最新部署点 **Redeploy**，等构建完成再访问。

**Q：访问 `/api/health` 报 404？**  
A：确认项目根目录有 `api/[[...path]].js`，且 **Install Command** 包含 `cd backend && npm install`，然后 Redeploy。

**Q：返回 503 / Database not configured？**  
A：在 **Settings → Environment Variables** 检查 `DATABASE_URL` 是否填对、是否勾选了对应环境（Production/Preview），并 Redeploy。

**Q：前端显示“无法连接到后端”？**  
A：检查 `VITE_BACKEND_URL` 是否等于当前访问的域名（如 `https://xxx.vercel.app`），且没有多写 `/api` 或路径。

---

## 九、在 Vercel 部署下重置用户密码（忘记密码）

Vercel 是 **Serverless**，没有常驻服务器，不能像在本地那样 SSH 进去执行 `node scripts/reset-password.js`。可以用下面两种方式之一。

### 方法一：在本机用同一份数据库跑脚本（推荐）

1. 在 Vercel 项目里：**Settings → Environment Variables**，找到 `DATABASE_URL`，复制其 **Value**（或点击眼睛图标查看）。
2. 在本机项目里：打开或新建 `backend/.env`，写入一行：
   ```text
   DATABASE_URL=你复制的连接串
   ```
3. 在本机终端执行（把 `用户名`、`新密码` 换成实际值）：
   ```bash
   cd backend
   node scripts/reset-password.js 用户名 新密码
   ```
4. 脚本会连到 **Vercel 用的同一个 MySQL**，把该用户的密码更新为新密码。之后用新密码在游戏里登录即可。

**注意**：本机要能访问该数据库（若数据库只允许 Vercel IP 白名单，本机可能连不上，此时用下面的方法二）。

### 方法二：调用管理员重置密码 API（无需本机连数据库）

若在 Vercel 环境变量里配置了 `ADMIN_USERNAME` 和 `ADMIN_PASSWORD`，可以用**管理员账号**调用重置接口，在任意能访问你站点的电脑上用浏览器或 curl 即可。

1. 用管理员账号先登录一次，拿到返回的 `token`（或使用下面「用管理员密码直接调 API」的方式）。
2. 调用重置密码接口：
   ```bash
   curl -X POST "https://你的域名.vercel.app/api/auth/admin/reset-password" \
     -H "Content-Type: application/json" \
     -d '{"username":"要重置的用户名","newPassword":"新密码","adminUsername":"管理员用户名","adminPassword":"管理员密码"}'
   ```
   成功会返回 `{"success":true,"message":"密码已重置"}`。
3. 该用户用**新密码**登录游戏即可。

这样不需要在 Vercel 上“执行命令”，也不需要本机连接数据库，只要能用浏览器或 curl 访问你的 Vercel 域名即可。

---

按上述步骤在 Vercel 里为该项目配置好环境变量和构建命令后，前后端会一起部署在同一域名下，前端通过 `VITE_BACKEND_URL` 访问 `/api/*` 接口。
