import { contextBridge, ipcRenderer } from 'electron'
import type { OmpApi } from '../shared/omp-api'

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: Electron.IpcRendererEvent, payload: unknown): void => cb(payload as T)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: OmpApi = {
  connect: (project) => ipcRenderer.invoke('omp:connect', project),
  disconnect: () => ipcRenderer.invoke('omp:disconnect'),
  getStatus: () => ipcRenderer.invoke('omp:status'),
  pickProject: () => ipcRenderer.invoke('omp:pick_project'),
  recallProject: () => ipcRenderer.invoke('omp:recall_project'),
  rememberProject: (cwd) => ipcRenderer.invoke('omp:remember_project', cwd),
  getOmpPath: () => ipcRenderer.invoke('omp:omp_path'),
  prompt: (text) => ipcRenderer.invoke('omp:prompt', text),
  steer: (text) => ipcRenderer.invoke('omp:steer', text),
  followUp: (text) => ipcRenderer.invoke('omp:follow_up', text),
  abort: () => ipcRenderer.invoke('omp:abort'),
  newSession: (parent) => ipcRenderer.invoke('omp:new_session', parent),
  switchSession: (path) => ipcRenderer.invoke('omp:switch_session', path),
  renameSession: (name) => ipcRenderer.invoke('omp:rename_session', name),
  exportHtml: () => ipcRenderer.invoke('omp:export_html'),
  getState: () => ipcRenderer.invoke('omp:get_state'),
  getModels: () => ipcRenderer.invoke('omp:get_models'),
  setModel: (provider, modelId) => ipcRenderer.invoke('omp:set_model', provider, modelId),
  setThinkingLevel: (level) => ipcRenderer.invoke('omp:set_thinking_level', level),
  setFastMode: (enabled) => ipcRenderer.invoke('omp:set_fast_mode', enabled),
  getMessagesPage: (cursor, limit) => ipcRenderer.invoke('omp:get_messages_page', cursor, limit),
  listSessions: (cwd) => ipcRenderer.invoke('omp:list_sessions', cwd),
  uiResponse: (id, value, confirmed, cancelled) => ipcRenderer.invoke('omp:ui_response', id, value, confirmed, cancelled),
  onEvent: (cb) => subscribe('omp:event', cb),
  onUiRequest: (cb) => subscribe('omp:ui_request', cb),
  onStatus: (cb) => subscribe('omp:status', cb)
}

contextBridge.exposeInMainWorld('omp', api)
