export type UpdateStatus =
  | 'disabled'
  | 'idle'
  | 'checking'
  | 'current'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'error'

export interface UpdateState {
  status: UpdateStatus
  currentVersion: string
  version?: string
  percent?: number
  transferred?: number
  total?: number
  message: string
}

export interface UpdateApi {
  getUpdateState: () => Promise<UpdateState>
  checkForUpdates: () => Promise<void>
  downloadUpdate: () => Promise<void>
  cancelUpdate: () => Promise<void>
  installUpdate: () => Promise<void>
  onUpdateState: (callback: (state: UpdateState) => void) => () => void
}
