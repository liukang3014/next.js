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
packing or making model calls. Results use the framework's normal `results/` layout.
Fixtures are added by the feature PRs stacked above this infrastructure.

## Lifecycle

1. Upload the fixture's lockfile explicitly: agent-eval excludes lockfiles.
2. Install the pinned app, reuse `installPlaywright` and `prepareFixture`, and
   install candidate Next.js and codemod packages in a separate directory.
3. Let the framework relocate its workspace and install the native agents and
   judge. Both derived definitions suppress only their redundant app install.
4. Immediately before execution, verify the app version and manifest/lock hashes,
   establish the baseline commit, and create the disposable remote. This occurs
   after the framework's removal of `origin`. Route the app's `.bin/next` launcher
   through the same entry point so `pnpm exec next upgrade` reaches the candidate
   without replacing the installed framework runtime.
5. Run the unchanged native agent runner. The separate judge uses its native runner
   directly and never reinitializes the app. The framework withholds `EVAL.ts` and
   captures the result as usual.

TypeScript runtime sources are transpiled using the repository's existing
TypeScript dependency when loading the experiment. Runtime files and package
archives remain fixed for each run, including concurrent runs. Invalid fixtures
fail before execution, and infrastructure failures remain in the results.
No Python or new dependency is
required. `experiment.ts` isolates one pinned private orchestrator import because
agent-eval 2.2.1 exports native definitions but not their orchestrator. Revalidate
this adapter when upgrading that dependency.

## Adding feature coverage

Feature PRs add ordinary app fixtures with `PROMPT.md`, `EVAL.ts`, and a pinned
`pnpm-lock.yaml`. Security fixtures and their reference/negative controls belong
above this infrastructure layer. Keep graders and reference solutions withheld.
Use deterministic assertions for versions, committed files, and runtime behavior;
use the existing semantic matchers where source meaning matters.

The terminal entry, controlled security metadata, repository decision scenarios,
and committed-migration grading must be validated as they are added. A sandbox/authentication
failure remains an infrastructure failure, never a passing or skipped migration.
