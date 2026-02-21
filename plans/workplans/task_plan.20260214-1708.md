# Task Plan: 20260214-1708

## Goal
Implement TC-002 on frontend: highlight review items that require manual check, reusing existing low-confidence highlight behavior.

## Scope
- TC-002: review界面要highlight 带审查的项目（复用）

## Owner
- agent-a

## Current Phase
Phase 5

## Phases
### Phase 1: Requirements & Discovery
- [x] Confirm selected tasks and constraints
- [x] Identify reusable highlight logic and target page
- [x] Confirm frontend-only change boundary
- **Status:** complete

### Phase 2: Planning & Structure
- [x] Define implementation sequence for reuse-first approach
- [x] Define test coverage for highlight behavior on manual review page
- [x] Confirm dependencies and risks
- **Status:** complete

### Phase 3: Implementation
- [x] Extract low-confidence decision helper into shared utility
- [x] Apply highlight class on editable cells in ManualReview page table flow
- [x] Keep existing ReviewCategoryTable behavior unchanged (regression-safe reuse)
- **Status:** complete

### Phase 4: Testing & Verification
- [x] Add/adjust tests for ManualReview highlight behavior
- [x] Run focused frontend tests for review components/pages
- [x] Record validation results
- **Status:** complete

### Phase 5: Delivery
- [x] Update `plans/todo_current.md` status when implementation completes
- [x] Append `SESSION_NOTES.md` with implementation + test evidence
- [x] Summarize residual risks and follow-up suggestions
- **Status:** complete
