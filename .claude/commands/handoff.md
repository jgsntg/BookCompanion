Write a handoff document for this session.

1. Run `git status` and `git log -5 --oneline` to capture branch and recent commits.
2. Read `.ai/handoffs/TEMPLATE.md` for the format.
3. Pick a slug describing the work (e.g., `auth-refactor`, `api-cleanup`).
4. Write the handoff to `.ai/handoffs/YYYY-MM-DD-<slug>.md` using today's date. Fill in every section. If a section genuinely doesn't apply, write "None" rather than deleting it.
5. Update `.ai/handoffs/CURRENT.md` to be a symlink (or copy, if symlinks aren't viable) pointing to the new handoff.
6. Show me the handoff path and a 3-line summary of what you wrote. Do not commit — I'll review first.
