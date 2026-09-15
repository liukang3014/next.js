import type { Agent } from '@vercel/agent-eval'

export function withoutAppInstall(
  native: Pick<Agent['definition'], 'install'>
): Agent['definition']['install'] {
  return (options) => {
    const steps = native.install(options)
    const isAppInstall = (step) =>
      step.kind === 'command' &&
      step.cmd === 'npm' &&
      step.args?.length === 1 &&
      step.args[0] === 'install'
    if (steps.filter(isAppInstall).length !== 1)
      throw new Error(
        'The native app-install lifecycle changed; revalidate the upgrade adapter'
      )
    return steps.filter((step) => !isAppInstall(step))
  }
}
