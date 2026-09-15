import { appendFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const tools = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const candidate = args[0] === 'upgrade'
const requireApp = createRequire(join(process.cwd(), 'package.json'))
const executable = candidate
  ? join(tools, 'next/node_modules/next/dist/bin/next')
  : requireApp.resolve('next/dist/bin/next')
if (candidate) {
  // Exercise the packed candidate rather than delegating to published canary.
  process.env.__NEXT_UPGRADE_LOCAL = '1'
  appendFileSync(
    join(tools, 'invocations.jsonl'),
    JSON.stringify({
      args,
      executable: realpathSync(executable),
      cwd: process.cwd(),
    }) + '\n'
  )
}
process.argv = [process.execPath, executable, ...args]
await import(pathToFileURL(executable).href)
