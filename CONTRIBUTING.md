# Development workflow

Use Node 24 LTS and the exact pnpm version in package.json. Read AGENTS.md and CONSTRAINTS.md first.

## Git

- `main` is the integration branch. Work on short-lived `feat/`, `fix/`, `docs/` or `chore/` branches.
- Commit one coherent verified slice using Conventional Commits. Keep tests with the behavior they prove; keep formatting/refactors separate.
- Run the relevant focused test while editing, then the full implemented-slice checks, browser gate and staged diff review before commit.
- Review correctness, simplicity, architecture, security and performance before merge. Prefer a squash merge for one reviewed feature or retain its coherent commits; do not force-push a shared branch.
- Commit pnpm-lock.yaml and intentional generated route types. Never commit environment values, build output, node_modules or local runtime state.
- Do not fabricate checks, skip tests or weaken constraints. A bug found in the browser gets a reproduction test and a focused fix.

This workspace began without Git. The initial commit preserves existing research. No remote repository is configured yet; no hosted PR, branch protection or CI run is claimed. Configure protected `main` with required checks and review when a remote is attached. Local feature commits remain available for review.

## Development cycle

1. Select the next bounded task and acceptance criteria.
2. Write a failing behavior/abuse test, then the simplest implementation.
3. Test the real Worker API and build the application.
4. In the browser, complete the feature as a normal user, power user and adversarial user; use local/staging synthetic data.
5. Measure bundle/runtime changes and audit dependencies.
6. Record evidence, inspect the diff, commit, and continue to the next slice.

Do not label a validation preview as a submitted or persisted response. Database/auth/files/payments require their real integrations and failure tests before the corresponding feature is shipped. No production deployment or live payment is implicit in a local implementation task.
