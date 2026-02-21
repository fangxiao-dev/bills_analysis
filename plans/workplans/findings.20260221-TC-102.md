# Findings & Decisions (20260221-TC-102)

## Requirements
- TC-102: 上传解析改为单文件实时状态跟踪：单文件超时/报错独立失败；取消batch级timeout；仅全失败或batch级异常才标记batch失败

## Research Findings
- 当前后端是批次级状态更新：
  - worker 开始时将全部 input 置 `processing`，结束成功后强制全部置 `extracted`，异常时全部 `failed`。
  - local backend 用 `asyncio.gather` 并发处理文件，但最终一次性写出结果。
- 现有逻辑存在两个问题：
  1. 无法逐文件实时追踪完成情况。
  2. 任意文件失败会抛异常导致整批失败，无法保留“部分成功可审核”路径。
- 前端 `FileQueuePanel` 已具备按 `batch.inputs[*].status` 显示逐文件状态的能力；缺的是后端增量落库。
- 前端 `POLL_FAILURE` 当前会把 phase 切为 `failed`，在网络抖动时会产生“假失败”。

## Technical Decisions
| Decision | Rationale |
|---|---|
| Task selection | Task scope explicitly provided by user. |
| Task selection | Selected tasks: TC-102. |
| 保持并发处理，不改串行 | 保持吞吐并减少对现有处理耗时的负面影响。 |
| 单文件完成后即时持久化 input 状态 | 满足“完成一个就更新一个”核心需求。 |
| 单文件失败不立即 fail batch | 支持部分成功结果进入 review。 |
| batch 仅在全失败/系统异常时 failed | 与用户最终口径一致，避免过度失败。 |
| 轮询失败不改 phase=failed | 减少网络问题导致的错误状态感知。 |

## Issues Encountered
| Issue | Resolution |
|---|---|
| `uv` default cache path permission denied in sandbox (`%LOCALAPPDATA%\\uv\\cache`) | Set `UV_CACHE_DIR` to worktree-local path when running tests. |
| frontend vitest failed in sandbox with `esbuild spawn EPERM` | Re-ran frontend test command with elevated permission to complete verification. |

## Final Notes
- Backend now supports per-file done callback and summary-based finalization without changing v1 public schema.
- Worker no longer overwrites all input statuses to extracted at success end; per-file statuses are preserved.
- Frontend polling failure no longer forces UI phase to failed, reducing false-failure UX on transient network errors.

## Resources
- plans/todo_current.md
- plans/workplans/task_plan.20260221-TC-102.md
- src/bills_analysis/workers/worker.py
- src/bills_analysis/integrations/local_backend.py
- src/bills_analysis/services/ports.py
- frontend/src/features/upload/state/useUploadFlow.js
- frontend/src/features/upload/state/uploadFlowReducer.js
