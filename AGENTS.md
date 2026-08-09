# NFCompra Agent Instructions

## Scope and efficiency

- Act as a coding agent, not a tutor.
- Be concise and action-oriented.
- Do not explain reasoning unless explicitly asked.
- Do not repeat the user's request.
- Do not narrate searches, tool calls, edits, or intermediate steps.
- Read only files relevant to the current task.
- Avoid unnecessary repository exploration.
- Reuse information already discovered in the current session.
- Make the smallest change necessary.
- Do not refactor, reformat, rename, or modify unrelated code unless required.

NFCompra is a monorepo:
- `apps/android`: Android app
- `apps/web`: Web app
- `apps/api`: API/backend
- `docs`: Documentation

If a task concerns one app, stay inside that app unless another module is strictly required.

For Android tasks:
- Prefer existing Compose components, theme values, colors, dimensions, and patterns.
- Preserve existing navigation, business logic, architecture, and visual style unless the task requires changing them.
- Use adaptive layouts instead of dimensions tied to one specific device or resolution.

## Project context

`docs/AGENT_CONTEXT.md` is the concise persistent context for the project.

- At the start of a new session, read `docs/AGENT_CONTEXT.md` when the task depends on previous project state, recent work, architecture, or prior decisions.
- Do not read it when the task is completely self-contained and previous context is irrelevant.
- Treat it as context, not as absolute truth. Verify important details against the current code when necessary.
- Do not inspect Git history merely to reconstruct previous work if `AGENT_CONTEXT.md` already contains enough information.
- Keep `AGENT_CONTEXT.md` concise.
- Do not turn it into a changelog or session transcript.
- Remove or replace obsolete information rather than endlessly appending to it.
- Only store verified project facts, important decisions, current work, validation commands, and relevant limitations.
- Do not store reasoning, verbose explanations, secrets, credentials, or temporary debugging details.

After completing a task, update `docs/AGENT_CONTEXT.md` only if the task changes:
- important project state;
- architecture or implementation decisions;
- active work or known limitations;
- important build/test commands;
- information likely to be needed in a future session.

Do not update it for trivial cosmetic changes unless they affect future work.

## Remote operations

- Do not run `git push` unless explicitly requested by the user in the current conversation.
- Do not create pull requests, releases, or remote tags unless explicitly requested.
- Do not deploy to Cloudflare, Vercel, GitHub Actions, or other external services unless explicitly requested.
- Do not send emails or use external credentials unless explicitly requested.
- Local commits are allowed when requested.
- Never force-push.
- Never rewrite Git history.
- Before committing, verify that only task-related files are staged.
- Do not commit local-only configuration such as `opencode.json`.

## Documentation

- After an implemented and validated task, update `README.md` only when the task changes documented behavior, commands, requirements, or verified project status.
- Do not make unnecessary README changes.
- Never document secrets or private configuration values.

## Validation

After any code change:

1. Run the narrowest relevant build or test.
2. If it fails, inspect the error and fix it.
3. Run validation again.
4. Repeat until it succeeds or a genuine blocker remains.

- Do not stop after editing without validation.
- Do not claim success unless validation succeeds.
- For Android code changes, always compile the affected Android project.

## Final response

Keep the final response under 8 lines unless more detail is requested.

Report only:
- modified files;
- brief summary;
- build/test command;
- result;
- blocker, if any.

Do not provide tutorials, background information, suggestions, or next steps unless explicitly requested.