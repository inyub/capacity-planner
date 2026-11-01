import { contextBridge } from 'electron'
import { ipcRenderer } from 'electron'
import type { AppData, CapacityPlannerApi } from '../shared/types'
import type { UpdateState } from '../shared/updates'

const capacityPlanner: CapacityPlannerApi = {
  getUpdateState: () => ipcRenderer.invoke('updates:state'),
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  downloadUpdate: () => ipcRenderer.invoke('updates:download'),
  cancelUpdate: () => ipcRenderer.invoke('updates:cancel'),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
  onUpdateState: (callback) => {
    const handler = (_event: unknown, state: UpdateState): void => callback(state)
    ipcRenderer.on('updates:state', handler)
    return () => {
      ipcRenderer.removeListener('updates:state', handler)
    }
  },
  exportPlanning: () => ipcRenderer.invoke('planning:export'),
  previewPlanning: () => ipcRenderer.invoke('planning:preview'),
  cancelPlanning: () => ipcRenderer.invoke('planning:cancel'),
  confirmPlanning: (token) => ipcRenderer.invoke('planning:confirm', token),
  loadData: (): Promise<AppData> => ipcRenderer.invoke('app-data:load'),
  saveData: (data: AppData): Promise<{ saved: boolean }> =>
    ipcRenderer.invoke('app-data:save', data),
  closeApp: (): Promise<void> => ipcRenderer.invoke('app:close'),
  minimizeWindow: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
  toggleMaximizeWindow: (): Promise<void> => ipcRenderer.invoke('window:toggle-maximize'),
  toggleFullscreen: (): Promise<void> => ipcRenderer.invoke('window:toggle-fullscreen'),
  showHeaderMenu: (): Promise<void> => ipcRenderer.invoke('header:menu'),
  onOpenSettings: (callback: () => void): (() => void) => {
    const handler = (): void => callback()
    ipcRenderer.on('settings:open', handler)
    return () => {
      ipcRenderer.removeListener('settings:open', handler)
    }
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('capacityPlanner', capacityPlanner)
  } catch (error) {
    console.error(error)
  }
} else {
  throw new Error('Context Isolation muss für die Capacity-Planner-API aktiviert sein.')
}
