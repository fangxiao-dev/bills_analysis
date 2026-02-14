# SESSION_NOTES

```json
{
  "id": "C-001",
  "ts": "2026-02-13T22:19:05+01:00",
  "status": "CLOSED",
  "scope": "frontend m2 daily integration stabilization",
  "who": {"agent":"agent-a","side":"frontend","branch":"feat-frontend-v1","head":"aa61901"},
  "what": ["已对齐 ManualReview 提交 payload，切换为 canonical row shape（nested result/score + preview_path）以保证 backend merge compatibility。","已调整 useUploadFlow hook tests，采用 act-safe state updates 与 polling-aware 断言，适配 backend contract changes。","why: Daily 上传到 review 再到 merge（Upload->Review->Merge）主链路已满足本地联调语义，并对齐 v1 strict validation。"],
  "next": {"goal":"运行完整前端测试（full frontend test suite），完成 commit split，并执行 office 场景端到端 API smoke。","owner":"agent-a"},
  "dep": ["backend 侧需保持 /v1 review-row canonical schema 稳定；若 result 字段 key 有变更请提前通知 frontend。"],
  "risk": ["最后一次测试超时参数调整后尚未做 full-suite 回归；发布前需重新执行 pnpm vitest run。"]
}
```

```json
{
  "id": "C-002",
  "ts": "2026-02-13T22:51:45+01:00",
  "status": "CLOSED",
  "scope": "backend m1.1 review-merge 稳定化",
  "who": {"agent":"agent-b","side":"backend","branch":"feat-backend-v1","head":"0cd9ef8"},
  "what": ["已在 PUT /v1/batches/{id}/review 增加严格 review row normalization；当 payload shape 不合法时返回 422，并保留从 flattened fields 到 nested result 的 compatibility mapping。","已将提交后的 review 结果持久化到 review_rows.json 与 review_rows_submitted.json，确保 merge 与排障读取的是最新人工编辑数据，而不是 extraction snapshot。","已通过 legacy mapper path 恢复 daily validated merge workbook 生成，重新带回 confidence highlights 与 PDF links 到 validated_for_merge 输出。","why: 日常联调中 merged output 未反映表单编辑且 validated workbook 为空；本次修复将 review submission 与 merge input contract 对齐。"],
  "next": {"goal":"基于真实前端流程完成一次 daily 与一次 office 的 end-to-end API smoke；若无回归，移除临时 flat-payload compatibility。","owner":"agent-b"},
  "dep": ["frontend: 请持续提交 canonical nested row payload {row_id,category,filename,result,score,preview_path}，并显式处理 422 validation feedback。"],
  "risk": ["当前仍临时支持 legacy flat-field payload 以兼容历史前端；前端全量切换后需移除 fallback，避免 schema drift。"]
}
```

```json
{
  "id": "C-003",
  "ts": "2026-02-13T23:27:56+01:00",
  "status": "CLOSED",
  "scope": "frontend m1.1 real smoke + validation observability",
  "who": {"agent":"agent-a","side":"frontend","branch":"feat-frontend-v1","head":"642ce97"},
  "what": ["增强 toErrorMessage，支持 FastAPI 422 detail 的 string/object/list 解析，输出字段级可读错误。","新增回归测试：http/uploadClient.real/useUploadFlow/ManualReviewPage，覆盖 422 detail 列表场景与 UI 错误展示。","新增 real API smoke 脚本 pnpm smoke:real，覆盖 daily(overwrite) + office(append/overwrite) 链路并强制 canonical nested review payload。","why: 按 M1 收口要求提升联调可观测性并固化回归；确保 review 失败时前端可直接定位字段错误。"],
  "next": {"goal":"在后端可用时重跑 real smoke，记录 daily/office 终态并清理遗留 dep/risk。","owner":"agent-a"},
  "dep": ["backend: 需在联调环境启动 invoice-web-api 并保证 http://127.0.0.1:8000/healthz 可达，以完成 daily/office real smoke 终态验证。"],
  "risk": ["本次 smoke 在 2026-02-13 因 healthz 不可达中断，未拿到 merged/failed 终态；需后端启动后重跑 pnpm smoke:real。"]
}
```

```json
{
  "id": "C-004",
  "ts": "2026-02-13T23:53:11+01:00",
  "status": "CLOSED",
  "scope": "frontend real smoke failure triage",
  "who": {"agent":"agent-a","side":"frontend","branch":"feat-frontend-v1","head":"642ce97"},
  "what": ["修复 smoke 脚本轮询策略：新增状态停滞检测、周期日志、failed 终态快速失败，避免长时间重复 GET 造成假死观感。","定位失败根因：三条链路均在 review_ready 前进入 failed，后端返回 DI InvalidContent（占位 PDF 文件损坏/格式不支持）。","新增真实文件输入能力：支持 SMOKE_DAILY_ZBON_FILE/SMOKE_DAILY_BAR_FILE/SMOKE_OFFICE_APPEND_FILE/SMOKE_OFFICE_OVERWRITE_FILE，默认无配置时仍使用占位 PDF 并显式打印提示。","why: 联调目标是可解释失败而非盲等；当前阻塞并非前端循环，而是测试输入无效。"],
  "next": {"goal":"接收真实样本路径后重跑 smoke，产出 daily/office(append/overwrite) 终态记录。","owner":"agent-a"},
  "dep": ["backend: 若需通过 smoke，请提供可被 Azure DI 接受的真实 PDF 样本或测试存储路径。"],
  "risk": ["在未提供真实 PDF 的情况下，pnpm smoke:real 将稳定失败于 InvalidContent，无法进入 review/merge 终态验证。"]
}
```

```json
{
  "id": "C-005",
  "ts": "2026-02-14T00:16:40+01:00",
  "status": "CLOSED",
  "scope": "frontend real smoke with b-q-z samples",
  "who": {"agent":"agent-a","side":"frontend","branch":"feat-frontend-v1","head":"642ce97"},
  "what": ["使用真实样本完成三条链路 smoke：daily(z+b)、office-append(q)、office-overwrite(q)。","三条链路均成功到达 review_ready，并完成 canonical nested review payload 提交与 merge task 入队。","失败点统一在 merge 执行阶段，batch error 为 monthly_excel_path not found: outputs\\\\monthly\\\\current.xlsx。","why: 验证前端主调用链路与 v1 契约已可联调；当前阻塞是后端 merge 输入文件路径不存在。"],
  "next": {"goal":"接入真实 monthly excel 路径后重跑 daily/office 三条 smoke，目标拿到 merged 终态。","owner":"agent-a"},
  "dep": ["backend: 需要提供有效 monthly_excel_path（或在 merge-source/local 上传后返回可用路径）以完成 merge 成功验证。"],
  "risk": ["若仍使用默认 outputs/monthly/current.xlsx，real smoke 将稳定在 merge 阶段失败。"]
}
```

```json
{
  "id": "C-006",
  "ts": "2026-02-14T00:21:56+01:00",
  "status": "CLOSED",
  "scope": "frontend smoke re-run with project data excel",
  "who": {"agent":"agent-a","side":"frontend","branch":"feat-frontend-v1","head":"642ce97"},
  "what": ["smoke 脚本支持 SMOKE_MONTHLY_EXCEL_PATH，并验证 monthly 路径使用绝对路径后可被后端识别。","office append/overwrite 两条链路均完成 merged（batch: 2e293871-41ca-46ef-9bb8-856c37ccd56b / 5414652d-3718-4e55-967c-2bc4711c843e）。","daily 链路在 merge 失败，后端错误为 Datum not found in monthly Excel: 14/02/2026（batch: d3f1fb9a-489b-4ef1-bb0b-ab4bf3ae5ab2）。","why: 前端调用链路与 canonical review payload 已联通；当前唯一阻塞是 daily 数据日期与 monthly 样本不匹配。"],
  "next": {"goal":"使用包含目标日期的数据或调整 run_date 后重跑 daily，目标拿到 merged 终态。","owner":"agent-a"},
  "dep": ["backend/data-owner: 需提供包含 run_date=14/02/2026 的 monthly daily 基线，或允许指定与样本匹配的 run_date。"],
  "risk": ["若 daily run_date 不在 monthly 样本中，daily merge 会稳定失败。"]
}
```

```json
{
  "id": "C-007",
  "ts": "2026-02-14T10:22:19+01:00",
  "status": "CLOSED",
  "scope": "frontend smoke mode-specific excel routing fix",
  "who": {"agent":"agent-a","side":"frontend","branch":"feat-frontend-v1","head":"642ce97"},
  "what": ["修复 smoke merge 路由逻辑：daily 场景使用 daily excel，office 场景使用 monthly excel，不再共用单一路径。","新增环境变量 SMOKE_DAILY_EXCEL_PATH 与 SMOKE_OFFICE_EXCEL_PATH，并将默认值改为仓库 data 目录的绝对路径（避免后端 cwd 差异导致路径找不到）。","更新 smoke 日志，按 case 输出实际 merge_excel 路径，便于排障。","why: 用户指出 daily 与 office 是两套模式，原联调脚本将 monthly 路径错误用于 daily。"],
  "next": {"goal":"后端恢复后重跑 b/q/z 三链路，验证 daily+office 使用分场景 excel 后的终态。","owner":"agent-a"},
  "risk": ["本次重跑时后端 healthz 不可达（127.0.0.1:8000），未产出新的 smoke 终态。"]
}
```

```json
{
  "id": "C-008",
  "ts": "2026-02-14T10:25:32+01:00",
  "status": "CLOSED",
  "scope": "frontend smoke final pass with split excel modes",
  "who": {"agent":"agent-a","side":"frontend","branch":"feat-frontend-v1","head":"642ce97"},
  "what": ["按场景分流 merge excel 后完成 real smoke 全量通过：daily 使用 data/daily_excel_sample.xlsx；office 使用 data/monthly_excel_sample.xlsx。","daily-overwrite merged（batch=6c2d4360-3982-476f-9a74-4459601e8b5f, task=12a4f1ac-8593-479f-a485-c060c8ff07f9）。","office-append merged（batch=405b732a-0cd2-4846-88c0-93210d458a50, task=984d736c-1886-45ae-8465-c916e284d59b）; office-overwrite merged（batch=36d2d42c-854e-4ec5-bd72-41d3a87e43f3, task=e7a1c23d-c840-40f0-b2d3-5ba9dc54aafa）。","why: 验证前端 v1 调用链路在 daily/office 双模式下均可闭环到 merged 终态。"],
  "next": {"goal":"进入 M2 收口：将 smoke 命令纳入发布前 checklist，并与 backend 对齐失败重试策略。","owner":"agent-a"}
}
```

```json
{
  "id": "C-009",
  "ts": "2026-02-14T00:03:27+01:00",
  "status": "OPEN",
  "scope": "backend m1.1 review canonical 收口与双链路 smoke",
  "who": {"agent":"agent-b","side":"backend","branch":"feat-backend-v1","head":"9c6ed83"},
  "what": ["移除 PUT /v1/batches/{id}/review 的 flat-field compatibility，仅接受 canonical nested row.result 并返回明确 422","新增 tests/test_api_e2e_smoke.py，覆盖 daily+office 的 upload->review->merge-source->merge 全链路并固定外部依赖","完成真实 Azure smoke：daily batch=17636c1c-7690-4703-869d-5934c7c626a8，office batch=f53d7a98-be29-46db-aa55-ba75522d7ae9，两条链路均 merged 且产物落盘","why: 收口 review contract，降低 schema drift 风险，并补齐可回归和真实环境双重验证证据"],
  "next": {"goal":"在前端真实联调中复验 422 错误提示可用性，并清理已废弃 flat payload 文档/示例","owner":"agent-b"},
  "dep": ["frontend: 持续提交 canonical nested payload {row_id,category,filename,result,score,preview_path?}，flat 顶层字段将稳定返回 422"],
  "risk": ["历史未切换的前端或脚本调用会因 flat payload 被拒绝；需按 v1 canonical shape 迁移"]
}
```

```json
{
  "id": "C-010",
  "ts": "2026-02-14T18:23:00+01:00",
  "status": "CLOSED",
  "scope": "TC-001 daily merge overwrite append sort template",
  "who": {"agent":"agent-b","side":"backend","branch":"feat-backend-v1","head":"4b5284b"},
  "what": ["实现 daily overwrite=按 Datum upsert（存在覆盖，不存在追加）并支持 append 模式始终追加。","实现 daily 月度文件缺失时自动创建空模板 xlsx（含 canonical daily headers）。","实现 daily merge 后按 Datum 升序排序，确保输出确定性。","补充并通过测试：tests/test_merge_parity.py、tests/test_api_schema_v1.py（覆盖 overwrite/append/sort/template/local backend）。","why: 完成 plan_id=20260214-1616 下 TC-001 的后端交付并提供可执行验证证据。"],
  "next": {"goal":"TC-001 backend 已收口，等待前端按 mode 启用 daily append 能力（如需要）。","owner":"agent-a"},
  "risk": ["session_notes.py 当前 argparse 存在重复参数定义，自动日志命令报错；本条按同格式手工补写。"]
}
```

```json
{
  "id": "C-011",
  "ts": "2026-02-14T18:41:00+01:00",
  "status": "OPEN",
  "scope": "plan 20260214-1725-02 backend delivery for TC-003 TC-006",
  "who": {"agent":"agent-b","side":"backend","branch":"feat-backend-v1","head":"4b5284b"},
  "what": ["后端已实现 inputs[].status/error（queued|processing|extracted|failed）并在 worker 生命周期填充。","后端已实现 merge_output.output_path（兼容保留 merged_excel_path）。","已更新 workplan md（task_plan/findings/progress）向前端明确可消费字段与待办。","已更新 todo note：TC-003/TC-006 维持 PLANNED，标记 frontend wiring pending。","why: 按用户要求只推进后端并将前端依赖回写到 plan md。"],
  "dep": ["frontend: 对接 GET /v1/batches/{id} 的 inputs[].status/error 并展示 per-file status。","frontend: 在 merged 态消费 batch.merge_output.output_path 打开结果文件按钮。"],
  "next": {"goal":"等待 frontend 完成 UI 消费后进行联调收口。","owner":"agent-a"}
}
```
