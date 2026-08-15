---
name: deploy-impact
description: Use after completing and verifying NFCompra changes, before final reporting or release planning, to run the repository Deployment Impact logic, report affected Web/API/Android components, required deployments/releases, Android version suggestion, and changeset status. Also use when asked what must be deployed or released. Never use model-only reasoning for impact.
---

# NFCompra Deploy Impact

Run the repo script; do not infer impact from memory.

## Workflow

1. Run:

```sh
npm run deploy:impact -- --format json
```

2. If Android is changed, run:

```sh
npm run android:release-plan -- --format json
```

3. Validate pending changesets when product behavior changed:

```sh
npm run changeset:validate
```

4. Report:
- Web/API/Android changed or skipped.
- Validations/builds/tests actually run.
- Deployment required: Web via Vercel, API via Wrangler, Android via GitHub Release.
- Android current and suggested next version when applicable.
- Pending changesets or missing changesets.

## Rules

- Do not push.
- Do not deploy.
- Do not create tags or GitHub Releases unless the user explicitly asks in the same turn.
- Do not decide changed components using only file names remembered from the conversation; use `scripts/deploy-impact.mjs`.
- Create a `.changes/pending/*.json` changeset for user-facing product behavior changes.
- Do not create changesets for docs-only, screenshots, comments, or CI-only changes.
- Write user-facing changeset `summary` and `details` in Spanish.
- Keep machine-readable metadata such as `components`, `type`, and `category` in the repository's canonical values; do not translate schema values, code identifiers, enum values, or filenames.
- Android GitHub Release notes are generated in Spanish by default.
- If Android changed and pending changesets include `minor`, suggest a minor bump; if any include `major`, suggest major; otherwise patch.
