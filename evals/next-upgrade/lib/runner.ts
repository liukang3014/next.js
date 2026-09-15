import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const input = JSON.parse(process.argv[2])
const tools = input.extra.upgradeTools
let result
try {
  const { establishBaseline } = await import(
    pathToFileURL(join(tools, 'baseline.mjs')).href
  )
  establishBaseline(input.cwd, tools)
  process.env.PATH = `${tools}/bin:${process.env.PATH}`
  process.env.NEXT_TELEMETRY_DISABLED = '1'
  const native = await import(pathToFileURL(join(tools, 'native.mjs')).href)
  result = await native.runAgent(input)
} catch (error) {
  result = {
    ok: false,
    output: '',
    transcript: null,
    observedModel: null,
    error: String(error),
  }
}
writeFileSync(input.resultPath, JSON.stringify(result))
console.log(
  `__AGENT_RESULT__ ${JSON.stringify({ ok: result.ok, error: result.error })}`
)
