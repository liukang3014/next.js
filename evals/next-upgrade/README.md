# Next.js upgrade evals

This suite extends the existing `@vercel/agent-eval` setup. It keeps the fixture's
old Next.js installed and exposes the separately packed candidate for `next upgrade`.
Other `next` commands continue to use the application's runtime.

## Run

Use the existing [eval credential setup](../README.md#one-time-setup): `vc link`
and `vc env pull` at the repo root. Both runners share environment-file linking
and package packing. Authentication, sandbox selection, native agents, withheld
assertions, judging and result storage belong to `@vercel/agent-eval`.

```sh
pnpm build-all
pnpm eval:upgrade <fixture-name> --dry
NEXT_UPGRADE_EVAL_EXPERIMENT=codex pnpm eval:upgrade <fixture-name>
```

Omit the experiment filter to run Codex and Claude. `--list` lists fixtures without
packing or making model calls. Run one named fixture at a time. Results use the
framework's normal `results/` layout. Fixtures are added by the feature PRs stacked
above this infrastructure.

## Lifecycle

1. Restore the fixture's lockfile and ignore rules after agent-eval initializes Git.
2. Install the pinned app, reuse `installPlaywright` and `prepareFixture`, and
   install candidate Next.js separately.
3. Upload the candidate codemod archive for feature evals, route the app's
   `.bin/next` launcher to the candidate upgrade CLI, verify the manifest and
   lockfile, and commit the prepared fixture.
4. Let the framework relocate its workspace and install the native agents and
   judge. Both derived definitions suppress only their redundant app install.
5. Run the unchanged native agent and judge. The framework withholds `EVAL.ts` and
   captures transcripts and results as usual.

Package archives remain fixed for each run, including concurrent runs. Invalid
fixtures fail before execution, and infrastructure failures remain in the results.
No new dependency is required. `experiment.ts` isolates one pinned private
orchestrator import because agent-eval 2.2.1 exports native definitions but not
the orchestrator needed to remove its redundant app install. Revalidate this
adapter when upgrading that dependency.

## Adding feature coverage

Feature PRs add ordinary app fixtures with `PROMPT.md`, `EVAL.ts`, and a pinned
`pnpm-lock.yaml`. They own scenario setup, repository remotes, advisory responses,
grading, and reference or negative controls. The framework removes `origin` while
preparing the neutral workspace, so a scenario that needs a remote must add it
from its own runner. Keep graders and reference solutions withheld, and retain
sandbox or authentication failures as failures.
