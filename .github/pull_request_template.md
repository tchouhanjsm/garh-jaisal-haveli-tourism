## Purpose

<!-- What user-facing outcome or engineering risk does this PR address? -->

## Scope

<!-- Summarize the coherent, end-to-end phase, user-visible outcome and deliberate exclusions. -->

## Acceptance criteria

- [ ] This PR delivers one coherent, substantive product/engineering phase (not a stream of micro-tweaks).
- [ ] User-visible outcome and measurable acceptance criteria are explicit.
- [ ] No unrelated refactoring or generated files are included.
- [ ] Property facts, prices, availability, amenities, tour details and testimonials are verified or clearly marked as drafts.
- [ ] No secrets, credentials, guest data or private operational details are included.
- [ ] Content paths, image paths, internal links and publication status follow the content registry.

## Local validation evidence

- [ ] Exact local commands and outcomes are listed in the PR description.
- [ ] `bash scripts/check-pr-quality.sh` was run against a complete checkout, or its exact blocker is explained.
- [ ] Relevant targeted tests and content/schema validations were run.
- [ ] Browser/mobile/accessibility/performance checks are included when they affect this change, or marked not run.
- [ ] Unexecuted checks are clearly marked as not run; they are not described as passed.
- [ ] The final diff was re-fetched and reviewed after the last commit.

## Review and release readiness

- [ ] Target branch is `main`.
- [ ] PR is not duplicating another open PR.
- [ ] Latest branch head is mergeable and has no unresolved conflicts.
- [ ] Required review/approval and ruleset conditions are satisfied.
- [ ] Required quality checks are green for the exact latest head SHA, or absent checks and the reason are explicitly documented.
- [ ] Production/configuration/launch risks are documented and no deployment is performed by this PR.

**Merge only after the full diff is reviewed and every applicable validation, review and ruleset gate passes.** A merge never authorizes production deployment.
