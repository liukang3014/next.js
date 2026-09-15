#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { packPackage } = require('../lib/pack')
const { linkEnvironment } = require('../lib/environment')
async function main() {
  const root = path.resolve(__dirname, '../..')
  const args = process.argv.slice(2)
  const cases = fs
    .readdirSync(path.join(__dirname, 'evals'))
    .filter((name) =>
      fs.existsSync(path.join(__dirname, 'evals', name, 'PROMPT.md'))
    )
  const selected = args.filter((arg) => !arg.startsWith('--'))
  const requested = selected.length ? selected : cases
  const harness = process.env.NEXT_UPGRADE_EVAL_EXPERIMENT
  if (harness && !['codex', 'claude'].includes(harness))
    throw new Error('Select codex or claude')
  if (requested.some((name) => !cases.includes(name)))
    throw new Error(`Available cases: ${cases.join(', ')}`)
  if (
    args.some(
      (arg) => arg.startsWith('--') && !['--dry', '--list'].includes(arg)
    )
  )
    throw new Error('Supported flags: --dry, --list')
  // Validate using the framework's own fixture rules. Its run command otherwise
  // falls back to all fixtures when an explicit filter matches no valid fixture.
  const { loadFixture } = await import('@vercel/agent-eval')
  for (const fixture of requested)
    loadFixture(path.join(__dirname, 'evals'), fixture)
  if (args.includes('--list') || args.includes('--dry')) {
    console.log(requested.join('\n'))
    process.exit(0)
  }
  for (const [name, entry] of [
    ['next', 'dist/bin/next'],
    ['next-codemod', 'bin/next-codemod.js'],
  ]) {
    if (!fs.existsSync(path.join(root, 'packages', name, entry)))
      throw new Error(`Build packages/${name} before running upgrade evals`)
  }
  fs.mkdirSync(path.join(__dirname, '.tarballs'), { recursive: true })
  const tarballs = fs.mkdtempSync(path.join(__dirname, '.tarballs/run-'))
  const env = {
    ...process.env,
    NEXT_UPGRADE_EVAL_NEXT_TARBALL: packPackage(
      path.join(root, 'packages/next'),
      path.join(tarballs, 'next.tgz')
    ),
    NEXT_UPGRADE_EVAL_CODEMOD_TARBALL: packPackage(
      path.join(root, 'packages/next-codemod'),
      path.join(tarballs, 'codemod.tgz')
    ),
  }
  linkEnvironment(root, __dirname)
  fs.mkdirSync(path.join(__dirname, 'results'), { recursive: true })
  for (const experiment of harness ? [harness] : ['codex', 'claude']) {
    for (const fixture of requested) {
      const result = spawnSync(
        path.join(root, 'node_modules/.bin/agent-eval'),
        ['run', experiment, '--force', '--ack-failures'],
        {
          cwd: __dirname,
          env: { ...env, NEXT_UPGRADE_EVAL_CASE: fixture },
          stdio: 'inherit',
        }
      )
      if (result.error) throw result.error
      if (result.status !== 0) process.exitCode = 1
    }
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
