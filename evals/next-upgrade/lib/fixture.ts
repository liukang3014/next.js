import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Sandbox } from '@vercel/agent-eval'
import ts from 'typescript'
import { installPlaywright, prepareFixture } from '../../lib/setup'

export const toolsDirectory = '/tmp/next-upgrade-eval'
export const runtimeFiles = ['runner', 'baseline', 'entry'] as const

export function compileRuntime(name: (typeof runtimeFiles)[number]) {
  return ts.transpileModule(
    readFileSync(join(__dirname, `${name}.ts`), 'utf8'),
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    }
  ).outputText
}

export async function setupUpgrade(
  sandbox: Sandbox,
  fixture: string,
  nativeRunner: string,
  runtime: Record<string, string>
) {
  const uploaded = JSON.parse(await sandbox.readFile('package.json'))
  const selected = JSON.parse(
    readFileSync(join(fixture, 'package.json'), 'utf8')
  )
  if (JSON.stringify(uploaded) !== JSON.stringify(selected))
    throw new Error(
      'agent-eval selected a different fixture than the requested upgrade app'
    )
  async function run(command: string, args: string[]) {
    const result = await sandbox.runCommand(command, args)
    if (result.exitCode !== 0)
      throw new Error(
        `${command} failed during upgrade setup:\n${result.stderr}`
      )
    return result.stdout.trim()
  }
  const nextTarball = process.env.NEXT_UPGRADE_EVAL_NEXT_TARBALL
  const codemodTarball = process.env.NEXT_UPGRADE_EVAL_CODEMOD_TARBALL
  if (!nextTarball || !codemodTarball)
    throw new Error(
      'Run through pnpm eval:upgrade to provide the candidate packages'
    )
  const lock = readFileSync(join(fixture, 'pnpm-lock.yaml'), 'utf8')
  // agent-eval omits lockfiles. Restore ours before the app's only installation.
  await sandbox.writeFiles({ 'pnpm-lock.yaml': lock })
  await run('npm', ['install', '-g', 'pnpm@10.33.0'])
  await run('pnpm', ['install', '--frozen-lockfile'])
  await installPlaywright(sandbox)
  await prepareFixture(sandbox)
  const installed = await run('node', [
    '-p',
    "require('next/package.json').version",
  ])
  const packageJSON = await sandbox.readFile('package.json')
  await run('mkdir', ['-p', toolsDirectory, `${toolsDirectory}/bin`])
  await sandbox.writeFiles({
    // @ts-expect-error agent-eval accepts binary upload at runtime
    [`${toolsDirectory}/next.tgz`]: readFileSync(nextTarball),
    // @ts-expect-error agent-eval accepts binary upload at runtime
    [`${toolsDirectory}/codemod.tgz`]: readFileSync(codemodTarball),
    [`${toolsDirectory}/native.mjs`]: readFileSync(nativeRunner, 'utf8'),
    [`${toolsDirectory}/expected.json`]: JSON.stringify({
      installed,
      packageHash: createHash('sha256').update(packageJSON).digest('hex'),
      lockHash: createHash('sha256').update(lock).digest('hex'),
    }),
    ...Object.fromEntries(
      runtimeFiles.map((name) => [
        `${toolsDirectory}/${name}.mjs`,
        runtime[name],
      ])
    ),
    [`${toolsDirectory}/bin/next`]: `#!/bin/sh\nexec node ${toolsDirectory}/entry.mjs "$@"\n`,
  })
  for (const name of ['next', 'codemod']) {
    await run('npm', [
      'install',
      '--prefix',
      `${toolsDirectory}/${name}`,
      `${toolsDirectory}/${name}.tgz`,
    ])
  }
  await run('chmod', ['+x', `${toolsDirectory}/bin/next`])
}
