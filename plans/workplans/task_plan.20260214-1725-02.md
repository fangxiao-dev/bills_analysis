# Task Plan: 前后端合作 — 解析进度 + Merged 结果下载

## Goal
实现两项需要前后端协作的功能：上传后 per-file 解析进度（TC-003）、merged 结果下载链接（TC-006）。

## Scope
- **TC-003**: upload 后的解析进度实时显示，上传界面每个 item 加入 status 状态
- **TC-006**: merged 结果在前端提供打开链接，Submit 旁边，merged 后开放下载按钮

## Owner
- agent-a (frontend)
- 后端部分需要 backend agent 配合

## Classification
- **前后端合作**：需要后端提供新字段 / 填充已有字段，前端消费并展示

---

## Current Phase
Phase 1 (Planning — complete)

---

## 前后端职责矩阵

### TC-003: 解析进度实时显示

| 职责 | 侧 | 具体内容 |
|------|-----|----------|
| **提供 per-file status** | **后端** | 在 `GET /v1/batches/{id}` 的 `inputs[]` 中添加 optional `status` 字段（`"queued"` / `"processing"` / `"extracted"` / `"failed"`）。v1 schema 用 optional 扩展，不破坏冻结契约 |
| **提供 per-file error** | **后端** | `inputs[]` 可选添加 `error` 字段（`string | null`），仅 failed 时有值 |
| **消费 per-file status** | **前端** | 扩展 `FileQueuePanel` 加 Status 列，从 `batch.inputs[].status` 读取并展示 |
| **降级方案** | **前端** | 如果后端暂未实现 per-file status，从 batch 整体 status 推断所有文件的统一状态 |
| **进度指示器 UI** | **前端** | batch 级别 spinner / progress bar，per-file status badge |

**后端 contract 变更建议**（optional 扩展，不 breaking）：
```
inputs[]: {
  path: string,              // 已有
  category: string | null,   // 已有
  status?: "queued" | "processing" | "extracted" | "failed",  // 新增 optional
  error?: string | null       // 新增 optional
}
```

### TC-006: Merged 结果下载链接

| 职责 | 侧 | 具体内容 |
|------|-----|----------|
| **填充 merge_output** | **后端** | merge 成功时在 `batchResponse.merge_output` 中写入 `output_path`（string，指向生成的 Excel 文件路径） |
| **M2+ 下载 endpoint** | **后端** | 未来提供 `GET /v1/batches/{id}/merge-output/download`（返回文件流），M1 暂不需要 |
| **下载按钮 UI** | **前端** | ManualReviewPage Submit 旁加 "Ergebnis öffnen" 按钮，merged 时启用 |
| **消费 merge_output** | **前端** | 读取 `batch.merge_output.output_path`，通过 `toPreviewHref` 转为可打开的 URL |
| **上传页入口** | **前端** | BillUploadPage isDone 时显示 "Ergebnis anzeigen" 入口 |

**后端 merge_output 约定**（passthrough record 内部约定）：
```json
{
  "output_path": "outputs/monthly/2026-02.xlsx",
  "rows_written": 5,
  "merge_mode": "overwrite"
}
```

---

## Phases

### Phase 1: Planning
- [x] 分析前后端职责
- [x] 定义 contract 扩展建议
- [x] 写入 plan 文件
- **Status:** complete

### Phase 2: 前后端对齐
**后端已完成 contract 扩展实现，当前为前端消费阶段。**

- [x] 将 contract 扩展建议同步给 backend agent（通过 SESSION_NOTES.md dep 字段）
  - TC-003: `inputs[].status` optional 扩展
  - TC-006: `merge_output.output_path` 填充约定
- [x] 后端确认并落地实现（agent-b）
- [x] 前端依赖字段确认可用
- **Status:** complete

### Phase 3: TC-003 前端实现
**可先用降级方案开发，后端就绪后切换到真实 per-file status。**

- [ ] 扩展 `FileQueuePanel` 组件：
  - 添加 `Status` 列
  - 接收 `batchStatus` 和 `inputStatuses`（optional）props
  - 每行显示 status badge：
    - 有 per-file status → 显示各自状态
    - 无 per-file status → 从 batch status 降级推断
  - batch 创建后禁用 Remove 按钮
- [ ] 新建 `ItemStatusBadge` 组件（或复用 StatusBadge 样式）：
  - `queued` → 灰色 "Warteschlange"
  - `processing` → 蓝色 spinning "Verarbeitung..."
  - `extracted` → 绿色 "Extrahiert" ✓
  - `failed` → 红色 "Fehlgeschlagen" ✗
- [ ] 在 `BillUploadPage` 中传递 batch status + inputs 给 `FileQueuePanel`
- [ ] 添加 batch 级别进度指示器（spinner overlay 或 progress bar）
- [ ] i18n 所有新字符串
- [ ] 编写测试（mock 两种模式：有/无 per-file status）
- [ ] 更新 mock client 模拟 per-file status（如后端已实现）
- **Status:** pending

### Phase 4: TC-006 前端实现
**可先实现 UI，用 mock 的 merge_output 测试，后端填充后直接可用。**

- [ ] 在 `ManualReviewPage` 的 Submit 旁添加按钮：
  - 文案："Ergebnis öffnen" (Open Result)
  - `disabled` 当 `batch.status !== "merged"` 或 `!batch.merge_output?.output_path`
  - `onClick`：`toPreviewHref(batch.merge_output.output_path)` → `window.open`
- [ ] 在 `BillUploadPage` 添加入口：
  - `flags.isDone` 时在 alert 旁显示 "Ergebnis anzeigen" 按钮
  - 行为同上
- [ ] 更新 mock client：merge 完成时填充 `merge_output.output_path`
- [ ] i18n 所有新字符串
- [ ] 编写测试
- **Status:** pending

### Phase 5: Testing & Wrap-up
- [ ] `pnpm test` 全量通过
- [ ] Mock mode 验证：
  - 降级模式下 per-file status 显示正确
  - merged 后下载按钮启用并可点击
- [ ] Real mode 联调（后端就绪后）
- [ ] 更新 `plans/todo_current.md`：TC-003, TC-006 → DONE
- [ ] 写入 SESSION_NOTES.md（含 dep 标注）
- **Status:** pending

## Key Questions
1. 后端能否在 `inputs[]` 中添加 optional `status`？→ 待确认，不 breaking
2. 后端 `merge_output` 实际填充什么？→ 约定 `output_path`，待确认
3. 降级方案是否可以作为 M1 最终方案？→ 可以，per-file status 为 nice-to-have
4. M2+ 下载 endpoint 路径？→ 建议 `GET /v1/batches/{id}/merge-output/download`

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| TC-003 先实现降级方案 | 不阻塞后端，前端可独立开发测试 |
| TC-006 消费 `merge_output.output_path` | passthrough record 允许后端放任意字段，约定此字段名 |
| contract 用 optional 扩展 | 不删/不改已有字段，v1 冻结策略允许添加 optional 字段 |
| 前端先行，后端就绪后切换 | 降级方案保底，real per-file status 为增强 |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| (none yet) | | |
