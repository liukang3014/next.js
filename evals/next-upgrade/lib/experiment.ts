import { withoutAppInstall } from './lifecycle'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  getAgent,
  registerAgent,
  type Agent,
  type ExperimentConfig,
} from '@vercel/agent-eval'
import { setupUpgrade } from './fixture'

// Keep the one private API dependency here. 2.2.1 exposes native definitions but
// not the orchestrator needed to run a derived definition. Everything else uses
// public setup, runner, native authentication, judging and result collection.
const require = createRequire(join(__dirname, 'experiment.ts'))
const packageRoot = dirname(require.resolve('@vercel/agent-eval/package.json'))
if (
  JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'))
    .version !== '2.2.1'
) {
  throw new Error('Revalidate the upgrade adapter when updating agent-eval')
}
const orchestrator = pathToFileURL(
  join(packageRoot, 'dist/lib/agents/plugin/orchestrator.js')
).href

function register(
  native: Agent,
  definition: Agent['definition'],
  judgeAgent: string | undefined = undefined
) {
  registerAgent({
    ...native,
    name: definition.name,
    definition,
    // Public config restricts judge names; apply the derived native judge only
    // at the isolated orchestrator boundary after config validation.
    run: async (fixture, options) =>
      (await import(orchestrator)).runWithDefinition(
        definition,
        fixture,
        judgeAgent && options.judge
          ? { ...options, judge: { ...options.judge, agent: judgeAgent } }
          : options
      ),
  })
}

export function upgradeExperiment(
  harness: 'codex' | 'claude-code'
): ExperimentConfig {
  const fixture = process.env.NEXT_UPGRADE_EVAL_CASE
  if (!fixture) throw new Error('Select one upgrade eval case')
  const native = getAgent(`vercel-ai-gateway/${harness}`)
  const name = `next-upgrade/${harness}`
  const sourceFingerprint = [
    readFileSync(join(__dirname, '../../lib/setup.ts'), 'utf8'),
    ...['entry.mjs', 'experiment.ts', 'fixture.ts', 'lifecycle.ts'].map(
      (file) => readFileSync(join(__dirname, file), 'utf8')
    ),
  ].join('\n')
  const judgeName = 'next-upgrade-judge/claude-code'
  register(
    native,
    {
      ...native.definition,
      name,
      install: withoutAppInstall(native.definition),
      fingerprintExtra: (config) => {
        const hash = createHash('sha256')
        hash.update(sourceFingerprint)
        for (const variable of [
          'NEXT_UPGRADE_EVAL_NEXT_TARBALL',
          'NEXT_UPGRADE_EVAL_CODEMOD_TARBALL',
        ]) {
          const path = process.env[variable]
          if (!path)
            throw new Error(`Missing ${variable}; run pnpm eval:upgrade`)
          hash.update(readFileSync(path))
        }
        return {
          ...native.definition.fingerprintExtra?.(config),
          upgradeInputs: hash.digest('hex'),
        }
      },
    },
    judgeName
  )
  // The judge retains its native runner: it must neither reset the app nor enter
  // the upgrade flow. Its installation must also leave the pinned app alone.
  const judge = getAgent('vercel-ai-gateway/claude-code')
  register(judge, {
    ...judge.definition,
    name: judgeName,
    install: withoutAppInstall(judge.definition),
  })
  return {
    agent: name,
    model: harness === 'codex' ? 'openai/gpt-5.6-terra' : 'claude-sonnet-4-6',
    judge: {
      agent: 'vercel-ai-gateway/claude-code',
      model: 'claude-haiku-4-5',
    },
    evals: fixture,
    earlyExit: false,
    timeout: 1800,
    copyFiles: 'changed',
    setup: async (sandbox) => {
      await setupUpgrade(sandbox, join(__dirname, '../evals', fixture))
    },
  }
}
