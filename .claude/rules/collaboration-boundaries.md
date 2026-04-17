# Development Scope & Collaboration Boundaries

本文件定义文件范围语义、开发模式选择和任务协作边界。

## File Scope Semantic Guidance

这些范围是语义指导，不是机械禁止：

- Frontend scope：
  - `frontend/**`
  - 前端相关文档与 API 调用示例
- Backend scope：
  - `src/bills_analysis/**`
  - 后端相关 `tests/*.py`
  - `README.md` 中的后端说明

需要前后端联动时，可以在同一次任务中同时修改多个范围，但应保持变更语义清晰。

## Development Modes

### Direct Mode

默认模式。

适用场景：
- 小范围、低风险修改
- 单文件或少量文件修复
- 不需要 `task_id` / workplan 跟踪
- 不需要长期并行隔离

### Worktree Mode

在以下场景推荐使用：
- 用户明确要求使用 `worktree`
- 需要 `task_id` / `plan_id` 跟踪
- 多任务并行，需隔离上下文或依赖
- 任务周期较长，需分阶段记录证据
- 合并前需要独立 regression gate

## Worktree Lifecycle

只有在选择 `worktree` 模式时，才遵循以下流程：

1. 在 `plans/todo_current.md` 中确认 task，并绑定 plan。
2. 创建分支与 worktree：`feat/<task_id>-<slug>` / `../wt-<task_id>`。
3. 使用 `planning-with-files` 落盘计划。
4. 在 worktree 中实现与验证。
5. 合并前同步 trunk 最新变更。
6. 通过回归测试后再 merge 并清理 worktree。

## Commit Conventions

以下约定主要适用于 tracked task / worktree 模式：

- 分支命名：`feat/<task_id>-<slug>`
- Commit 前缀：`<task_id>: <描述>`
- 单个 commit 允许同时包含前后端改动，但应围绕同一 task 且保持原子性

## Safety Guardrails

无论使用哪种开发模式，以下约束始终适用：

- `v1` contract 在 M1 期间不得发生 breaking change
- `.env` 不入库，示例配置放 `.env.example`
- 阈值与业务参数统一走 `tests/config.json`
- 所有 merge 写入需保留审计日志

若使用 `worktree` 模式，merge 前还必须通过对应回归验证。
