# Task Plan: 20260223-TC-107

## Goal
建立可运行的 Web UI 自动化测试基线，优先引入 Playwright E2E 覆盖 upload -> review -> merge 主链路，MCP 仅作为探索式手工测试补充，不纳入 CI 强制门禁。

## Scope
- TC-107: Web UI自动化测试基线：新增Playwright E2E覆盖upload→review→merge主链路，MCP仅用于探索式手工测试，不纳入CI门禁
- In-scope:
  - 前端引入 Playwright 测试框架与基础配置。
  - 新增至少 1 条 daily 主链路 smoke 用例。
  - 增加本地运行命令与文档（frontend README + workplan progress）。
  - 明确 MCP 探索式测试规范（文档级），不作为 CI 阻断条件。
- Out-of-scope:
  - 不改动 `v1` API schema。
  - 不实现完整跨浏览器矩阵。
  - 不接入强制回归门禁。

## Current Phase
Phase 1

## Phases
### Phase 1: Requirements & Discovery
- [x] Confirm selected tasks and constraints
- [x] Write findings and rationale
- **Status:** completed

### Phase 2: Planning & Structure
- [x] Define implementation sequence
- [x] Confirm dependencies and risks
- **Status:** completed

### Phase 3: Implementation
- [ ] 接入 `@playwright/test` 与 `playwright.config`
- [ ] 新增 `frontend/e2e/` 的 smoke 主链路
- [ ] 更新 `frontend/package.json` E2E 命令
- [ ] 输出 MCP 探索式测试说明文档
- **Status:** in_progress

### Phase 4: Testing & Verification
- [ ] `pnpm --dir frontend test:e2e` 可本地执行
- [ ] 连续执行 smoke 至少 3 次无随机失败
- [ ] 失败时生成可诊断产物（trace/screenshot）
- **Status:** pending

### Phase 5: Delivery
- [ ] 更新 README 与 workplan 证据
- [ ] 产出人工测试检查清单并等待确认
- [ ] 通过后再进入 merge / DONE 流程
- **Status:** pending
