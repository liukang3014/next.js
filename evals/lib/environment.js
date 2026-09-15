const fs = require('node:fs')
const path = require('node:path')

/** Make the repo's existing vc env pull output available to agent-eval. */
function linkEnvironment(root, directory) {
  for (const name of ['.env', '.env.local']) {
    const source = path.join(root, name)
    const destination = path.join(directory, name)
    // Preserve a locally configured file; only replace links owned by a runner.
    if (
      fs.existsSync(destination) &&
      !fs.lstatSync(destination).isSymbolicLink()
    )
      continue
    fs.rmSync(destination, { force: true })
    if (fs.existsSync(source)) fs.symlinkSync(source, destination)
  }
}
module.exports = { linkEnvironment }
