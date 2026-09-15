# Prompt to start or continue implementation in a new session

Copy everything inside the block into a new Claude Code session opened in `D:\deepak\Invoice-Expense`.

```text
Continue implementing the Invoice + Office Expense system in this repo.

Context is already written down — do not re-explore the repo or re-discuss decisions:
1. Read CLAUDE.md (rules, commands, phase gate).
2. Read docs/plans/STATUS.md to find the active phase and next task.
3. Open only the active phase plan in docs/plans/ and work its tasks in order.
4. Consult docs/design/2026-09-15-invoice-expense-system.md and
   docs/design/2026-09-15-design-review.md (binding conditions) only for the sections a task references.

Working rules:
- Before starting a phase, check design §3a sign-off items needed for that phase; if any are not marked confirmed in STATUS.md, ask me first.
- Create the phase branch if it doesn't exist. One plan task per commit; run that task's check before committing.
- Read only the files/functions a task names; use Grep instead of reading large files.
- At each phase end, run the full phase gate from CLAUDE.md and report results; do not start the next phase until I say so.
- If a plan step conflicts with the real code, make the smallest change that honours the design intent, note it in STATUS.md, and tell me.
- At the end of the session, update docs/plans/STATUS.md (done / checks / next / blockers, ≤10 lines).

Start now with the next task listed in STATUS.md.
```
