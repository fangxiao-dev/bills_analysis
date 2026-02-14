# Findings & Decisions (20260214-1725-02) — 前后端合作 Plan

## Requirements
- **TC-003**: 上传后每个文件 item 显示独立解析 status，需要后端 per-file status 支持
- **TC-006**: merged 完成后 Submit 旁出现下载按钮，需要后端填充 `merge_output`

## Research Findings

### TC-003: per-file status 现状
- 当前 v1 contract `inputs[]` 只有 `{ path, category }` — 无 status 字段
- `batchResponse.status` 是 batch 整体状态（queued/running/review_ready/merging/merged/failed）
- 前端 `FileQueuePanel` 只显示 name/category/size/remove，无 Status 列
- **降级方案可行**：从 batch status 推断所有文件统一状态，UX 打折但可用
- **理想方案**：后端在 inputs[] 添加 optional status，前端消费各自状态

### TC-003: contract 扩展可行性
- v1 冻结策略：禁止删除/重命名/改类型已发布字段
- **添加 optional 新字段不属于 breaking change**，符合冻结策略
- `inputFileSchema` 当前是 `.strict()` — 后端添加新字段后前端 schema 也需要同步更新
- 前端 schema 更新：`inputFileSchema` 添加 `status: z.string().optional()`, `error: z.string().nullable().optional()`

### TC-006: merge_output 现状
- `batchResponse.merge_output` 是 `passthroughRecordSchema`（`z.record(z.string(), z.unknown())`）
- 当前后端 merge 成功后可能未填充任何字段（空 `{}`）
- 前端 `toPreviewHref()` 已有路径转 URL 逻辑，可直接复用
- mock client 的 `POLL_SUCCESS` 返回 `merge_output: {}`，需要更新为含 `output_path`

### 浏览器打开 Excel 文件的限制
- 浏览器可打开 PDF，但 Excel 文件通常会触发下载
- M1 本地场景：`{API_BASE_URL}/{path}` 会触发浏览器下载 Excel → 这是预期行为
- M2+ 可以考虑后端提供 preview 或直接下载流

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| TC-003 降级方案先行 | 不阻塞后端，前端可独立开发测试 |
| inputs[] 添加 optional status | 不 breaking，符合 v1 冻结策略 |
| merge_output 约定 output_path | passthrough record 不限制字段名，前端约定此 key |
| 前端 inputFileSchema 需同步更新 | `.strict()` 模式下新字段会导致验证失败 |
| Excel 用下载行为（非预览） | 浏览器原生行为，M1 可接受 |

## Backend Implementation Status (agent-b)

### 已落地（可被前端直接消费）
- TC-003:
  - `inputs[]` 已包含 optional:
    - `status?: "queued" | "processing" | "extracted" | "failed"`
    - `error?: string | null`
  - 生命周期行为：
    - 创建 batch: `queued`
    - worker 开始处理: `processing`
    - 处理成功: `extracted`
    - 处理失败: `failed` + `error`
- TC-006:
  - `merge_output` 已填充 `output_path`（指向 merged excel）
  - 兼容字段 `merged_excel_path` 仍保留

### 前端待消费依赖（请按字段名对接）
1. 在上传页/轮询中读取 `batch.inputs[].status` 与 `batch.inputs[].error`，替换当前纯 batch-level 推断。
2. 在 merged 态读取 `batch.merge_output.output_path`，作为“Ergebnis öffnen/anzeigen”按钮目标。
3. 按后端状态枚举渲染 badge：`queued|processing|extracted|failed`。

## 后端 Contract 扩展清单

### 1. `inputs[]` 扩展（TC-003）
```
// 现有
{ path: string, category: string | null }

// 扩展后
{ path: string, category: string | null, status?: string, error?: string | null }
```
- `status` 值域：`"queued"` | `"processing"` | `"extracted"` | `"failed"`
- 后端在 `GET /v1/batches/{id}` 时填充各文件的实时状态

### 2. `merge_output` 填充（TC-006）
```json
{
  "output_path": "outputs/monthly/2026-02.xlsx",
  "rows_written": 5,
  "merge_mode": "overwrite"
}
```
- 后端在 merge 成功时填入
- 前端消费 `output_path` 生成下载链接

## Resources
- v1 schema: `frontend/src/contracts/v1.schema.js`
  - `inputFileSchema` (L12-L17): `.strict()` 需要同步更新
  - `batchResponseSchema.merge_output` (L81): passthrough record
- FileQueuePanel: `frontend/src/features/upload/components/FileQueuePanel.jsx`
- BillUploadPage: `frontend/src/features/upload/pages/BillUploadPage.jsx`
- ManualReviewPage: `frontend/src/features/upload/pages/ManualReviewPage.jsx`
- toPreviewHref: `ManualReviewPage.jsx` L591-L604
- mock client: `frontend/src/features/upload/api/uploadClient.mock.js`
