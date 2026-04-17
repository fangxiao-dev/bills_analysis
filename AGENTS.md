# AGENTS.md

## 1) Project Overview

本项目是一个面向餐馆内部使用的账单归档与分析 Web App。

核心场景：
- `daily`：店长每天上传当日结算小票和零星支出 PDF，系统提取 `Brutto` / `Netto` / `store_name` 等信息，人工校验后入库。
- `office`：每月上传银行支出/发票 PDF，系统提取 `brutto` / `netto` / `sender` / `tax_id` / `receiver` 等信息，人工确认后追加到月度数据中。
- 上传 PDF 后会进行压缩归档，并生成可预览链接，便于人工核查。

当前技术方向：
- 前端：Azure Static Web Apps（计划），JavaScript
- 后端：FastAPI + Python（Azure Functions / Queue 模式计划）
- 文档识别：Azure Document Intelligence；`office` 场景还会使用 Azure OpenAI 做语义补充

## 2) Stable References

当前本地已验证的主链路参考：
- `tests/run_with_category.py`
- `src/bills_analysis/extract_by_azure_api.py`
- `src/bills_analysis/excel_ops.py`

其余 `tests/*.py` 脚本多为历史验证或辅助脚本，按需参考，不作为新功能默认入口。

`playground/` 下内容为实验性内容，不作为主线代码依据。

## 3) Architecture Targets

目标目录与职责：
- `src/bills_analysis/api/`：FastAPI routes
- `src/bills_analysis/services/`：业务编排
- `src/bills_analysis/integrations/`：外部适配
- `src/bills_analysis/models/`：schema / contract
- `src/bills_analysis/workers/`：异步任务处理
- `frontend/`：前端工程

## 4) Hard Rules

- API contract 以 `src/bills_analysis/models/` 为唯一来源。
- `v1` 在 M1 期间冻结，禁止 breaking change；如必须变更，先升级版本并记录迁移风险。
- `.env` 不入库，示例放 `.env.example`。
- 阈值与业务参数当前统一走 `tests/config.json`。
- 所有 merge 写入需保留审计日志：操作者、时间、目标表、变更摘要。
- 新增或修改的函数、类、枚举、脚本注释规范见 `.claude/rules/commenting-conventions.md`。

## 5) Development Modes

默认不强制使用 `worktree`。

- 默认模式：允许在当前工作区直接完成小范围、低风险、短周期修改。
- `worktree` 模式：在以下场景优先使用：
  - 用户显式要求
  - 需要 `task_id` / plan 跟踪
  - 需要并行开发或隔离上下文
  - 任务跨阶段、周期较长，或需要独立回归与合并流程

`worktree` 相关细节见：
- `.claude/rules/collaboration-boundaries.md`
- `.claude/rules/planning-with-files.md`
- `plans/workplans/README.md`

## 6) Commands

旧流程：
- `daily`：`uv run python tests/run_with_category.py --bar-dir <bar_dir> --zbon <zbon.pdf> --run_date 04/02/2026`
- `office`：`uv run python tests/run_with_category.py --office-dir <office_dir> --run_date 04/02/2026`

当前常用命令：
- 启动 API：`uv run invoice-web-api`
- 健康检查：`GET http://127.0.0.1:8000/healthz`
- Contract 测试：`uv run pytest tests/test_api_schema_v1.py -q`
- 导出 OpenAPI v1：`uv run python scripts/export_openapi_v1.py`

## 7) Plans And Rules

任务与计划文件：
- `plans/todo_current.md`：当前里程碑任务表
- `plans/todo_future.md`：未来里程碑参考
- `plans/workplans/`：plan 上下文与进度记录

详细规则索引：
- `.claude/rules/api-contract.md`
- `.claude/rules/collaboration-boundaries.md`
- `.claude/rules/planning-with-files.md`
- `.claude/rules/commenting-conventions.md`
- `.claude/rules/dod-and-safety.md`

## 8) Host Notes

- `AGENTS.md` 是仓库级主规范，尽量保持宿主无关。
- `CLAUDE.md` 只保留 Claude 特有补充，不重复项目背景和流程细节。
