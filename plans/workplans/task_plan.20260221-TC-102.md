# Task Plan: 20260221-TC-102

## Goal
将上传解析流程升级为单文件实时状态追踪：每个文件独立更新 `queued/processing/extracted/failed`，并将失败语义从“整批一刀切失败”改为“文件级失败优先，批次仅在全失败或系统级异常失败”。

## Scope
- TC-102: 上传解析改为单文件实时状态跟踪：单文件超时/报错独立失败；取消batch级timeout；仅全失败或batch级异常才标记batch失败

## Non-Goals
- 不新增 v1 对外 API endpoint。
- 不调整 v1 对外 schema 字段定义（`BatchStatus` 枚举、`InputFile` 字段保持兼容）。
- 不实现“单文件自动重试”或“失败文件二次重跑 API”。

## Success Criteria
1. 后端在文件完成时立即持久化对应 input 状态，前端轮询可看到逐项推进。
2. 单文件失败不会立即导致 batch 失败。
3. 当全部文件失败时，batch 最终为 `failed`；若至少一个成功，batch 最终为 `review_ready`。
4. 轮询网络失败不会把前端 phase 强制切到 `failed`（避免假失败）。
5. 现有 schema 契约测试与关键流程测试通过。

## Design Decisions (Locked)
- 并发模式：保持并发处理（非串行）。
- 文件完成定义：整条单文件流水线完成后才标记 `extracted`。
- 文件超时策略：不自动重试，首次超时直接 `failed`。
- 批次失败判定：
  - 系统级异常（worker/backend未处理异常）=> `failed`
  - 全部文件失败 => `failed`
  - 至少一个文件成功 => `review_ready`
- 前端轮询失败：保留当前 phase，仅提示错误并允许重试。

## Implementation Sequence
### Phase 1: Backend Contract & Callback Plumbing
- [ ] 更新 `ProcessingBackend.process_batch(...)` 协议，支持 `on_file_done` 回调（内部接口，非公开 API）。
- [ ] 在 `LocalPipelineBackend.process_batch(...)` 引入按文件完成回调机制。

### Phase 2: Local Backend Incremental Processing
- [ ] 将 `asyncio.gather` 一次性汇总改为“按完成回调 + 最终汇总”。
- [ ] 每个文件完成后产出事件：`row_id/filename/category/status/error`。
- [ ] 移除“任意文件失败直接 `raise RuntimeError`”逻辑。
- [ ] 生成 `processing_summary`（`extracted_count` / `failed_count`）供 worker 收尾判定。

### Phase 3: Worker Per-File Persistence
- [ ] worker 启动任务时将所有 input 标记 `processing`（保留现有）。
- [ ] 接收 `on_file_done` 回调并即时写回 repo（单文件状态、错误信息）。
- [ ] 收尾根据 summary 判定 batch 最终状态（`review_ready` / `failed`）。
- [ ] 删除“成功时强制全部 input=extracted”的覆盖逻辑。

### Phase 4: Frontend Poll Failure Behavior
- [ ] 调整 `uploadFlowReducer` 的 `POLL_FAILURE`：不再强制 phase=`failed`，只记录 `systemError`。
- [ ] 保持 `retryPolling` 行为不变，允许手动恢复状态同步。

### Phase 5: Tests & Verification
- [ ] 后端单测：部分失败不抛异常、返回 mixed rows + summary。
- [ ] worker 单测：部分成功 => `review_ready`；全失败 => `failed`。
- [ ] 前端 reducer/hook 测试：轮询失败后 phase 不被改成 failed。
- [ ] 回归：`tests/test_api_schema_v1.py`、`frontend` 相关测试集。

## Risks & Mitigations
- 风险：回调持久化频率增高可能导致 repo 写入放大。
  - 缓解：当前为 in-memory repo，后续持久化实现可引入批量/节流，但不影响本任务接口。
- 风险：异步并发下文件完成顺序不稳定。
  - 缓解：只要求状态正确，不依赖完成顺序；最终产物按 `row_id` 稳定排序。

## Delivery Checklist
- [ ] 代码实现完成并通过测试
- [ ] findings/progress 三文件同步更新
- [ ] `plans/todo_current.md` 保持 `TC-102` 为 `PLANNED`（待开发完成后切 `DONE`）
