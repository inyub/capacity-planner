import { CancellationToken, NsisUpdater } from 'electron-updater'
import type { ReleaseTarget } from '../shared/update-target'
import type { UpdateBackend } from './update-controller'

export function createUpdateBackend(target: ReleaseTarget): UpdateBackend {
  const updater = new NsisUpdater({ provider: 'github', ...target, private: false })
  updater.autoDownload = false
  updater.autoInstallOnAppQuit = false
  updater.autoRunAppAfterInstall = true
  updater.allowPrerelease = false
  updater.allowDowngrade = false
  updater.disableDifferentialDownload = true
  updater.disableWebInstaller = true
  let token: CancellationToken | null = null
  return {
    check: async () => {
      const result = await updater.checkForUpdates()
      if (!result) throw new Error('Keine Updateantwort.')
      return { available: result.isUpdateAvailable, version: result.updateInfo.version }
    },
    download: async (progress) => {
      token = new CancellationToken()
      updater.on('download-progress', progress)
      try {
        await updater.downloadUpdate(token)
      } finally {
        updater.removeListener('download-progress', progress)
        token = null
      }
    },
    cancel: () => token?.cancel(),
    install: () => updater.quitAndInstall(true, true),
    onError: (callback) => {
      updater.on('error', callback)
    }
  }
}
