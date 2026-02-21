# Task Plan: 20260214-1616

## Goal
Implement TC-001 on backend: daily merge supports overwrite-by-datum, append+sort, and auto-create monthly template workbook when missing.

## Scope
- TC-001: daily要支持：
  1) 按 datum 覆盖已有项目；
  2) 追加新的条目，并且排序；
  3) monthly 文件不存在时自动创建空模板 xlsx。

## Owner
- agent-b (backend)

## Current Phase
Phase 2

## Phases
### Phase 1: Requirements & Discovery
- [x] Confirm selected tasks and constraints
- [x] Identify current backend merge behavior and API constraints
- [x] Confirm frontend/backed role boundary
- **Status:** complete

### Phase 2: Planning & Structure
- [x] Define implementation sequence and compatibility strategy
- [x] Freeze contract: keep MergeRequest mode as overwrite|append
- [x] Define daily template + sorting behavior
- **Status:** complete

### Phase 3: Implementation
- [ ] Update `excel_merge_adapter.merge_daily_excel` to support:
  - overwrite upsert by Datum
  - append mode
  - create monthly workbook if missing
  - sort rows by Datum asc
- [ ] Update `services/merge_service.merge_daily` signature and pass-through args
- [ ] Update `integrations/local_backend.merge_batch` daily branch to honor mode
- **Status:** pending

### Phase 4: Testing & Verification
- [ ] Add/adjust tests for:
  - overwrite existing datum
  - overwrite when datum missing -> append
  - append duplicate datum
  - create monthly workbook when missing
  - sort correctness
- [ ] Ensure office merge tests remain green
- [ ] Ensure schema tests remain compatible
- **Status:** pending

### Phase 5: Delivery
- [ ] Update SESSION_NOTES with behavior change details and residual risks
- [ ] Mark TC-001 as DONE with same plan_id
- **Status:** pending