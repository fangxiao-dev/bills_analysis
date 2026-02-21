# Findings & Decisions (20260221-TC-101)

## Requirements
- TC-101: Office type 错误样本收集：在 review 页面添加"Report Type Error"按钮，一键将 batch 中间结果复制到 dataset 目录，供开发者改进 GPT-4o-mini 分类 prompt

## Research Findings

### 数据存储结构

每个 batch 的输出目录 `outputs/webapp/<batch_id>/` 包含：

- `results.json` — 提取阶段写入，保存 AI 原始预测（含 `type` 字段），**不被后续覆写**
- `review_rows.json` — 提交时被 `_persist_review_rows_artifact` 覆写（内容与 submitted 相同）
- `review_rows_submitted.json` — 仅在用户 Submit 后创建，保存用户修正后的值

对比基准：`results.json`（原始 AI 预测）vs `review_rows_submitted.json`（用户修正后）。

### DI 原始输出现状

GPT-4o-mini 的输入是经 `clean_invoice_json()` 清洗后的 `office_fields`（distilled），但这份 dict 目前**没有落盘**。

WebApp 调用路径：
```
local_backend.py::_process_one_file_async
  → _analyze_pdf_with_azure → office_fields（原始 DI fields）
  → _fill_office_row
      → distilled = _clean_invoice_fields(office_fields)  ← 未保存到磁盘
      → _extract_office_semantics(distilled)  → type 字段
```

需要在 `_fill_office_row` 中 `distilled` 生成后立即写文件到 `di_fields/<row_id>.json`。

### 现有前端变量（可直接复用）

`ManualReviewPage.jsx`：
- `effectiveBatchType` (line 40)：`state.batch?.type || state.batchType || "daily"`
- `hasSubmittedReview` (line 131)：`state.reviewSubmitted || review_rows_count > 0`

按钮启用条件直接复用这两个变量。

### v1 Contract 影响

新增 endpoint 和 model 为纯新增，不修改现有字段，符合冻结约束。但需重新生成 OpenAPI baseline，否则 `test_api_schema_v1.py` 会失败。

## Technical Decisions

| Decision | Rationale |
|---|---|
| 对比基准用 `results.json` 而非 `review_rows.json` | `review_rows.json` 在 submit 时被覆写，内容与 submitted 相同，无法区分 |
| dataset 结构：`dataset/type_errors/<batch_id>/` 平铺 | 简单，correction_summary.json 记录 corrected_type，分析脚本按需 group |
| di_fields 粒度：每 row_id 一个文件 | 对应 review_rows 粒度，按文件关联分析 |
| `shutil.copytree(dirs_exist_ok=True)` | 幂等，重复点击安全 |
| 按钮可见条件：`office && hasSubmittedReview` | daily 无 type 字段；submit 前无数据可报告 |
| Feedback setTimeout 4s | 短暂提示不干扰工作流 |

## Issues Encountered

| Issue | Resolution |
|---|---|
| `_fill_office_row` 是否能访问 `out_dir` | 待实现时确认函数签名，必要时添加参数 |

## Resources

- plans/todo_current.md
- plans/workplans/task_plan.20260221-TC-101.md
