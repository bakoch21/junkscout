# Rollout Approval Flow

This document defines a safer publish process for city rollout planning.

## Source files

- Backlog input (not executable): `c:\Users\Baron\test script for jnkscout\loadup_rollout_schedule.csv`
- Execution queue (authoritative for rollout approvals): `planning/rollout_execution.csv`
- State gate registry: `planning/state_registry.json`
- Quality gate command: `npm run verify:rollout`
  - This enforces only rows queued for publish (`ready_for_publish=true`).
  - Use `npm run verify:rollout:strict` for a full audit of live, candidate, and backlog rows.

## Core rules

- The backlog CSV is planning-only and must never directly trigger publishing.
- A city can publish only when both city and state gates are open.
- Unsupported states stay blocked until state onboarding is approved.
- Anchor cities require manual quality tier before publishing.

## City publish gate

A row is eligible only if all are true:

- `state_enabled=true`
- `ready_for_publish=true`
- `qa_status=approved`
- `approved_at` is set
- `publish_after` is set and `publish_after <= today`
- `published_at` is empty

## Quality gate (SEO risk control)

- `anchor` tier: `manual_required=true`, at least `8` facilities, at least `3` official sources.
- `secondary` tier: at least `5` facilities, at least `2` official sources.
- `long_tail` tier: at least `3` facilities, at least `2` official sources.
- `uniqueness_reviewed=true` before approval.
- No placeholder visible addresses/hours for rendered cards.

## Weekly approval workflow

1. Pull next candidate set from `planning/rollout_execution.csv`.
2. Filter by supported states from `planning/state_registry.json`.
3. QA pass for sourcing, uniqueness, and thin-content checks.
   - Use `npm run verify:rollout` for normal approval checks.
   - Use `npm run verify:rollout:strict` when you want backlog and candidate rows to fail hard instead of warning.
4. Mark approved rows:
   - `ready_for_publish=true`
   - `qa_status=approved`
   - `approved_by`
   - `approved_at`
   - `publish_after`
5. Publish only approved rows whose `publish_after` is reached.
6. Post-publish update:
   - set `published_at`
   - set `source_status=live`
   - log regressions in `hold_reason` if rollback is needed.

## State onboarding workflow

1. Add state infra support in build/sitemap/search pipeline.
2. Add city list and run smoke checks.
3. Pilot 3-5 anchor cities.
4. Review indexing and quality signals after pilot window.
5. Update `planning/state_registry.json`:
   - `phase=enabled`
   - `state_enabled=true`
6. Only then move backlog cities for that state into execution.

## Suggested pacing

- Default pace: 20-30 cities per week.
- Use 40 per week only when most rows are already `qa_status=approved`.
- Keep rollout ordered by impact:
  - `anchor`
  - `secondary`
  - `long_tail`
