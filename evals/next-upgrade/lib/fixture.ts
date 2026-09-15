import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Sandbox } from '@vercel/agent-eval'
import { installPlaywright, prepareFixture } from '../../lib/setup'

export const toolsDirectory = '/tmp/next-upgrade-eval'

export async function setupUpgrade(sandbox: Sandbox, fixture: string) {
  const uploaded = JSON.parse(await sandbox.readFile('package.json'))
  const selected = JSON.parse(
    readFileSync(join(fixture, 'package.json'), 'utf8')
  )
  if (!(selected.dependencies?.next ?? selected.devDependencies?.next))
    throw new Error('Upgrade fixtures must depend on Next.js')
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
  const packageJSON = readFileSync(join(fixture, 'package.json'), 'utf8')
  const lock = readFileSync(join(fixture, 'pnpm-lock.yaml'), 'utf8')
  const ignoreFile = join(fixture, '.gitignore')
  const ignore = existsSync(ignoreFile) ? readFileSync(ignoreFile, 'utf8') : ''
  // agent-eval omits lockfiles and replaces .gitignore when initializing Git.
  // Restore the fixture's rules before installing or running its setup script.
  await sandbox.writeFiles({
    'pnpm-lock.yaml': lock,
    '.gitignore': `${ignore}\nnode_modules/\n.next/\n__agent_eval__/\n*.tsbuildinfo\n`,
  })
  await run('npm', ['install', '-g', 'pnpm@10.33.0'])
  await run('pnpm', ['install', '--frozen-lockfile'])
  await installPlaywright(sandbox)
  await prepareFixture(sandbox)
  await run('mkdir', ['-p', toolsDirectory])
  await sandbox.writeFiles({
    // @ts-expect-error agent-eval accepts binary upload at runtime
    [`${toolsDirectory}/next.tgz`]: readFileSync(nextTarball),
    // @ts-expect-error agent-eval accepts binary upload at runtime
    [`${toolsDirectory}/codemod.tgz`]: readFileSync(codemodTarball),
    [`${toolsDirectory}/entry.mjs`]: readFileSync(
      join(__dirname, 'entry.mjs'),
      'utf8'
    ),
  })
  await run('npm', [
    'install',
    '--prefix',
    `${toolsDirectory}/next`,
    `${toolsDirectory}/next.tgz`,
  ])
  await run('rm', ['-f', 'node_modules/.bin/next'])
  await sandbox.writeFiles({
    'node_modules/.bin/next': `#!/bin/sh\nexec node ${toolsDirectory}/entry.mjs "$@"\n`,
  })
  await run('chmod', ['+x', 'node_modules/.bin/next'])
  await run('node', ['-p', "require('next/package.json').version"])
  const actualPackage = await sandbox.readFile('package.json')
  const actualLock = await sandbox.readFile('pnpm-lock.yaml')
  const hash = (value: string) =>
    createHash('sha256').update(value).digest('hex')
  if (
    hash(actualPackage) !== hash(packageJSON) ||
    hash(actualLock) !== hash(lock)
  )
    throw new Error('Framework setup changed the fixture manifest or lockfile')
  await run('git', ['add', '.'])
  await run('git', [
    'commit',
    '--allow-empty',
    '-m',
    'Prepare pinned upgrade fixture',
  ])
}
