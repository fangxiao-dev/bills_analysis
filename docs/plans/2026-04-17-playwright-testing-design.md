# Playwright Testing Design

## Goal

为当前应用建立一套分层的 Playwright 页面测试方案，覆盖最基础的用户工作流，并明确区分：

- 默认可执行的 `mock` / 非真实 Azure 链路测试
- 只有在用户显式声明时才允许执行的真实 Azure 联调测试

该方案优先服务两个目标：

1. 补齐“浏览器真实页面工作流”覆盖，而不仅是组件级 Vitest。
2. 保持测试执行成本可控，避免把高成本的真实 Azure 链路变成默认门禁。

## Current Context

当前仓库的测试现状：

- 后端已有 `pytest` 测试，包含 contract、规则、parity、worker、API smoke。
- 前端已有 `vitest` 测试，覆盖组件、状态、schema、client。
- 前端页面存在两个核心路由：
  - `/`：上传页
  - `/manual-review`：人工审核页
- 前端已支持两种 API mode：
  - `mock`
  - `real`

这使得 Playwright 非常适合采用“分层测试”而不是“单一路径全真联调”。

## Design Principles

### 1. Page Workflow First

Playwright 的定位不是替代现有 Vitest / pytest，而是补齐浏览器真实交互层：

- 页面路由与导航
- 上传控件与页面状态切换
- review 页表单交互
- 用户可见的 happy path 与关键阻断路径

### 2. Default Safe, Explicitly Escalated

默认执行的测试必须满足：

- 不依赖真实 Azure
- 不依赖真实外部网络副作用
- 可重复
- 可进 CI

真实 Azure 链路测试必须满足：

- 只有在用户显式声明时才运行
- 被视为高成本验证，不是默认门禁
- 失败时优先视为联调或环境问题，而不是直接阻断日常开发

### 3. Layered Confidence

测试信心从低成本到高成本逐层叠加：

1. Vitest / pytest：局部逻辑与 contract
2. Playwright mock gate：浏览器基础工作流主门禁
3. Playwright real backend smoke：真实前后端联调
4. Playwright real Azure smoke：高成本真实链路验证，仅显式触发

## Proposed Layers

## Layer A: Mock Gate

### Purpose

作为 Playwright 的主门禁，覆盖页面级基础工作流。

### Runtime

- 前端：`VITE_API_MODE=mock`
- 浏览器：Playwright Chromium
- 不启动真实后端
- 不依赖 Azure

### Coverage

#### A1. Upload Page Smoke

验证：

- 首页可打开
- 上传页核心区域可见
- 语言切换基本可用
- `daily` / `office` 模式切换可见且可操作

#### A2. Daily Happy Path

验证：

1. 进入上传页
2. 添加 `bar` PDF
3. 添加 `zbon` PDF
4. 创建 batch
5. 状态从 `queued/running` 进入 `review_ready`
6. 跳转到 manual review
7. review rows 可见
8. 选择本地 Excel merge source
9. 点击 submit
10. 状态进入 `merged` 或出现 merged 成功信号

#### A3. Office Happy Path

验证：

1. 切换到 `office`
2. receiver city / name / address 正常显示
3. 添加 office PDF
4. 创建 batch
5. 进入 review
6. office rows 可见
7. 选择 merge source
8. submit 成功

#### A4. Key Guardrails

只保留少量高价值阻断路径：

- daily 缺少 zbon 时不能走通创建
- manual review 在无 batch 时显示阻断提示

### Mock Behavior Contract

Layer A 不启动后端，所有 API 请求由 mock handler 拦截（推荐 MSW 或 Vitest 同款 fixture）：

- `POST /batches`：立即返回 `{ status: "review_ready", ... }`，测试无需轮询等待。
- `GET /batches/:id`：同样直接返回 `review_ready` 终态。
- 文件上传：dropzone 接受真实文件（来自 `e2e/fixtures/`），但 mock handler 直接丢弃内容，只返回预设响应。

`e2e/fixtures/` 存放最小测试用 PDF（每个 <100 KB），不需要真实可解析内容。

### Gate Level

- 默认每次都可以跑
- 适合作为 CI 主门禁
- 适合前端修改后的首选验证层

## Layer B: Real Backend Smoke

### Purpose

验证前端与真实本地后端的联调没有断。

### Runtime

- 前端：`VITE_API_MODE=real`
- 后端：本地 FastAPI，需以 `AZURE_MOCK=1`（或等价 flag）启动，使提取步骤走 stub 而非真实 Azure
- **前提**：后端必须支持该 stub 模式，否则 Layer B 实际等同于 Layer C（只差凭据）；若后端尚未实现此 flag，Layer B 暂时跳过，直到后端就绪

### Timeout

真实后端即使不调用 Azure 也有本地 CPU 处理，默认 30s 超时不够用。在 `playwright.config.ts` 的 `real` project 中将 `timeout` 设为 `120_000`。

### Coverage

只保留一条最小 happy path，建议优先 `daily`：

1. 前端上传真实测试 PDF
2. 创建 batch
3. 轮询到 `review_ready`
4. review rows 成功加载
5. 提交 merge source
6. merge 成功或进入预期终态

### Gate Level

- 可按需执行
- 不建议作为默认主门禁
- 可在后端接口、前端联调、上传/审核主流程改动时运行

## Layer C: Real Azure Smoke

### Purpose

验证真实 Azure Document Intelligence / Azure 相关链路在页面层仍可打通。

### Runtime

- 前端：`VITE_API_MODE=real`
- 后端：真实配置启动
- Azure：真实服务、真实凭据、真实网络环境

### Coverage

只保留一条最小真实链路，不追求广覆盖：

建议先只覆盖 `daily` 或最稳定的 `office` 单样本路径。

验证点：

1. 页面上传真实样本 PDF
2. batch 创建成功
3. 后端真实提取完成
4. 页面进入 `review_ready`
5. review rows 成功加载
6. merge 流程可完成

### Trigger Policy

该层测试只有在用户明确表达以下意图时才执行：

- “跑真实 Azure 链路”
- “做真实云联调”
- “验证线上/云端提取链路”
- 其他同义明确授权表达

未获得显式授权时，不自动运行该层测试。

### Gate Level

- 不进入默认 CI
- 不进入默认本地回归
- 仅作为显式触发的高成本 smoke

## Selector Strategy

为了让 Playwright 稳定，应优先补稳定定位，而不是依赖脆弱文案。

### Recommendation

为以下关键节点补 `data-testid`：

- 上传页主要区域
- batch type selector
- `bar` / `zbon` / `office` dropzone
- create batch button
- go review button
- manual review 页面根节点
- review table
- submit button
- merged result button
- office receiver city selector

### Why

- 当前页面有多语言切换，直接用文案会增大波动
- 页面未来可能继续调 UI 样式或德语文案
- `data-testid` 更适合做稳定门禁

## Test Grouping Proposal

建议目录：

```text
frontend/
  e2e/
    mock/
      navigation.spec.ts
      daily-happy-path.spec.ts
      office-happy-path.spec.ts
      guardrails.spec.ts
    real/
      backend-daily-smoke.spec.ts
      azure-daily-smoke.spec.ts
```

## Execution Modes

建议在 Playwright 配置中定义多个 project 或脚本入口。

### Default

- `playwright:mock`
- 用于默认执行
- 适合本地日常与 CI

### On-demand Real Backend

- `playwright:real`
- 用于前后端联调

### Explicit Azure

- `playwright:azure`
- 必须显式声明才执行
- 通过 env flag 控制：`PW_REAL_AZURE=1`
- **未设置时行为**：每个 azure smoke 文件顶部调用 `test.skip(!process.env.PW_REAL_AZURE, "需显式设置 PW_REAL_AZURE=1")`，整个文件静默跳过，不影响 CI 其他结果；绝不使用 fail-fast，避免污染主门禁

## Proposed Trigger Rules

### Always or Usually Run

以下情况优先跑 `mock` 层：

- 修改前端页面
- 修改上传/审核/merge 交互
- 修改浏览器可见状态逻辑
- 调整前端路由或表单流程

### Run On Demand

以下情况建议额外跑 `real backend smoke`：

- 修改前后端接口对接
- 修改 batch 状态流转
- 修改 upload/review/merge 的真实 API 调用链

### Run Only On Explicit Request

以下情况才跑真实 Azure：

- 用户明确要求
- 需要验证云端提取链路是否退化
- 准备做发布前高成本验证

## Minimal First Iteration

第一阶段不追求把全部页面状态搬进 Playwright，只做最小高价值集合：

1. mock upload page smoke
2. mock daily happy path
3. mock office happy path
4. mock no-batch review guardrail
5. real backend daily smoke
6. real Azure single-path smoke（显式触发）

## Trade-offs

### Why not make real Azure part of the main gate

- 成本高
- 易受环境与凭据波动影响
- 容易把“云端不稳定”误判成“前端回归”
- 会显著降低日常开发迭代速度

### Why keep real Azure at all

- mock 无法证明真实提取链路仍可用
- 页面层最终还是需要至少一条真实链路兜底
- 对“久未维护项目”的重新对齐很有价值

## Recommendation

推荐采用以下最终策略：

- `mock` 作为 Playwright 主门禁
- `real backend smoke` 作为联调层，按需执行
- `real Azure smoke` 作为显式触发的高成本验证层

这与当前仓库现状兼容，也与“既要有 Mock，也要有真实 Azure，但真实 Azure 必须显式授权”的要求一致。

## File Extension Convention

e2e 测试文件统一使用 `.spec.ts`（TypeScript），与 `frontend/src/` 下 Vitest 的 `.jsx` 分开维护，不混用。需在 `playwright.config.ts` 中指定 `testDir: './e2e'`，Vite 配置无需感知这部分。

## Next Step

如果该方案认可，下一步再进入实现计划：

0. 安装依赖：`pnpm add -D @playwright/test`，然后 `pnpm exec playwright install chromium`；在 `package.json` scripts 中补充 `playwright:mock` / `playwright:real` / `playwright:azure` 入口
1. 定义 `playwright.config.ts`，声明三个 project（mock / real / azure），real project 设 `timeout: 120_000`
2. 补 `data-testid`（按 Selector Strategy 清单逐组件添加）
3. 创建 `e2e/fixtures/` 放测试用最小 PDF
4. 实现 mock 主门禁（Layer A）
5. 实现 real backend smoke（Layer B，需后端 `AZURE_MOCK` flag 就绪后启动）
6. 最后补真实 Azure 显式触发 smoke（Layer C）
