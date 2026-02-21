# Findings & Decisions (20260221-TC-105)

## Requirements
- TC-105: Web API主链路异步优化：预检查后并发执行识别+压缩，超页尽早跳过识别但保留归档，并在汇合阶段重命名

## Research Findings
- Current web path already has batch-level async fan-out (`create_task` + `as_completed`) in `LocalPipelineBackend.process_batch`.
- Per-file flow is still effectively serialized as `compress -> page-count check -> extract -> organize`.
- Over-page skip decision currently happens after compression, so extraction skip is late in scheduling semantics.
- Rename/organized copy depends on extraction result fields, therefore a join point is required.
- Worker contract expects per-file final callback status and should remain unchanged.

## Constraints
- Preserve output contract (`review_rows`, `skip_reason`, `preview_path`, input statuses).
- Preserve skip policy: over-page files still archived/compressed for manual review traceability.
- Do not modify legacy script adapter in this task.

## Technical Decisions
| Decision | Rationale |
|---|---|
| Optimize only `local_backend.py` | User chose Web API main path first. |
| Pipeline shape: precheck -> parallel fan-out -> join | Matches latency goal and rename dependency model. |
| Over-max-pages: skip extraction, keep archive | Explicit user requirement for traceable artifacts. |
| Add configurable extraction limits | Prevent DI throttling while enabling controlled speedup. |
| Keep API schema unchanged | M1 `v1` contract freeze requirement. |

## Issues Encountered
| Issue | Resolution |
|---|---|
| None in planning stage | N/A |

## Resources
- plans/todo_current.md
- plans/workplans/task_plan.20260221-TC-105.md
- src/bills_analysis/integrations/local_backend.py
- src/bills_analysis/workers/worker.py
