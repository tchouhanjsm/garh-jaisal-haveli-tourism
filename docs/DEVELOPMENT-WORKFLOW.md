# Development and Local Validation Workflow

This repository uses a branch-first, reviewable PR process. The development agent runs validation directly in its available execution environment; GitHub Actions is not used for CI or as the agent scheduler. GitHub status runs may still exist from earlier commits, but they are historical evidence only and are not the source of truth for validation.

## Sequential PR rule

Do not open a new PR while any earlier PR remains open/unmerged. Continue the oldest active PR, resolve its blockers, complete local validation, and leave it open for the owner to review and merge. Only begin the next PR after the previous PR is merged. Do not create duplicate feature PRs.

## Required sequence

1. **Inspect before coding**
   - Read the latest `main` SHA, repository instructions, open PRs, relevant files and current GitHub statuses.
   - Recover an interrupted or blocked PR before other feature work.
   - Confirm the task is not already represented by an open PR.

2. **Branch and implement**
   - Work only on a feature branch; do not commit directly to `main`.
   - Implement one coherent, high-value phase rather than a series of cosmetic file changes.
   - Add regression tests and update relevant docs as part of the feature where practical.
   - Do not invent property facts, rates, availability, amenities, testimonials, or tour inclusions.

3. **Run local validation**
   - Use `bash scripts/check-pr-quality.sh` when the complete repository checkout and its dependencies are available.
   - The consolidated local checker calls `bash scripts/check-site.sh`, available navigation/image tests, Python compilation, shell syntax checks, and the content contract validator/tests.
   - Run HTML/content validations and targeted regression tests directly when the change affects those areas.
   - A command is “passed” only if it was executed and returned success. Missing source files or an incomplete checkout means that check was skipped/blocked, not passed.
   - Record the exact commands and results. Do not use GitHub Actions status to substitute for a local execution.
   - Do not claim browser/device, accessibility, Lighthouse, or performance checks unless they ran.

4. **Inspect the change**
   - Re-fetch the latest source and inspect the complete PR diff after edits.
   - Check relative URLs, asset paths, canonical/SEO metadata, content publication status, and the changed-file scope.
   - Confirm the local run was against the latest checked-out PR commit; if not, state the mismatch.

5. **Open/update the sole active PR**
   - State purpose, scope, acceptance criteria, tested commands, unexecuted checks and known risks.
   - Keep the PR open for owner review. Do not merge, deploy, force-push, alter production, or bypass repository policy.
   - Never open a second PR while a previous PR remains open/unmerged.

## Local validation policy

- GitHub Actions CI has been removed to avoid relying on paid/limited hosted-runner minutes.
- `scripts/check-pr-quality.sh` is a **local runner only**. It must not require a GitHub API, cloud runner or network connection unless a specific test explicitly documents that requirement.
- Use a full checkout where possible. The checker must fail loudly for an executed test failure; do not weaken assertions to turn a failure green.
- If this environment cannot obtain a full repository checkout or required test input, run only tests that are safe and complete, mark the rest “not run,” and report the exact blocker.

## Content publication safeguards

- Content paths are chosen by `content/paths.json`; editors must not type arbitrary destination paths.
- New tours, articles and gallery assets start as drafts and stay out of public navigation/sitemap until approved.
- Tour prices, timings, duration, routes, transport, guides, availability and inclusions require owner confirmation. Draft status, complete fields or a high content score do not prove factual truth.
- Preserve all existing public routes while the new static tour/blog renderer and canonical URL policy are developed and tested.
- Booking and contact endpoints recovered from the legacy site are marked unverified. Test them and obtain owner approval before activating new CTAs.
- The owner retains final PR review, merge and production deployment authority.

## Auto-merge limitation

The repository-level auto-merge setting is currently disabled. The connected GitHub tools cannot change that setting. Since CI is intentionally removed, a missing GitHub check must never be described as green. Do not enable per-PR auto-merge or treat it as a substitute for the owner's review. The owner must perform the final merge after reviewing documented local validation evidence.
