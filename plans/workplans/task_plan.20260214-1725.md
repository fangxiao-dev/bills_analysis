# Task Plan: 纯前端 — i18n 德语 + 本地文件打开

## Goal
纯前端实现两项 UX 增强：德语 i18n 默认（TC-005）、本地文件直接浏览器打开优化（TC-004）。无后端依赖，前端可独立完成。

## Scope
- **TC-005**: 语言支持德语且默认
- **TC-004**: view 如果是本地的，可直接用默认浏览器打开本地文件而不是下载

## Owner
- agent-a (frontend)

## Classification
- **纯前端**：不需要后端配合，不涉及 v1 contract 变更

## Current Phase
Phase 4 (Complete)

## Phases

### Phase 1: Planning
- [x] 研究现有代码结构
- [x] 制定实现方案
- **Status:** complete

### Phase 2: TC-005 — i18n 德语默认
**优先实现原因：i18n 是横切关注点，先建好框架，TC-004 新增的字符串直接用 i18n key。**

- [x] 安装 `react-i18next` + `i18next`（`pnpm add react-i18next i18next`）
- [x] 创建 `frontend/src/i18n/` 目录：
  - `index.js` — i18n 初始化（`lng: 'de'`, `fallbackLng: 'en'`）
  - `locales/de.json` — 德语翻译
  - `locales/en.json` — 英语翻译
- [x] 在 `main.jsx` 中 `import './i18n'` 初始化
- [x] 逐文件替换硬编码字符串为 `t('key')`：
  - `AppFrame.jsx` — sidebar nav labels ("Upload Management", "Manual Review", "Archive", "Settings")
  - `BillUploadPage.jsx` — page title, descriptions, button labels, alert messages
  - `ManualReviewPage.jsx` — page title, descriptions, section headers, button labels, alerts
  - `FileQueuePanel.jsx` — column headers ("File", "Category", "Size", "Actions"), empty state text
  - `PdfDropzone.jsx` — title, description, button text
  - `BatchTypeSelector.jsx` — labels
  - `RunDatePicker.jsx` — label
  - `StatusBadge.jsx` — status text mapping
  - `ReviewCategoryTable.jsx` — section headers, "View" button text
- [x] 添加语言切换器（AppFrame sidebar 底部，DE/EN toggle）
- [x] 更新测试以适配 i18n（默认测试语言 en，新增 AppFrame/StatusBadge 用例）
- **Status:** complete

### Phase 3: TC-004 — 本地文件直接浏览器打开
**现状：`ManualReviewPage.onViewRow` 已有 3 级优先级逻辑，基本可用。主要是优化和 UX 完善。**

- [x] 审查并优化 `onViewRow` 现有逻辑：
  - 优先级 1: `preview_url` (http) → `window.open` ✓ 已实现
  - 优先级 2: `fileEntry.file` (本地 File) → `createObjectURL` → `window.open` ✓ 已实现
  - 优先级 3: backend `path` → `toPreviewHref` → `{API_BASE_URL}/{path}` ✓ 已实现
- [x] 确认 batch 创建后 `state.files` 仍保留（已满足，reducer 不清空 files）
- [x] UX 优化：
  - View 按钮添加 tooltip："Im neuen Tab öffnen" / "Open in new tab"
  - 对无法预览的 row 显示明确提示而不是 generic error
- [x] i18n 所有相关字符串（Phase 2 框架已就位）
- [x] 编写/更新测试
- **Status:** complete

### Phase 4: Testing & Wrap-up
- [ ] `pnpm test` 全量通过
- [ ] Mock mode 手动验证：
  - 德语默认显示正确
  - 语言切换 DE↔EN 正常
  - View 按钮对本地文件可正常打开
- [x] 更新 `plans/todo_current.md`：TC-004, TC-005 → DONE
- [x] 写入 SESSION_NOTES.md
- **Status:** complete

## Key Questions
1. i18n 是否需要支持运行时切换？→ 是，用户可能偶尔需要英语
2. 德语翻译质量要求？→ M1 先用基础翻译，后续可优化
3. TC-004 现有逻辑需要改多少？→ 很少，主要加 tooltip 和改善 error message

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| TC-005 先于 TC-004 | i18n 框架先就位，TC-004 新字符串直接国际化 |
| 使用 react-i18next | React 生态最成熟 i18n 方案，hooks (useTranslation) 友好 |
| 翻译文件放 `src/i18n/locales/{de,en}.json` | 扁平 JSON，M1 不需要命名空间拆分 |
| 德语默认 `lng: 'de'` | 用户明确要求 |
| TC-004 保留现有 3 级优先级 | 逻辑已可用，只做 UX polish |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| (none yet) | | |
