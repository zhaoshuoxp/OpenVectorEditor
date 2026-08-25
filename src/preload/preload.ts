import { contextBridge, ipcRenderer } from "electron";
import {
  type DesktopApi,
  type NativeCommand,
  type UpdateStatus
} from "@ove/contracts";
import { IPC_CHANNELS } from "@ove/contracts/ipc";

const desktopApi: DesktopApi = {
  getLaunchContext: () => ipcRenderer.invoke(IPC_CHANNELS.getLaunchContext),
  openFiles: () => ipcRenderer.invoke(IPC_CHANNELS.openFiles),
  saveDocument: (request) => ipcRenderer.invoke(IPC_CHANNELS.saveDocument, request),
  designPrimers: (request) => ipcRenderer.invoke(IPC_CHANNELS.designPrimers, request),
  cancelPrimerDesign: () => ipcRenderer.invoke(IPC_CHANNELS.cancelPrimerDesign),
  runAlignment: (request) => ipcRenderer.invoke(IPC_CHANNELS.runAlignment, request),
  cancelAlignment: () => ipcRenderer.invoke(IPC_CHANNELS.cancelAlignment),
  chooseAlignmentFiles: () => ipcRenderer.invoke(IPC_CHANNELS.chooseAlignmentFiles),
  listRevisions: () => ipcRenderer.invoke(IPC_CHANNELS.listRevisions),
  getRevision: (id) => ipcRenderer.invoke(IPC_CHANNELS.getRevision, id),
  getPreferences: () => ipcRenderer.invoke(IPC_CHANNELS.getPreferences),
  setPreferences: (preferences) => ipcRenderer.invoke(IPC_CHANNELS.setPreferences, preferences),
  restartForUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.restartForUpdate),
  onNativeCommand: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, command: NativeCommand): void => listener(command);
    ipcRenderer.on(IPC_CHANNELS.nativeCommand, wrapped);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.nativeCommand, wrapped);
  },
  onUpdateStatus: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, status: UpdateStatus): void => listener(status);
    ipcRenderer.on(IPC_CHANNELS.updateStatus, wrapped);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.updateStatus, wrapped);
  }
};

contextBridge.exposeInMainWorld("desktopApi", desktopApi);
