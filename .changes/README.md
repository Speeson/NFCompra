# NFCompra changesets

Pending user-facing changes live in `.changes/pending/*.json`.

Example:

```json
{
  "components": ["android"],
  "type": "patch",
  "category": "fixed",
  "summary": "Corrige el acceso a hogares desde Inicio.",
  "details": ["El botón Acceder abre correctamente el hogar seleccionado."]
}
```

Rules:

- `components`: any of `web`, `api`, `android`.
- `type`: `patch`, `minor`, or `major`.
- `category`: `added`, `changed`, `fixed`, `removed`, or `security`.
- Keep machine-readable metadata (`components`, `type`, `category`) in the canonical values above.
- Write user-facing `summary` and `details` in Spanish.
- Android GitHub Release notes are generated in Spanish from Android changesets.
- Do not create changesets for docs-only, screenshot, comment-only, or CI-only changes.
- Changesets are release metadata and do not trigger deployment impact.
