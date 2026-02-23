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
Phase 5

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
- **Status:** complete

### Phase 3: Backend Async Refactor
- [x] Refactor per-file pipeline into staged orchestration
- [x] Add early page-count gate before extraction scheduling
- [x] Add bounded concurrency/rate limits for extraction
- [x] Keep organized rename behavior on join stage
- **Status:** complete

### Phase 4: Tests & Verification
- [x] Update/add tests for over-max-pages early skip behavior
- [x] Add tests for parallel branch execution and bounded concurrency
- [x] Run targeted backend and contract tests
- **Status:** complete

### Phase 5: Delivery
- [x] Update findings/progress with final evidence
- [x] Set `TC-105` to DONE in `plans/todo_current.md`
- [x] Prepare merge-ready summary
- **Status:** complete
