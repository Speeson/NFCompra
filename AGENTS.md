# Instrucciones para agentes de NFCompra

## Operaciones remotas

- No ejecutes `git push`.
- No crees pull requests, releases ni etiquetas remotas.
- No despliegues en Cloudflare, Vercel, GitHub Actions ni ningún servicio externo.
- No envíes correos ni uses credenciales externas.
- Cualquier operación remota requiere permiso explícito y previo de la persona usuaria en esta conversación.

Los commits locales solicitados por un plan están permitidos; no envían cambios a GitHub.

## Documentación

- Tras cada tarea implementada y revisada, actualiza `README.md` para reflejar únicamente comandos, requisitos y estado que ya existan y estén verificados.
- No documentes secretos ni valores de configuración privados.

## Response style

- Be concise and action-oriented.
- Do not explain your reasoning unless explicitly asked.
- Do not provide tutorials or background information.
- When asked to modify code, perform the modification directly.
- Avoid repeating the user's request.
- Do not describe every tool call or file inspection.
- After completing a task, respond only with:
  - files modified
  - brief summary of changes
  - build/test result
  - any blocking issue
- Keep the final response under 8 lines unless more detail is explicitly requested.

## Validation after changes

- After making any code change, always run the appropriate build or compilation command for the affected project.
- If the build fails, inspect the error, fix it, and run the build again.
- Repeat until the build succeeds or there is a genuine blocking issue.
- Do not stop after editing files without validating the result.
- Do not claim success unless the final build/compilation succeeds.