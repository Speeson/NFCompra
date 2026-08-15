# Plan CI/CD selectivo

1. Auditar estructura real, scripts, Vercel, Wrangler, Android, GitHub Actions y estado Git.
2. Implementar `scripts/deploy-impact.mjs` con salida texto, JSON y GitHub outputs.
3. Implementar tests de impacto y escenarios de cambios.
4. Implementar changesets, versionado Android y generacion de changelog.
5. Crear skill `.agents/skills/deploy-impact`.
6. Crear workflows GitHub reutilizables y orquestador manual/automatico.
7. Integrar Vercel `ignoreCommand` y scripts npm locales.
8. Documentar arquitectura, secretos, manuales y troubleshooting.
9. Validar scripts, YAML, workflows, builds razonables y revisar diff.
