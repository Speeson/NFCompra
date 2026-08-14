# Account deletion plan

1. Audit D1 user relationships and confirm membership timestamp.
2. Implement shared account deletion planner/service.
3. Add `DELETE /v1/me` and API tests for ownership transfer, cleanup, password failure, and token rejection.
4. Add local admin `admin:delete-user` command with dry-run and confirmation.
5. Add Web and Android account-deletion UI and local cleanup.
6. Validate API, Web, Android, run review, and update project context.
