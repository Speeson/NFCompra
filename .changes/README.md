# NFCompra changesets

Pending user-facing changes live in `.changes/pending/*.json`.

Example:

```json
{
  "components": ["android"],
  "type": "minor",
  "category": "added",
  "summary": "Added account deletion from Settings.",
  "details": ["Deletes local session data after the account is removed."]
}
```

Rules:

- `components`: any of `web`, `api`, `android`.
- `type`: `patch`, `minor`, or `major`.
- `category`: `added`, `changed`, `fixed`, `removed`, or `security`.
- Do not create changesets for docs-only, screenshot, comment-only, or CI-only changes.
- Changesets are release metadata and do not trigger deployment impact.
