# Development and Local Validation Workflow

This repository uses a branch-first, reviewable PR process. The local runner remains available for developer validation, and the `Site quality gates` GitHub Actions workflow runs the same consolidated check script on PRs to `main` and pushes to `main` and supported implementation branches. GitHub Actions is CI only, not the development scheduler. Judge checks by the exact current head SHA; old or absent runs are not evidence of a pass.

## Sequential PR rule

Do not open a new PR while any earlier PR remains open/unmerged. Continue the oldest active PR, resolve blockers, complete validation and review gates, and use the authorized GitHub merge pathway only when the exact final head is ready. Start the next bulk phase only after GitHub confirms the previous PR is merged. Do not create duplicate feature PRs.

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
   - For tour/blog record changes, run `node scripts/build-content-pages.js --write` after owner-approved facts/config are recorded; it writes only eligible live pages and updates only its marked sitemap block.
   - Use `bash scripts/check-pr-quality.sh` when the complete repository checkout and its dependencies are available. It runs renderer `--check`, renderer regression tests, static-site checks and content-contract tests.
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
   - Keep the PR open until validation and required review gates pass. The user has authorized the engineering agent to merge only after tests pass on the exact final head, the diff review is clean, the PR is non-draft and mergeable, and all required approvals/policy conditions are satisfied. Prefer auto-merge when enabled; if unavailable, use the normal PR merge action only when every gate passes. Never deploy as a consequence of merging.
   - Never open a second PR while a previous PR remains open/unmerged.

## Local validation policy

- `scripts/check-pr-quality.sh` is the shared quality suite for local runs and GitHub Actions. The workflow uses standard GitHub-hosted runners on this public repository; standard runners are free for public repositories.
- The suite must not require a GitHub API, cloud service or network connection unless a specific test explicitly documents that requirement.
- Use a full checkout where possible. The checker must fail loudly for an executed test failure; do not weaken assertions to turn a failure green.
- If this environment cannot obtain a full repository checkout or required test input, run only tests that are safe and complete, mark the rest “not run,” and report the exact blocker.

## Content publication safeguards

- Content paths are chosen by `content/paths.json`; editors must not type arbitrary destination paths.
- New tours, articles and gallery assets start as drafts and stay out of public navigation/sitemap until approved.
- Tour prices, timings, duration, routes, transport, guides, availability and inclusions require owner confirmation. Draft status, complete fields or a high content score do not prove factual truth.
- Preserve all existing public routes while the new static tour/blog renderer and canonical URL policy are developed and tested.
- Booking and contact endpoints recovered from the legacy site are marked unverified. Test them and obtain owner approval before activating new CTAs.
- Production deployment remains a separate action and is never authorized by a source merge.

## Auto-merge and merge gates

The repository-level auto-merge setting is currently disabled. The new workflow reports the job `Site quality gates / quality`; the `gjh-tourism` ruleset currently has no required status checks, so the repository owner should add that exact check to the ruleset after the workflow has run successfully. Enable repository auto-merge in settings if desired. If auto-merge remains unavailable, the authorized engineering agent may use the ordinary PR merge action only after the exact-head quality check is green, the full diff review is clean, and all review/ruleset conditions pass. If checks or approvals are missing, leave the PR open and report the blocker.
