# Findings & Decisions (20260223-TC-107)

## Requirements
- TC-107: Web UI自动化测试基线：新增Playwright E2E覆盖upload→review→merge主链路，MCP仅用于探索式手工测试，不纳入CI门禁

## Research Findings
- 当前前端只有 `vitest + testing-library`，尚未接入 Playwright/Cypress。
- 前端已存在 `upload -> manual-review` 的主流程页面与 mock client，适合先做 deterministic 的 smoke 基线。
- `v1` schema 已冻结，TC-107 不应修改后端契约字段，E2E 应以 UI 可观察结果为断言主轴。

## Technical Decisions
| Decision | Rationale |
|---|---|
| Phase-1 先覆盖 daily 链路 | daily 链路更短，减少外部依赖，便于先构建可重复执行基线。 |
| E2E 先使用 mock API 模式 | 减少本地后端/数据波动，优先保证测试稳定与可重复。 |
| 失败诊断产物使用 trace + screenshot | 能在本地快速回放失败步骤，定位成本最低。 |
| MCP 只用于探索式补充验证 | 与自动化回归职责分离，避免不可重复检查阻断交付。 |

## Issues Encountered
| Issue | Resolution |
|---|---|
| `uv run` 默认 cache 目录权限不足 | 在命令中临时设置 `UV_CACHE_DIR` 到仓库内可写路径。 |

## Resources
- plans/todo_current.md
- plans/workplans/task_plan.20260223-TC-107.md
- frontend/package.json
- frontend/src/features/upload/pages/BillUploadPage.jsx
- frontend/src/features/upload/pages/ManualReviewPage.jsx
