# @metis/ui — rules for any agent

- `README.md` is the UI standard for every Metis dashboard. **Change a component, token,
  icon or behaviour → update README.md and CHANGELOG.md in the same commit.**
- Run `node check.mjs` before committing: it fails if an export has no README section.
- No new runtime dependency. No raw colours: add a `--mx-*` token in `src/tokens.css`.
- Presentational only: figures arrive computed; the kit never derives a business number.
- After a change, `npm run ui:sync` + type-check in every app that uses the kit (today: `stoa/`).
