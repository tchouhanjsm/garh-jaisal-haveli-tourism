## Purpose

<!-- What user-visible problem or engineering risk does this PR address? -->

## Scope

<!-- Summarize the coherent changes. Call out anything deliberately not included. -->

## Acceptance criteria

- [ ] Acceptance criteria are explicit and met.
- [ ] No unrelated refactoring or generated files are included.
- [ ] Property facts, prices, availability, amenities and testimonials are verified.
- [ ] No secrets, credentials, guest data or private operational details are included.

## Validation evidence

- [ ] `bash scripts/check-pr-quality.sh` passes locally, or any unavailable environment is explained.
- [ ] The **latest PR head SHA** has a successful `Website quality gates / required-checks` result when that workflow is available.
- [ ] Any failed check was investigated to the first meaningful failing step, fixed on this branch, and rerun.
- [ ] Browser/mobile/accessibility checks are included when the change affects rendering or interaction.
- [ ] Unexecuted checks are clearly marked as not run; they are not described as passed.

## Review and merge readiness

- [ ] Target branch is `main`.
- [ ] PR is not a duplicate of existing work.
- [ ] Latest head is mergeable and has no conflicts.
- [ ] Required checks are green for the latest head SHA.
- [ ] Required approvals are present and blocking review comments are resolved.
- [ ] The final diff and release impact have been reviewed.

**Do not enable auto-merge or merge this PR just because the PR is marked mergeable.** Auto-merge may be considered only after repository rules require the quality check and appropriate approvals. The repository owner retains final merge authority.
