import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

export function establishBaseline(cwd: string, tools: string) {
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
  const expected = JSON.parse(
    readFileSync(join(tools, 'expected.json'), 'utf8')
  )
  const hash = (file: string) =>
    createHash('sha256')
      .update(readFileSync(join(cwd, file)))
      .digest('hex')
  const requireApp = createRequire(join(cwd, 'package.json'))
  assert.equal(
    requireApp('next/package.json').version,
    expected.installed,
    'Framework setup changed the installed Next.js'
  )
  assert.equal(
    hash('package.json'),
    expected.packageHash,
    'Framework setup changed package.json'
  )
  assert.equal(
    hash('pnpm-lock.yaml'),
    expected.lockHash,
    'Framework setup changed the lockfile'
  )
  assert.equal(
    existsSync(join(cwd, 'EVAL.ts')),
    false,
    'The grader leaked before execution'
  )
  assert.equal(
    existsSync(join(cwd, 'package-lock.json')),
    false,
    'Unexpected second package-manager lockfile'
  )
  writeFileSync(
    join(cwd, '.gitignore'),
    'node_modules/\n.next/\n__agent_eval__/\n.eval-evidence/\n*.tsbuildinfo\n'
  )
  git('add', '.')
  git('commit', '--allow-empty', '-m', 'Prepare pinned upgrade baseline')
  git('branch', '-M', 'main')
  const remote = join(tools, 'origin.git')
  // This runs after agent-eval's workspace neutralization removes origin.
  git('clone', '--bare', '.', remote)
  const url = 'https://github.com/next-upgrade-eval/fixture.git'
  git('config', `url.file://${remote}.insteadOf`, url)
  git('remote', 'add', 'origin', url)
  git('fetch', 'origin')
  git('remote', 'set-head', 'origin', 'main')
  const baseline = {
    ...expected,
    head: git('rev-parse', 'HEAD'),
    origin: git('remote', 'get-url', 'origin'),
    targetHead: git('rev-parse', 'origin/main'),
  }
  writeFileSync(join(tools, 'baseline.json'), JSON.stringify(baseline))
  return baseline
}
