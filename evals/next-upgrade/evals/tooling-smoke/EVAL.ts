import { expect, test } from 'vitest'
import { environment } from '@vercel/agent-eval/eval'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const tools = '/tmp/next-upgrade-eval'
const baseline = JSON.parse(readFileSync(join(tools, 'baseline.json'), 'utf8'))
const git = (...args: string[]) =>
  execFileSync('git', args, { encoding: 'utf8' }).trim()

test('runs the candidate upgrade command against the original app', () => {
  const calls = readFileSync(join(tools, 'invocations.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
  expect(
    calls.some(
      (call) => call.args[0] === 'upgrade' && call.args.includes('--help')
    )
  ).toBe(true)
  expect(
    calls.every((call) => call.executable.startsWith(`${tools}/next/`))
  ).toBe(true)
  const require = createRequire(join(process.cwd(), 'package.json'))
  expect(require('next/package.json').version).toBe('13.5.11')
})

test('retains the established repository and original tracked application', () => {
  expect(git('rev-parse', 'HEAD')).toBe(baseline.head)
  expect(git('diff', 'HEAD', '--')).toBe('')
  expect(git('rev-parse', 'origin/main')).toBe(baseline.targetHead)
  expect(git('remote', 'get-url', 'origin')).toBe(baseline.origin)
  expect(readFileSync('pnpm-lock.yaml', 'utf8')).toContain('13.5.11')
})

// Exercise the separate native judge, including its setup, rather than only
// checking that a judge configuration can be constructed.
test('the native judge can inspect the app without replaying upgrade setup', async () => {
  await expect(environment).toSatisfyCriterion(
    'The application page still renders the heading Upgrade tooling smoke. The task asked only for CLI help, so the application has not been migrated.'
  )
  expect(git('rev-parse', 'HEAD')).toBe(baseline.head)
})
