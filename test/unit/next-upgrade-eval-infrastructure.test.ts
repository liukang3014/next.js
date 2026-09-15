import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  establishBaseline,
  installUpgradeEntry,
} from '../../evals/next-upgrade/lib/baseline'
import { withoutAppInstall } from '../../evals/next-upgrade/lib/lifecycle'

let directory: string
let app: string
let tools: string
function git(...args: string[]) {
  return execFileSync('git', args, {
    cwd: app,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim()
}
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'upgrade-infra-test-'))
  app = join(directory, 'app')
  tools = join(directory, 'tools')
  mkdirSync(join(app, 'node_modules/next'), { recursive: true })
  mkdirSync(tools)
  const pkg = '{"dependencies":{"next":"13.5.11"}}'
  const lock = 'original pinned lockfile'
  writeFileSync(join(app, 'package.json'), pkg)
  writeFileSync(join(app, 'pnpm-lock.yaml'), lock)
  writeFileSync(
    join(app, 'node_modules/next/package.json'),
    '{"version":"13.5.11"}'
  )
  const hash = (value: string) =>
    createHash('sha256').update(value).digest('hex')
  writeFileSync(
    join(tools, 'expected.json'),
    JSON.stringify({
      installed: '13.5.11',
      packageHash: hash(pkg),
      lockHash: hash(lock),
    })
  )
  git('init')
  git('config', 'user.name', 'Eval test')
  git('config', 'user.email', 'eval@example.invalid')
  git('config', 'commit.gpgsign', 'false')
})
afterEach(() => rmSync(directory, { recursive: true, force: true }))

test('establishes fetchable remote history after workspace neutralization', () => {
  const baseline = establishBaseline(app, tools)
  expect(baseline.installed).toBe('13.5.11')
  expect(git('rev-parse', 'origin/main')).toBe(baseline.head)
  expect(git('status', '--porcelain')).toBe('')
  expect(git('show', 'origin/main:package.json')).toContain('13.5.11')
  expect(
    JSON.parse(readFileSync(join(tools, 'baseline.json'), 'utf8')).head
  ).toBe(baseline.head)
  git('fetch', 'origin')
})

test('routes package-manager upgrade commands without overwriting the installed runtime', () => {
  const runtime = join(app, 'node_modules/next/runtime.js')
  writeFileSync(runtime, 'published runtime')
  mkdirSync(join(app, 'node_modules/.bin'))
  symlinkSync(runtime, join(app, 'node_modules/.bin/next'))
  writeFileSync(
    join(tools, 'entry.mjs'),
    'console.log(JSON.stringify(process.argv.slice(2)))'
  )
  installUpgradeEntry(app, tools)
  expect(readFileSync(runtime, 'utf8')).toBe('published runtime')
  const args = ['upgrade', '--ai=security', 'app with spaces']
  const output = execFileSync(join(app, 'node_modules/.bin/next'), args, {
    encoding: 'utf8',
  })
  expect(JSON.parse(output)).toEqual(args)
})

test.each(['package.json', 'pnpm-lock.yaml', 'node_modules/next/package.json'])(
  'rejects setup mutation of %s',
  (file) => {
    writeFileSync(
      join(app, file),
      file.endsWith('package.json')
        ? '{"version":"15.5.24"}'
        : 're-resolved lockfile'
    )
    expect(() => establishBaseline(app, tools)).toThrow()
  }
)

test.each(['EVAL.ts', 'package-lock.json'])(
  'rejects unexpected %s before the agent starts',
  (file) => {
    writeFileSync(join(app, file), '{}')
    expect(() => establishBaseline(app, tools)).toThrow()
  }
)

test('removes only the project install from both agent and judge setup', () => {
  const common = {
    kind: 'command' as const,
    cmd: 'npm',
    errorPrefix: 'install failed',
    errorBody: 'stderr' as const,
  }
  const install = { ...common, args: ['install'] }
  const harness = { ...common, args: ['install', '-g', '@openai/codex'] }
  const definition = {
    install: () => [install, harness],
  }
  expect(withoutAppInstall(definition)({} as never)).toEqual([harness])
  expect(definition.install()).toEqual([install, harness])
})

test('fails visibly if the runner changes its install contract', () => {
  const definition = { install: () => [] }
  expect(() => withoutAppInstall(definition)({} as never)).toThrow(
    /lifecycle changed/
  )
})
