# Findings & Decisions (20260214-1725) — 纯前端 Plan

## Requirements
- **TC-005**: 整个 UI 支持德语，且德语为默认语言，支持运行时切换
- **TC-004**: 本地文件（PDF）在 review 页面点 View 时直接浏览器打开，不触发下载

## Research Findings

### i18n 现状
- 完全空白，无任何 i18n 库或翻译文件
- 所有 UI 字符串硬编码在 JSX 中，英语为主
- 估计 ~80-120 个 UI 字符串分布在 ~10 个组件文件中

### i18n 技术选型
- `react-i18next` + `i18next`: 社区标准，hooks API (`useTranslation`)
- 初始化：`i18n.use(initReactI18next).init({ lng: 'de', fallbackLng: 'en', resources })`
- 测试适配：可 mock `useTranslation` 或用 `I18nextProvider` 包裹

### TC-004 现有实现分析
- `onViewRow` (ManualReviewPage L171-L201) 已有完整的 3 级优先级：
  1. `preview_url` (http) → `window.open` ✓
  2. `fileEntry.file` → `URL.createObjectURL` → `window.open` ✓
  3. fallback path → `toPreviewHref` → `{API_BASE_URL}/{path}` 或 `file:///` ✓
- `state.files` 在 batch 创建后不会被清空（reducer 逻辑确认）
- 浏览器安全策略：`file:///` 从 http 页面不可用，但 `blob:` URL 可以
- **结论**：核心逻辑已可用，TC-004 主要是 UX 优化（tooltip、error 提示优化）

### 需要替换的字符串清单（主要文件）
- `AppFrame.jsx`: sidebar nav labels
- `BillUploadPage.jsx`: ~20 个字符串（title, description, buttons, alerts）
- `ManualReviewPage.jsx`: ~25 个字符串（title, section headers, buttons, alerts, labels）
- `FileQueuePanel.jsx`: ~5 个（column headers, empty state）
- `PdfDropzone.jsx`: ~3 个（title, description, button）
- `BatchTypeSelector.jsx`: ~3 个
- `RunDatePicker.jsx`: ~1 个
- `StatusBadge.jsx`: ~6 个（status text mapping）
- `ReviewCategoryTable.jsx`: ~5 个

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| 使用 react-i18next | React 最主流 i18n 方案，hooks 友好，支持运行时切换 |
| 翻译文件放 `src/i18n/locales/{de,en}.json` | 简单扁平结构，M1 不需要命名空间拆分 |
| 德语默认 (`lng: 'de'`) | 用户明确要求 |
| 语言选择持久化 `localStorage('app.lang')` | 保证刷新后保留用户切换 |
| TC-004 保留现有逻辑，只做 UX polish | 核心功能已实现，避免过度工程 |

## Validation Evidence
- 新增 i18n 基础设施：`frontend/src/i18n/index.js`, `frontend/src/i18n/locales/de.json`, `frontend/src/i18n/locales/en.json`
- 关键组件国际化：AppFrame、BillUploadPage、ManualReviewPage、FileQueuePanel、PdfDropzone、BatchTypeSelector、RunDatePicker、StatusBadge、ReviewCategoryTable
- 定向测试命令通过：
  - `pnpm test -- --run src/app/AppFrame.test.jsx src/features/upload/components/StatusBadge.test.jsx src/features/upload/components/ReviewCategoryTable.test.jsx src/features/upload/pages/ManualReviewPage.test.jsx src/features/upload/components/PdfDropzone.test.jsx`
  - 结果：5 files, 20 tests passed

## Resources
- AppFrame: `frontend/src/app/AppFrame.jsx`
- BillUploadPage: `frontend/src/features/upload/pages/BillUploadPage.jsx`
- ManualReviewPage: `frontend/src/features/upload/pages/ManualReviewPage.jsx`
- FileQueuePanel: `frontend/src/features/upload/components/FileQueuePanel.jsx`
- StatusBadge: `frontend/src/features/upload/components/StatusBadge.jsx`
- ReviewCategoryTable: `frontend/src/features/upload/components/ReviewCategoryTable.jsx`
