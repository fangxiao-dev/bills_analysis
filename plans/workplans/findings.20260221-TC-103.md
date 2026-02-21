# Findings — TC-103
**plan_id**: 20260221-TC-103

## Research Findings

### 现状差距（exploration 结论）

| 层 | skip_reason 现状 |
|---|---|
| `PipelineItemResult`（legacy adapter） | 已有字段，但只在旧 `AzurePipelineAdapter` 中设置（`max_pages=4` 硬截断） |
| `local_backend.py`（当前服务层） | **无页数检查**；Azure 调用失败时只写 `extract_error`；review_payload 不含 skip_reason |
| `BatchReviewRow`（API model） | **无 skip_reason 字段** |
| 前端 | 完全不处理 skip_reason |

### Config

- `tests/config.json` 已有 `"max_pages": 4`（与用户期望默认值一致）
- 该 config 目前用于 Excel 导出 confidence 阈值；page 检查复用同文件

### API Route 构造路径

```
local_backend._process_one_file
  → row dict (含 skip_reason)
  → review_payload (Step 3)
  → batch.review_rows (stored)
  → batch_service.get_review_rows (直接返回原始 list)
  → api/main.py:get_batch_review_rows (显式 pick 字段构造 BatchReviewRow)
  → 前端 buildDraftRowsFromBackend
  → ReviewCategoryTable row
```

`main.py` 显式 pick 字段（非 `**row`），所以必须在该处同步加 `skip_reason`。

## Technical Decisions

1. **从 `process_batch` 读 config，传参给 `_process_one_file`**（而非在 init 读）：
   - 理由：config 可能在 batch 间更新，逐 batch 读最准；同时避免改动 `LocalBackend.__init__` 签名。

2. **页数检查放在「压缩之后、Azure 之前」**：
   - 压缩（archive）仍执行，保证 preview_path 可用，用户仍能打开 PDF 审阅。
   - Azure 跳过，避免无效 API 调用和超时。

3. **`skip_reason` 是 additive optional 字段**：
   - v1 contract 兼容：只新增可选字段，不删除/改类型已有字段。
   - 前端对无此字段的旧 row 静默处理（`""` fallback）。
