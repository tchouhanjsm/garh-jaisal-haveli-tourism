# Scheduled Agent Setup

This project contains two **opt-in** workflows. Merely merging them does not enable model calls.

## Workflows
- `.github/workflows/autonomous-development.yml`: intended to schedule every 30 minutes. The Codex agent reads project/GitHub state, performs one bounded code change on the runner, runs checks and review passes, and writes a patch artifact. A separate publisher can create a **draft PR** from that patch. It never merges PRs.
- `.github/workflows/strategy-audit.yml`: intended to schedule every two hours. The strategist receives read-only repository permissions and produces an evidence-based audit. A separate reporting job updates the GitHub issue titled “Scheduled Strategy Review”; it does not change repository files or PRs.
- `.github/workflows/site-checks.yml`: lightweight static-site integrity check on pull requests and pushes.

All schedules are UTC. GitHub Actions scheduled events may be delayed under GitHub load. The first workflow uses minute 0/30; the strategy audit runs at minute 23 of every even UTC hour.

## Deliberate opt-in gates
Add these repository Actions variables only after reviewing the costs and credentials:
- `AUTOMATION_ENABLED=true`: enables the 30-minute development agent.
- `STRATEGY_AUDIT_ENABLED=true`: enables the two-hour read-only strategist.
- `AUTOMATION_PUBLISH_PR=true`: enables creation of draft PRs after the publisher token is configured.

Add Actions secrets:
- `OPENAI_API_KEY`: API key for the Codex GitHub Action. **This is separate from a ChatGPT subscription and can incur separate API usage charges.**
- `AUTOMATION_GITHUB_TOKEN`: optional publisher token used only by the separate publisher job. Use a fine-grained token restricted to this repository with Metadata read, Contents read/write, and Pull requests read/write. Never pass it to the Codex agent. A GitHub App installation token is preferable where your account supports that setup.

Keep all enablement variables unset/false until the secrets are configured and you have reviewed the likely usage. An every-30-minute agent can run up to 48 times daily; an every-two-hour strategist can run up to 12 times daily. If each is allowed to call the model every time, API usage may become material. GitHub Actions runner minutes are separate from API usage. The workflows do not enforce a monetary budget; use provider-side usage limits and GitHub billing controls before enabling. The development workflow also pauses additional model runs while an automation-generated PR remains open, to avoid duplicate proposals and repeated API calls.

## Permissions and merge policy
The Codex development job has read-only GitHub API permissions and a workspace-only filesystem profile. It cannot push or create a PR. The publisher job runs separately, receives the publisher token, checks that the default-branch SHA has not changed, enforces the changed-path allowlist and creates a draft PR. The strategist job is read-only; its separate reporting job may write only the strategy issue body.

The owner remains responsible for reviewing and merging PRs. Do not configure an auto-merge bot: owner review is the final gate. Never use automation to bypass branch protection, required reviews, failing checks, or unresolved safety concerns.

## First-time validation
1. Merge the setup PR only after reviewing it.
2. Confirm `site-checks.yml` succeeds on the merge commit.
3. Inspect the repository's current branch protection and required checks. The workflows do not change repository settings.
4. Add `OPENAI_API_KEY` only if API billing is approved.
5. Add `AUTOMATION_GITHUB_TOKEN` only if automated draft-PR creation is approved.
6. Set one enablement variable at a time and use `workflow_dispatch` for a supervised initial run.
7. Verify an artifact/report, inspect the draft PR, and confirm no automated merge occurred.
8. Keep the strategy audit and development agent disabled when not needed.

## Failure and recovery
- If the base SHA changes while an agent is running, publication is stopped rather than applying a stale patch.
- If the patch touches an unapproved path, publication is blocked by `scripts/guard-agent-diff.py`.
- If site or automation checks fail, do not merge; use the actual failing log as evidence.
- If a job fails because credentials are missing, configure the required secret/variable; do not put tokens in files, prompts, logs, or commit history.
- State is persisted in `docs/agent-state.md` through a normal reviewed PR, not written directly to the protected default branch.
