# Findings & Decisions (20260214-1713)

## Requirements
- **TC-003**: 上传后每个文件 item 要显示独立的解析 status（queued / processing / extracted / failed）
- **TC-004**: 本地文件（PDF）在 review 页面点 View 时直接浏览器打开，不触发下载
- **TC-005**: 整个 UI 支持德语，且德语为默认语言
- **TC-006**: merged 完成后在 Submit 旁边出现 "打开合并结果" 按钮，可下载/打开 Excel

## Research Findings

### 现有代码架构
- **FileQueuePanel** (`frontend/src/features/upload/components/FileQueuePanel.jsx`): 只显示 name/category/size/remove，无 status 列
- **uploadFlowReducer** state.files: `{ id, file, name, size, category }` — 无 per-file status
- **Batch polling**: `POLL_SUCCESS` 更新 `state.batch`，其中 `batch.status` 是整体状态
- **v1 contract inputs**: `z.object({ path, category })` — 无 status 字段
- **onViewRow 逻辑** (ManualReviewPage L171-L201):
  1. preview_url (http) → window.open
  2. fileEntry.file → createObjectURL → window.open（已实现，files 未清空时可用）
  3. fallback path → toPreviewHref → 可能生成 file:/// 或 API URL
- **merge_output**: `passthroughRecordSchema` (v1.schema.js L81) — 后端可放任意 KV
- **i18n**: 完全空白，无任何 i18n 库或翻译文件
- **硬编码字符串**: 估计 ~80-120 个 UI 字符串分布在 ~10 个组件文件中

### i18n 技术选型
- `react-i18next` + `i18next`: 社区标准，hooks API (`useTranslation`)
- 翻译文件格式：JSON 扁平 key-value，放 `src/i18n/locales/{de,en}.json`
- 初始化：`i18n.use(initReactI18next).init({ lng: 'de', fallbackLng: 'en', resources })`

### 浏览器安全策略
- 从 `http://localhost` 无法用 `window.open('file:///...')` 打开本地文件
- `URL.createObjectURL(File)` 生成 `blob:` URL 可以工作
- 对后端返回的 path，走 `{API_BASE_URL}/{path}` 代理

### merge_output 字段约定
- v1 contract: `merge_output: passthroughRecordSchema` — 后端可放任意 KV
- 前端约定消费 `merge_output.output_path` (string) 表示合并后的 Excel 路径
- M1 阶段用本地路径 → `toPreviewHref` 转换；M2+ 用后端 download endpoint

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| 使用 react-i18next | React 最主流 i18n 方案，hooks 友好，支持运行时切换 |
| 翻译文件放 `src/i18n/locales/{de,en}.json` | 简单扁平结构，M1 不需要命名空间拆分 |
| 德语默认 (`lng: 'de'`) | 用户明确要求德语默认 |
| per-file status 从 batch status 降级推断 | v1 contract 不含 per-file status，不破坏冻结契约 |
| merged result 按钮放 Submit 旁 | 用户明确要求 "放在 Submit 旁边" |
| merged 下载消费 `merge_output.output_path` | passthrough record 允许后端放任意字段，前端 best-effort |
| 实现顺序 TC-005→003→004→006 | i18n 先就位，后续字符串直接国际化 |

## Closure Decision
- Parent plan `20260214-1713` is closed as superseded after scope split.
- Execution authority moved to:
  - `20260214-1725` for TC-004/TC-005
  - `20260214-1725-02` for TC-003/TC-006
- Final tracker state confirmed: TC-001 ~ TC-006 are all `DONE`.

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| (none yet) | |

## Resources
- FileQueuePanel: `frontend/src/features/upload/components/FileQueuePanel.jsx`
- BillUploadPage: `frontend/src/features/upload/pages/BillUploadPage.jsx`
- ManualReviewPage: `frontend/src/features/upload/pages/ManualReviewPage.jsx`
- uploadFlowReducer: `frontend/src/features/upload/state/uploadFlowReducer.js`
- v1 schema: `frontend/src/contracts/v1.schema.js`
- AppFrame: `frontend/src/app/AppFrame.jsx`
- StatusBadge: `frontend/src/features/upload/components/StatusBadge.jsx`
