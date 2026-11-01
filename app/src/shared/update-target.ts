export interface ReleaseTarget {
  owner: string
  repo: string
}

export function readReleaseTarget(value: unknown): ReleaseTarget | null {
  if (!value || typeof value !== 'object') throw new Error('Ungültiges GitHub-Releaseziel.')
  const { owner, repo } = value as Record<string, unknown>
  if (owner === '' && repo === '') return null
  if (
    typeof owner !== 'string' ||
    typeof repo !== 'string' ||
    !/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38})$/.test(owner) ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(repo) ||
    owner === 'UPDATE_OWNER_NOT_CONFIGURED' ||
    repo === 'UPDATE_REPO_NOT_CONFIGURED'
  ) {
    throw new Error('GitHub-Releaseziel als owner und repo ohne URL eintragen.')
  }
  return { owner, repo }
}

export function updateDisabledReason(options: {
  platform: string
  packaged: boolean
  installed: boolean
  isolated: boolean
  target: ReleaseTarget | null
}): string | null {
  if (options.platform !== 'win32' || !options.packaged || !options.installed)
    return 'Updates sind in der installierten Windows-App verfügbar.'
  if (options.isolated) return 'Updates sind in dieser isolierten Vorschau deaktiviert.'
  if (!options.target) return 'Der Updatekanal ist noch nicht eingerichtet.'
  return null
}
