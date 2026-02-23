# Task Plan — TC-103
**plan_id**: 20260221-TC-103
**created_at**: 2026-02-21

## Goal

多页 PDF（超过 `max_pages` 页）在当前服务层（`local_backend.py`）没有页数检查，Azure 调用失败时只产生 `extract_error` 且不保证 review row 出现。

本任务目标：
1. 超页数的 PDF 依然生成一条 review row，提取字段全为空，供人工手填。
2. `max_pages` 从 `tests/config.json` 读取（已有此 key，默认值 4）。
3. Review 表格中，`skip_reason` 非空条目在「查看 PDF」链接前显示 ⚠ 图标，hover/title 显示跳过原因。

## Scope

| 文件 | 改动 |
|------|------|
| `src/bills_analysis/integrations/local_backend.py` | process_batch 读 max_pages；_process_one_file/_process_one_file_async 加参数；Azure 调用前插页数检查，超限设 skip_reason 并提前返回空 row |
| `src/bills_analysis/models/api_responses.py` | `BatchReviewRow` 新增 `skip_reason: str | None = None` |
| `src/bills_analysis/api/main.py` | `get_batch_review_rows` 路由构造 `BatchReviewRow` 时加 `skip_reason=row.get("skip_reason") or None` |
| `frontend/src/features/upload/pages/ManualReviewPage.jsx` | `buildDraftRowsFromBackend` 的 `common` 对象加 `skip_reason` |
| `frontend/src/features/upload/components/ReviewCategoryTable.jsx` | actions `<td>` 加 ⚠ span（条件渲染） |
| `frontend/src/app/styles.css` | 新增 `.review-skip-icon` CSS |
| `frontend/src/i18n/locales/en.json` | `review.skipReason` key |
| `frontend/src/i18n/locales/de.json` | 同上 |
| `frontend/src/i18n/locales/zh.json` | 同上 |

## Implementation Steps

### 1. Backend — 读取 max_pages

在 `local_backend.py` 的 `process_batch` 方法顶部，用 json 读取：

```python
import json
_config_path = Path("tests") / "config.json"
try:
    _cfg = json.loads(_config_path.read_text(encoding="utf-8"))
    max_pages = int(_cfg.get("max_pages", 4))
except Exception:
    max_pages = 4
```

将 `max_pages` 透传到 `_process_one_file_async(max_pages=max_pages)` 和 `_process_one_file(max_pages: int)`。

### 2. Backend — 页数检查（Azure 调用前）

在 `_process_one_file` 压缩完成后、`_analyze_pdf_with_azure` 调用前：

```python
try:
    with fitz.open(source_path) as _doc:
        _page_count = _doc.page_count
except Exception:
    _page_count = None

if _page_count is not None and _page_count > max_pages:
    row["skip_reason"] = f"page_count={_page_count} > max_pages={max_pages}"
    return row  # result 已初始化为 {"run_date": batch.run_date}，满足空行要求
```

### 3. Backend — review_payload 加 skip_reason

```python
review_payload = [
    {
        "row_id": row["row_id"],
        "filename": row["filename"],
        "category": row["category"],
        "result": row["result"],
        "score": row["score"],
        "preview_path": row.get("preview_path"),
        "skip_reason": row.get("skip_reason"),   # 新增
    }
    for row in rows
]
```

### 4. Model — BatchReviewRow

```python
class BatchReviewRow(StrictModel):
    ...
    preview_url: str | None = None
    skip_reason: str | None = None  # 新增，additive，v1 兼容
```

### 5. API Route — main.py

```python
BatchReviewRow(
    ...
    preview_url=preview_url,
    skip_reason=row.get("skip_reason") or None,  # 新增
)
```

### 6. Frontend — buildDraftRowsFromBackend

`common` 对象中加：

```js
skip_reason: typeof row.skip_reason === "string" ? row.skip_reason : "",
```

### 7. Frontend — ReviewCategoryTable ⚠ 图标

actions `<td>` 内，`<a>` 链接之前：

```jsx
{row.skip_reason ? (
  <span
    className="review-skip-icon"
    title={`${t("review.skipReason")}: ${row.skip_reason}`}
    aria-label={row.skip_reason}
  >
    ⚠
  </span>
) : null}
```

CSS（`styles.css`）：

```css
.review-skip-icon {
  margin-right: 0.4rem;
  color: #f59e0b;
  cursor: help;
  font-size: 0.95rem;
}
```

### 8. i18n

```json
// en: "skipReason": "Skipped"
// de: "skipReason": "Übersprungen"
// zh: "skipReason": "跳过原因"
```

## Verification

1. `uv run pytest tests/test_api_schema_v1.py -q` — 不破坏现有 contract 测试
2. 手动 E2E：准备 >4 页 PDF → 提交 batch → 确认 review row 有 skip_reason + 前端出现 ⚠ 图标
3. 改 `tests/config.json` `max_pages=2`，3 页 PDF 确认触发
