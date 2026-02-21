# Task Plan: 20260221-TC-105

## Goal
Optimize Web API main pipeline async flow for lower latency:
- Early skip extraction for over-max-pages inputs.
- Run extraction and archive compression in parallel.
- Join both branches before final organized renaming.

## Scope
- Target path: `src/bills_analysis/integrations/local_backend.py`
- Keep API/schema contract unchanged.
- Add configurable concurrency/rate limits via env vars.

## Current Phase
Phase 2

## Phases
### Phase 1: Requirements & Discovery
- [x] Confirm selected task and constraints
- [x] Confirm skip policy (skip extract, keep archive)
- [x] Confirm optimization path (precheck -> parallel fan-out -> join)
- **Status:** complete

### Phase 2: Planning & Worktree Bootstrap
- [x] Persist plan artifacts and bind `TC-105`
- [x] Create task worktree and sync local configs
- [x] Initialize backend/frontend environments
- **Status:** in_progress

### Phase 3: Backend Async Refactor
- [ ] Refactor per-file pipeline into staged orchestration
- [ ] Add early page-count gate before extraction scheduling
- [ ] Add bounded concurrency/rate limits for extraction
- [ ] Keep organized rename behavior on join stage
- **Status:** pending

### Phase 4: Tests & Verification
- [ ] Update/add tests for over-max-pages early skip behavior
- [ ] Add tests for parallel branch execution and bounded concurrency
- [ ] Run targeted backend and contract tests
- **Status:** pending

### Phase 5: Delivery
- [ ] Update findings/progress with final evidence
- [ ] Set `TC-105` to DONE in `plans/todo_current.md`
- [ ] Prepare merge-ready summary
- **Status:** pending
