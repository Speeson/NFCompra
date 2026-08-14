# Android zero-households plan

1. Replace blocking `NoHouseholds` publication with an authenticated empty `Data` state and clear selected list data.
2. Add lightweight pending invitation notice inputs to the shopping shell.
3. Build Home zero-household UI for pending-invitation and no-invitation cases.
4. Keep Households/Profile available and guard Lists navigation when no household exists.
5. Wire `MainActivity` notification state/actions into the shopping shell using existing sharing actions.
6. Add focused unit/UI tests for zero households, creation, stale state clearing, and invitation empty state.
7. Run Android validation and review the diff.
8. Update `docs/AGENT_CONTEXT.md` and write the final SDD report.
