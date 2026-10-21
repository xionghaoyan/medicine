# 青禾 HIS · 门诊协作系统

React + Vite + FastAPI + SQLite 构建的单机构门诊 HIS，使用虚构教学数据。前端位于 **medicinefronted**，后端位于 **medicinebackend**。原始第 4～12 课 PPT 保留作为参考。

开发前请先阅读 [HIS 开发文档](docs/HIS开发文档.md) 和各目录的 AGENTS.md。文档已经明确前后端规范、接口、数据结构、权限、事务与验收规则；后续修改按文档执行，业务规则变化先更新文档。

## 本地启动

需要 Python **3.11+**、Node.js **20.19+ 或 22.12+** 和 npm。当前工作区已安装依赖。

在项目根目录执行：

```bash
./start.sh
```

脚本自动创建缺失的虚拟环境、安装缺失依赖，启动前后端，并将日志写入 `.local/logs`。保留终端运行，按 Ctrl+C 停止本次服务。端口被其他进程占用时会报错，不会停止其他程序。

| 入口 | 地址 |
| --- | --- |
| 前端 | http://127.0.0.1:5173 |
| API 文档 | http://127.0.0.1:8000/docs |
| 健康检查 | http://127.0.0.1:8000/api/v1/health |

也可以用两个终端分别启动：

```bash
cd medicinebackend
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

```bash
cd medicinefronted
npm run dev
```

首次安装如果系统找不到合适的 Python，可使用 `PYTHON_BIN=/实际路径/python3.12 ./start.sh`。手动安装依赖的命令为后端 `python3.12 -m venv .venv`、`.venv/bin/python -m pip install -r requirements.txt`，前端 `npm ci`。

## 演示账户

以下账户的默认密码均为 **`MedDemo2026!`**。登录页的“快速体验”可填入账户和默认密码。

| 账户 | 身份 | 使用范围 |
| --- | --- | --- |
| admin | 顾清和 · 管理员 | 全部工作区、排班、药品定价、账户和机构管理 |
| doctor | 林知远 · 医生 | 本人患者、接诊、开方、处方查看 |
| cashier | 周晓宁 · 收费员 | 患者建档、挂号、收款、退费、统计 |
| pharmacist | 许文 · 药师 | 已付款处方、发药、库存和入库 |

首次启动初始化 4 个科室、6 位医生、48 位患者、12 种药品及有实际关联的门诊、处方、批次、收款和日志。排班覆盖初始化日之前 6 天、之后 7 天。之后重启保留已有数据；跨日或号源不足时，可在“医生排班”新增或调整排班。

## 完成一次门诊

1. 管理员或收费员：在“患者档案”新建患者，点击“挂号”，选择医生和时段。
2. 医生：在“医生工作站”选择本人候诊患者，填写主诉、诊断、药品数量、用量和频次，开具处方。默认 doctor 账户对应林知远。
3. 收费员：在“收费结算”核对处方，选择线下收款方式，并确认已实际收到款项。
4. 药师：在“药房发药”核对患者、药品、预留批次和有效期，确认发药。
5. 管理员：在“操作日志”搜索处方编号查看记录；“统计报表”可按日期查询和导出 CSV。

系统还提供患者历史、未开方退号、未收费处方作废、未发药退费、药品档案、批次入库、CSV 导入模板与错误行报告、库存与效期提醒、机构设置、账户启停和修改密码。页面采用暖白与深绿配色，支持窄屏导航、表格滚动、键盘弹窗和处方打印。

## 关键业务规则

- **金额使用整数分。** 处方按后端药价计算，并保存当时的名称、规格、单位和单价快照。前端不能提交自定总价。
- **收费时预留，发药时出库。** 收费不减少实际库存；发药才扣减实际库存并释放预留。重复收费、发药不会重复记账或扣库。
- **退费只支持尚未发药的处方。** 退费释放预留库存，并完成该次就诊。重新开方需要新的挂号记录。
- 批次按最早有效期优先分配。过期或停用药品禁止收费、发药；多药处方任一项不足则整笔收费回滚。
- 已有批次或处方的药品不能修改规格和单位；需要新规格时新建药品档案。CSV 按药品编码和批号去重，重复导入不增加库存。
- 挂号占用号源、生成排队号与审计同事务，最后一个号源只允许一个请求成功占用；退号不复用排队号。
- 收入按处方实际收款日期入账、退费日期冲减。挂号页面的诊查标准仅供参考，**本版本未收取挂号费，也不计入收入**。
- 后端强制检查会话、角色与医生数据归属。密码以 bcrypt 哈希保存，登录凭据放 HttpOnly cookie，退出后撤销服务端会话。

## 配置与数据

可将两个目录的 `.env.example` 复制为 `.env` 后调整配置。后端主要参数为：

| 参数 | 默认值 / 用途 |
| --- | --- |
| DATABASE_PATH | `data/his.sqlite3`，相对后端目录解析 |
| SEED_DEMO | `true`，仅在全新空库创建演示数据 |
| DEMO_PASSWORD | 首次创建演示账户时的密码；已有账户不因环境变量变化而重置 |
| JWT_SECRET | 留空时自动生成 `data/.jwt_secret`；手动指定需至少 32 字符 |
| SESSION_HOURS | 8 小时 |
| COOKIE_SECURE | 本地 HTTP 为 false；HTTPS 环境需 true |
| CORS_ORIGINS | 默认允许 localhost / 127.0.0.1 的 5173 端口 |

前端开发环境通过 Vite 将 `/api` 转发到后端，`VITE_API_PROXY_TARGET` 默认 `http://127.0.0.1:8000`，`VITE_API_BASE` 默认 `/api/v1`。前端 API 写请求携带 `X-Requested-With: his-web`；手工调用 API 也需携带该请求头和登录 cookie。

数据库迁移位于 `medicinebackend/app/migrations`，启动时按版本执行。迁移前使用 SQLite backup API 创建一致性备份，不删库重建。数据库、随机密钥、环境配置、虚拟环境、依赖和本地日志均已列入忽略规则。备份与恢复流程见开发文档 §5。

`SEED_DEMO=false` 只关闭演示初始化，不创建账户；本次版本的首次体验请保留默认 true。自定义 DEMO_PASSWORD 时，请手动输入自定义密码，登录页的快捷按钮仍填入文档默认密码。

## 验证与维护

后端：

```bash
cd medicinebackend
.venv/bin/python -m pytest
.venv/bin/python -m ruff check app tests scripts
.venv/bin/python -m ruff format --check app tests scripts
```

前端：

```bash
cd medicinefronted
npm run format:check
npm run lint
npm run build
npm run test:e2e
```

`npm run format` 统一前端格式。浏览器测试在 macOS 优先使用已安装的 Google Chrome；其他环境先执行 `npx playwright install chromium`。测试占用 **15173 / 18001**，不会重置或写入 `data/his.sqlite3`。失败截图、轨迹和 HTML 报告保存在前端 `test-results` / `playwright-report`。

2026-10-21 实际验证：**28 项后端测试、4 项浏览器测试全部通过**。后端覆盖并发号源、并发收费、价格快照、事务回滚、批次过期、退费、权限、会话、CSV 与迁移持久化。浏览器覆盖四种角色协作的完整门诊流程、10 个工作区、库存筛选、报表下载、空状态、越权拦截、退出清理、390px 窄屏与键盘焦点恢复。桌面与窄屏均已实际截图检查，一键启动脚本也已实际启动前后端。前端 Prettier / ESLint / TypeScript / Vite 检查与构建、后端 Ruff 检查全部通过。

## 当前范围

这是基于课件 A 路线实现的门诊教学系统，运行于本地单机构环境。线下支付方式仅记录结果，未接入真实微信、支付宝或银行交易；未实现医保联网、住院、LIS/PACS、电子签章和模型 API。页面中的患者、诊疗和药品数据仅为虚构演示。
