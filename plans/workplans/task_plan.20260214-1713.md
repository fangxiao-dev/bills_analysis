# Task Plan: TC-003 ~ TC-006 Frontend UX Enhancements

## Goal
为前端实现四项 UX 增强：上传项目级解析进度（TC-003）、本地文件直接打开（TC-004）、德语 i18n 默认（TC-005）、merged 结果下载链接（TC-006）。

## Scope
- TC-003: upload 后的解析进度实时显示，上传界面每个 item 加入 status 状态
- TC-004: view 如果是本地的，可否直接用默认浏览器打开本地文件而不是下载
- TC-005: 语言支持德语且默认
- TC-006: merged 结果在前端提供打开链接，Submit 旁边，merged 后开放下载按钮

## Owner
- agent-a

## Current Phase
Closed (Superseded by split plans)

## Phases

### Phase 1: Planning & Architecture
- [x] 研究现有代码结构
- [x] 制定各 task 实现方案
- [x] 写入 plan 文件
- **Status:** complete

### Phase 2: TC-005 — i18n 德语默认
**优先实现原因：i18n 是横切关注点，先建好框架后续 task 的新字符串直接用 i18n key。**

- [ ] 安装 `react-i18next` + `i18next`
- [ ] 创建 `frontend/src/i18n/` 目录，初始化 i18n 配置（defaultLng: `de`，fallbackLng: `en`）
- [ ] 创建翻译文件 `de.json` / `en.json`，覆盖现有所有硬编码 UI 字符串
- [ ] 在 `main.jsx` 中引入 i18n 初始化
- [ ] 逐文件替换硬编码字符串为 `t('key')` 调用：
  - `BillUploadPage.jsx`
  - `ManualReviewPage.jsx`
  - `AppFrame.jsx`（sidebar nav labels）
  - `FileQueuePanel.jsx`
  - `PdfDropzone.jsx`
  - `BatchTypeSelector.jsx`
  - `RunDatePicker.jsx`
  - `StatusBadge.jsx`
  - `ReviewCategoryTable.jsx`
  - `AlertBanner.jsx` / `Button.jsx`（如有硬编码文本）
- [ ] 添加语言切换器（小组件在 AppFrame sidebar 底部或 topbar）
- [ ] 更新测试以适配 i18n
- **Status:** pending

### Phase 3: TC-003 — 上传后每个 item 加入 status 状态 & 解析进度实时显示
**依赖分析：v1 contract 的 inputs 不含 per-file status，前端需降级方案。**

- [ ] 前端根据 batch 整体 status 推断 file status：
  - `queued` → 所有 file 显示 "Warteschlange" (Queued)
  - `running` → 所有 file 显示 "Verarbeitung..." (Processing) + spinner
  - `review_ready` → 所有 file 显示 "Extrahiert" (Extracted) + checkmark
  - `failed` → 所有 file 显示 "Fehlgeschlagen" (Failed) + error icon
- [ ] 扩展 `FileQueuePanel` 组件：
  - 添加 `Status` 列
  - 每行显示 status badge（复用 StatusBadge 样式或新建 ItemStatusBadge）
  - batch 创建后禁用 Remove 按钮
- [ ] 在 `BillUploadPage` 中传递 batch status 给 `FileQueuePanel`
- [ ] 添加进度指示器（batch 级别的 progress bar 或 spinner overlay）
- [ ] i18n 所有新字符串
- [ ] 编写测试
- **Status:** pending

### Phase 4: TC-004 — 本地文件直接在浏览器打开
**现状：`onViewRow` 已实现 `URL.createObjectURL` 逻辑，基本可用。主要是优化和 UX。**

- [ ] 审查 `onViewRow` 现有逻辑（3 级优先级已存在）
- [ ] 确认浏览器安全策略：`file:///` 从 http 页面不可用，只有 `blob:` URL 可用
- [ ] 优化：
  - 确保 batch 创建后 files 仍保留在 state 中（已满足）
  - 对于后端返回的 path，走 `{API_BASE_URL}/{path}` 代理
  - 添加 tooltip "Im neuen Tab öffnen" (Opens in new tab)
- [ ] i18n 相关文字
- [ ] 编写测试
- **Status:** pending

### Phase 5: TC-006 — Merged 结果下载链接
**v1 contract: `batchResponse.merge_output` 是 passthrough record，后端可放 `output_path`。**

- [ ] 在 `ManualReviewPage` 的 Submit 按钮旁添加 "Ergebnis öffnen" (Open Result) 按钮：
  - 默认 disabled（灰色）
  - 当 `state.batch.status === "merged"` 时启用
  - 点击行为：消费 `merge_output.output_path`，通过 `toPreviewHref` 打开
- [ ] 在 `BillUploadPage` 也添加入口（当 isDone 时显示 "Ergebnis anzeigen"）
- [ ] 上线后方案记录：
  - M1：本地路径 → `{API_BASE_URL}/{path}`
  - M2+：后端提供 download endpoint
- [ ] i18n 所有新字符串
- [ ] 编写测试
- **Status:** pending

### Phase 6: Integration Testing & Wrap-up
- [ ] `pnpm test` 全量通过
- [ ] Mock mode 手动走通完整流程
- [ ] 验证德语默认显示
- [ ] 更新 `plans/todo_current.md` 状态为 DONE
- [ ] 写入 SESSION_NOTES.md
- **Status:** pending

## Closure
- `20260214-1713` 已作为母计划收口，不再直接执行。
- 执行拆分：
  - `20260214-1725`：TC-004、TC-005（已完成并在 `todo_current` 标记 DONE）
  - `20260214-1725-02`：TC-003、TC-006（已完成并在 `todo_current` 标记 DONE）
- 本文件保留为审计记录。

## Key Questions
1. 后端 `inputs` 数组是否包含 per-file status？→ 不含，降级方案
2. 后端 `merge_output` 实际返回什么？→ 约定消费 `output_path` 字段
3. 德语翻译质量？→ M1 先用基础翻译，后续优化

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| i18n 先行 (Phase 2) | 横切关注点，后续 task 新增字符串直接用 t() |
| 使用 react-i18next | React 生态最成熟 i18n 方案，hooks 友好 |
| per-file status 从 batch status 降级推断 | v1 contract 不含 per-file status，不破坏冻结契约 |
| merged result 消费 `merge_output.output_path` | passthrough record 允许后端放任意字段 |
| 实现顺序 TC-005→003→004→006 | i18n 先就位，后续字符串直接国际化 |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| (none yet) | | |
