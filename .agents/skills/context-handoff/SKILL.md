---
name: context-handoff
description: Distill noisy task conversations in the current session into carry-forward context for the next session. Use when the user asks to summarize/condense current progress, keep only high-signal decisions, and persist context by updating CLAUDE.md (if necessary) and appending one JSONL handoff record through scripts/session_notes.py log.
---

# Context Handoff

Execute this workflow when the user asks to "提炼上下文", "总结本轮", "保留核心信息", or equivalent.

## 1) Distill only carry-forward context

Extract only information that helps the next session make decisions quickly.

Keep:
- contract/version decisions
- milestone and current phase updates
- architecture/boundary constraints
- cross-agent dependencies (`dep`)
- real risks/technical debt (`risk`)
- explicit next goal and owner (`next`)

Drop:
- chat noise, failed attempts, repetitive discussion
- temporary implementation details without future impact
- logs that do not affect next decisions

## 2) Decide where context should live

Use this split strictly:

- Update `CLAUDE.md` only for stable, project-level memory:
  - workflow conventions
  - contract policy
  - collaboration boundary rules
  - long-lived milestone status changes

- Append `SESSION_NOTES.md` (JSONL) for session-level handoff:
  - what was done (+ why)
  - dependency on another side
  - current risk
  - immediate next step

If a point is not stable enough for project policy, do not write it into `CLAUDE.md`.

## 3) Write one consolidated handoff entry

Append exactly one summary entry via:

```bash
python scripts/session_notes.py log \
  --scope "<scope>" \
  --agent "<agent>" \
  --side "<frontend|backend>" \
  --what "<key change 1>" \
  --what "<key change 2>" \
  --why "<motivation>" \
  --next-goal "<next goal>" \
  --next-owner "<owner>" \
  --dep "<optional dependency>" \
  --risk "<optional risk>"
```

Rules:
- `status` is always `OPEN` (handled by script).
- Prefer 1-3 `--what` items, each action-oriented.
- Add `--dep` only when another side must act.
- Add `--risk` only when debt/prototype risk is real.

## 4) Output format to user

Return a compact summary with:
- what was distilled
- what was written to `CLAUDE.md`
- the JSONL handoff id appended to `SESSION_NOTES.md`
- what was intentionally excluded as noise

## 5) Quality bar

Before finalizing:
- Ensure no contradiction with existing `CLAUDE.md` rules.
- Ensure handoff is decision-complete for next session.
- Ensure no sensitive secret is written into `CLAUDE.md` or `SESSION_NOTES.md`.




