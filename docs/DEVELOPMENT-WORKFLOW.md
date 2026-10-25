# Development and Merge Workflow

This repository uses a branch-first, pull-request-based delivery process. The ChatGPT scheduler may help with engineering work and GitHub inspection, but it is not replaced by GitHub Actions. The workflow below is a CI/check gate only; it is not a scheduled coding agent.

## Sequential PR rule

Do not open a new PR while any earlier PR remains open/unmerged. Continue the oldest relevant open PR, fix and validate it, and only begin the next PR after it is merged. Keep the site’s Content Studio integration on the existing PR branch if that is the current active PR. Do not create duplicate feature PRs.

## Required sequence

1. **Inspect before coding**
   - Read the latest `main` SHA, repository instructions, open PRs, CI results and relevant files.
   - Recover a failing or interrupted PR before starting overlapping work.
   - Confirm the task is not already being implemented.

2. **Create a feature branch**
   - Start from the latest `main`.
   - Use a descriptive name such as `fix/mobile-nav-focus`, `feat/room-enquiry` or `test/pr-quality-gates`.
   - Do not commit application changes directly to `main`.

3. **Implement and commit**
   - Make a coherent, reviewable change.
   - Add or update regression tests for the behavior being changed.
   - Use meaningful commit messages.
   - Run `bash scripts/check-pr-quality.sh` before opening or updating the PR when possible.

4. **Open a PR targeting `main`**
   - State the problem, solution, acceptance criteria, test evidence and known limitations.
   - Keep unrelated changes out of the PR.
   - Never claim a browser test, performance measurement or CI check ran when it did not.

5. **Wait for checks on the exact latest PR head**
   - The intended required status check is **`Website quality gates / required-checks`**.
   - A green check is valid only for the current head SHA. New commits invalidate earlier conclusions until their checks complete.
   - Treat missing checks as **not reported**, not as passed.
   - Treat cancelled runs as cancelled. If an older run was cancelled because a new commit superseded it, inspect the new run for the latest SHA.

6. **If a check fails, fix the cause**
   - Open the actual failing job and identify the first meaningful failed step.
   - Determine whether the cause is a code defect, test defect, dependency/environment problem or transient infrastructure issue.
   - Fix the cause on the same PR branch and add a regression test where useful.
   - Commit and push the fix, then wait for checks to complete again on the new head SHA.
   - Retry a transient failure only when evidence supports that classification. Do not repeatedly rerun deterministic failures without changing the cause.
   - Never delete tests, weaken assertions, suppress errors, bypass checks or merge around a failure.

7. **Review merge readiness**
   Merge is allowed only when all applicable conditions hold:
   - [ ] All required checks are successful on the latest PR head SHA.
   - [ ] Required human review/approval is satisfied.
   - [ ] No unresolved blocking review comments remain.
   - [ ] The PR targets `main` and has no unresolved merge conflict.
   - [ ] The final diff and release impact have been reviewed.
   - [ ] No production, migration, security or content-approval gate is outstanding.

8. **Merge and verify**
   - Use the repository's approved merge method.
   - The repository owner performs final review and merge.
   - After merge, verify the merge commit on `main`, check its status, and confirm the intended changes are present.
   - Never deploy to production as an automatic consequence of merging.

## Auto-merge policy

The desired delivery mode is auto-merge for the sole active PR only after all expected checks pass on its exact latest head, it is not a draft, it is mergeable, and all required reviews are satisfied. If repository-level auto-merge is disabled and no supported settings action or plan capability is available, report the owner-side blocker; never claim it is enabled.

**Auto-merge must remain disabled for any PR with missing, pending, cancelled, or failed checks.** A PR being “mergeable” is not the same as being tested or approved.

Before considering auto-merge, the owner must:
1. Merge the bootstrap quality-check workflow after reviewing it; a workflow added for the first time cannot provide a pull-request check from a workflow that does not yet exist on the base branch.
2. Confirm the workflow completes successfully on a subsequent test PR and on the merged default branch.
3. Configure a GitHub branch rule/ruleset for `main` that requires pull requests and the exact check context `Website quality gates / required-checks`.
4. Require appropriate approvals and, where available, resolution of review conversations; restrict direct pushes/bypasses.
5. Confirm the required check cannot be skipped by changing paths or by using a draft/no-op update, and that failure blocks merge.
6. Verify the latest head SHA has the required green status before enabling auto-merge.

The connected repository tools used by the development agent do not configure branch protection rules. Apply and verify those rules in GitHub repository settings as an owner action. Do not claim the rules are enforced until they have been confirmed.

## What the PR quality check covers

The workflow is intentionally non-scheduled and does not call an AI API. It invokes `scripts/check-pr-quality.sh`, which runs:
- The existing static site integrity checker.
- Available mobile navigation and image-localization regression tests when present.
- Python source compilation.
- JavaScript checks through the project's normal test script when Node.js is available.
- Shell syntax checks.
- Patch whitespace checks for pull requests.

This is a lightweight initial gate, not a replacement for visual device testing, accessibility review, security review, or production UAT. Add tests when new functionality introduces new failure modes.

## Bootstrap exception and cost

The very first PR adding `.github/workflows/website-quality-gates.yml` cannot receive a check from that same new workflow until the workflow exists on `main`. Review the workflow and run the available local checks manually before merging this one bootstrap PR. After it is merged, confirm the workflow runs successfully on a separate test PR before making the check required.

The workflow uses a GitHub-hosted runner and therefore consumes Actions minutes. It is not scheduled and does not invoke a model/API. Keep this job short and avoid adding expensive browser matrices or third-party services without approval.
