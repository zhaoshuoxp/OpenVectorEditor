import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeTheme,
  type IpcMainInvokeEvent
} from "electron";
import windowStateKeeper from "electron-window-state";
import { autoUpdater } from "electron-updater";
import {
  alignmentRequestSchema,
  IPC_CHANNELS,
  preferencesPatchSchema,
  primerDesignRequestSchema,
  saveDocumentRequestSchema,
  type AppPreferences,
  type LaunchContext,
  type AlignmentRequest,
  type NativeCommand,
  type PrimerDesignRequest,
  type SaveDocumentRequest,
  type SequenceDocument,
  type ThemeMode,
  type UpdateStatus
} from "@ove/contracts";
import { AlignmentService } from "./services/alignment-service";
import {
  atomicWriteSequenceDocument,
  alignmentFileFilters,
  canonicalPath,
  documentNameFromPath,
  openFileFilters,
  readSequenceFile,
  readSequenceFiles,
  saveFileFilters
} from "./services/file-service";
import { HistoryService } from "./services/history-service";
import { PreferencesService } from "./services/preferences-service";
import { Primer3Service } from "./services/primer3-service";
import { focusedWindow, installApplicationMenu } from "./menu";

// Matches --ove-bg in src/renderer/style.css so windows do not flash before the renderer paints.
const WINDOW_BACKGROUND = { light: "#ffffff", dark: "#1b1d21" } as const;

interface WindowRecord {
  browserWindow: BrowserWindow;
  launchContext: LaunchContext;
  alignmentService: AlignmentService;
  primer3Service: Primer3Service;
}

const applicationRoot = app.isPackaged ? app.getAppPath() : path.resolve(__dirname, "../..");
const windows = new Map<number, WindowRecord>();
const pendingMacFiles: string[] = [];
let historyService: HistoryService;
let preferencesService: PreferencesService;
let updateDownloaded = false;

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

app.on("second-instance", (_event, commandLine) => {
  const requestedPaths = findLaunchFiles(commandLine, !app.isPackaged);
  if (requestedPaths.length) void Promise.all(requestedPaths.map(openPath));
  else focusedWindow()?.focus();
});

app.on("open-file", (event, filePath) => {
  event.preventDefault();
  if (!app.isReady()) pendingMacFiles.push(filePath);
  else void openPath(filePath);
});

app.whenReady().then(async () => {
  historyService = new HistoryService(path.join(app.getPath("userData"), "history"));
  preferencesService = new PreferencesService(app.getPath("userData"));
  registerIpcHandlers();
  applyTheme((await preferencesService.get()).theme);
  nativeTheme.on("updated", () => {
    const background = currentWindowBackground();
    for (const { browserWindow } of windows.values()) browserWindow.setBackgroundColor(background);
  });
  configureAutoUpdater();

  if (pendingMacFiles.length) {
    const files = pendingMacFiles.splice(0);
    await Promise.all(files.map(openPath));
  } else {
    const launchPaths = findLaunchFiles(process.argv, !app.isPackaged);
    if (launchPaths.length) await Promise.all(launchPaths.map(openPath));
    else await createWindow({ document: { circular: true } });
  }
});

app.on("activate", () => {
  if (!BrowserWindow.getAllWindows().length) void createWindow({ document: { circular: true } });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

async function createWindow(launchContext: LaunchContext): Promise<BrowserWindow> {
  if (launchContext.filePath) {
    const existing = findWindowByPath(launchContext.filePath);
    if (existing) {
      if (existing.browserWindow.isMinimized()) existing.browserWindow.restore();
      existing.browserWindow.show();
      existing.browserWindow.focus();
      return existing.browserWindow;
    }
  }

  const state = windowStateKeeper({ defaultWidth: 1000, defaultHeight: 800 });
  const browserWindow = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    show: false,
    backgroundColor: currentWindowBackground(),
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  });
  state.manage(browserWindow);
  const webContentsId = browserWindow.webContents.id;
  const record: WindowRecord = {
    browserWindow,
    launchContext,
    alignmentService: new AlignmentService(),
    primer3Service: new Primer3Service(app, applicationRoot)
  };
  windows.set(webContentsId, record);

  browserWindow.once("ready-to-show", () => browserWindow.show());
  browserWindow.on("closed", () => {
    record.alignmentService.cancelAll();
    record.primer3Service.cancelAll();
    windows.delete(webContentsId);
  });
  browserWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  browserWindow.webContents.on("preload-error", (_event, preloadPath, error) => {
    console.error(`Preload failed: ${preloadPath}`, error);
  });
  browserWindow.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  browserWindow.webContents.on("will-attach-webview", (event) => event.preventDefault());
  browserWindow.webContents.on("will-navigate", (event, targetUrl) => {
    if (!isAllowedRendererUrl(targetUrl)) event.preventDefault();
  });

  const developmentUrl = process.env.VITE_DEV_SERVER_URL;
  if (developmentUrl) await browserWindow.loadURL(developmentUrl);
  else await browserWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  return browserWindow;
}

async function openPath(requestedPath: string): Promise<void> {
  try {
    const filePath = await canonicalPath(requestedPath);
    const existing = findWindowByPath(filePath);
    if (existing) {
      existing.browserWindow.show();
      existing.browserWindow.focus();
      return;
    }
    const document = await readSequenceFile(filePath);
    await createWindow({ document, filePath });
  } catch (error) {
    await dialog.showMessageBox({
      type: "error",
      title: "Unable to Open Sequence",
      message: errorMessage(error)
    });
  }
}

async function openFilesFromDialog(parent?: BrowserWindow): Promise<void> {
  const options: Electron.OpenDialogOptions = {
    filters: openFileFilters,
    properties: ["openFile", "multiSelections"]
  };
  const owner = parent ?? focusedWindow();
  const result = owner
    ? await dialog.showOpenDialog(owner, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled) return;
  await Promise.all(result.filePaths.map(openPath));
}

function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.getLaunchContext, (event) => {
    return getRecord(event).launchContext;
  });

  ipcMain.handle(IPC_CHANNELS.openFiles, async (event) => {
    const record = getRecord(event);
    await openFilesFromDialog(record.browserWindow);
  });

  ipcMain.handle(IPC_CHANNELS.saveDocument, async (event, input: unknown) => {
    const request = saveDocumentRequestSchema.parse(input) as SaveDocumentRequest;
    const record = getRecord(event);
    let filePath = record.launchContext.filePath;

    if (request.mode === "saveAs" || !filePath) {
      const suggestedName = `${request.document.name || "Untitled_Sequence"}.gb`;
      const result = await dialog.showSaveDialog(record.browserWindow, {
        filters: saveFileFilters,
        title: suggestedName,
        defaultPath: filePath ?? path.join(app.getPath("downloads"), suggestedName),
        buttonLabel: request.mode === "saveAs" ? "Save file as" : "Save file"
      });
      if (result.canceled || !result.filePath) return { canceled: true };
      filePath = await canonicalPath(result.filePath);
    }

    const documentName = documentNameFromPath(filePath);
    const document = { ...request.document, name: documentName } as SequenceDocument;
    await atomicWriteSequenceDocument(document, filePath);
    record.launchContext = { document, filePath };
    await historyService.record(filePath, document);
    return { canceled: false, filePath, documentName };
  });

  ipcMain.handle(IPC_CHANNELS.designPrimers, async (event, input: unknown) => {
    const record = getRecord(event);
    return record.primer3Service.design(primerDesignRequestSchema.parse(input) as PrimerDesignRequest);
  });

  ipcMain.handle(IPC_CHANNELS.cancelPrimerDesign, (event) => {
    getRecord(event).primer3Service.cancelAll();
  });

  ipcMain.handle(IPC_CHANNELS.runAlignment, async (event, input: unknown) => {
    const record = getRecord(event);
    return record.alignmentService.align(alignmentRequestSchema.parse(input) as AlignmentRequest);
  });

  ipcMain.handle(IPC_CHANNELS.cancelAlignment, (event) => {
    getRecord(event).alignmentService.cancelAll();
  });

  ipcMain.handle(IPC_CHANNELS.chooseAlignmentFiles, async (event) => {
    const record = getRecord(event);
    const result = await dialog.showOpenDialog(record.browserWindow, {
      filters: alignmentFileFilters,
      properties: ["openFile", "multiSelections"]
    });
    if (result.canceled) return [];
    const groups = await Promise.all(
      result.filePaths.map(async (filePath) => ({
        filePath,
        documents: await readSequenceFiles(filePath)
      }))
    );
    return groups.flatMap(({ filePath, documents }) =>
      documents.map((document) => ({ filePath, document }))
    );
  });

  ipcMain.handle(IPC_CHANNELS.listRevisions, async (event) => {
    const filePath = getRecord(event).launchContext.filePath;
    return filePath ? historyService.list(filePath) : [];
  });

  ipcMain.handle(IPC_CHANNELS.getRevision, async (event, revisionId: unknown) => {
    const filePath = getRecord(event).launchContext.filePath;
    if (!filePath || typeof revisionId !== "string") return null;
    return historyService.get(filePath, revisionId);
  });

  ipcMain.handle(IPC_CHANNELS.getPreferences, (event) => {
    getRecord(event);
    return preferencesService.get();
  });

  ipcMain.handle(IPC_CHANNELS.setPreferences, (event, input: unknown) => {
    getRecord(event);
    return updatePreferences(preferencesPatchSchema.parse(input) as Partial<AppPreferences>);
  });

  ipcMain.handle(IPC_CHANNELS.restartForUpdate, (event) => {
    getRecord(event);
    if (updateDownloaded) autoUpdater.quitAndInstall();
  });
}

function getRecord(event: IpcMainInvokeEvent): WindowRecord {
  if (!event.senderFrame || event.senderFrame !== event.sender.mainFrame) {
    throw new Error("IPC request was not sent by the top-level application frame.");
  }
  if (!isAllowedRendererUrl(event.senderFrame.url)) {
    throw new Error("IPC request came from an untrusted renderer URL.");
  }
  const record = windows.get(event.sender.id);
  if (!record) throw new Error("The requesting window is no longer registered.");
  return record;
}

function configureAutoUpdater(): void {
  const send = (status: UpdateStatus): void => {
    for (const { browserWindow } of windows.values()) {
      browserWindow.webContents.send(IPC_CHANNELS.updateStatus, status);
    }
  };
  autoUpdater.on("checking-for-update", () => send({ state: "checking" }));
  autoUpdater.on("update-available", (info) => send({ state: "available", version: info.version }));
  autoUpdater.on("update-not-available", () => send({ state: "not-available" }));
  autoUpdater.on("download-progress", ({ percent }) => send({ state: "progress", percent }));
  autoUpdater.on("update-downloaded", (info) => {
    updateDownloaded = true;
    send({ state: "downloaded", version: info.version });
  });
  autoUpdater.on("error", (error) => send({ state: "error", message: error.message }));
  if (app.isPackaged) void autoUpdater.checkForUpdatesAndNotify();
}

async function updatePreferences(patch: Partial<AppPreferences>): Promise<AppPreferences> {
  const preferences = await preferencesService.update(patch);
  if (patch.theme) applyTheme(preferences.theme);
  for (const { browserWindow } of windows.values()) {
    browserWindow.webContents.send(IPC_CHANNELS.preferencesChanged, preferences);
  }
  return preferences;
}

/**
 * nativeTheme drives prefers-color-scheme in every renderer, native dialogs and menus,
 * so "system" follows the OS live and explicit choices override it everywhere at once.
 */
function applyTheme(theme: ThemeMode): void {
  nativeTheme.themeSource = theme;
  installApplicationMenu({
    createNewWindow: () => void createWindow({ document: { circular: true } }),
    openFiles: () => openFilesFromDialog(focusedWindow()),
    openPrimerDesign: () => sendNativeCommand("primer-design"),
    theme,
    setTheme: (next) => void updatePreferences({ theme: next })
  });
}

function currentWindowBackground(): string {
  return nativeTheme.shouldUseDarkColors ? WINDOW_BACKGROUND.dark : WINDOW_BACKGROUND.light;
}

function sendNativeCommand(command: NativeCommand): void {
  focusedWindow()?.webContents.send(IPC_CHANNELS.nativeCommand, command);
}

function findWindowByPath(filePath: string): WindowRecord | undefined {
  const normalized = path.normalize(filePath);
  return [...windows.values()].find(
    ({ launchContext }) =>
      launchContext.filePath && path.normalize(launchContext.filePath) === normalized
  );
}

export function findLaunchFiles(commandLine: string[], development: boolean): string[] {
  const candidates = commandLine.slice(development ? 2 : 1);
  return [...new Set(candidates.filter((candidate) => {
    if (!candidate || candidate.startsWith("-") || candidate === ".") return false;
    return path.extname(candidate).length > 0;
  }))];
}

function isAllowedRendererUrl(targetUrl: string): boolean {
  const developmentUrl = process.env.VITE_DEV_SERVER_URL;
  if (developmentUrl) {
    try {
      return new URL(targetUrl).origin === new URL(developmentUrl).origin;
    } catch {
      return false;
    }
  }
  const rendererUrl = pathToFileURL(path.join(__dirname, "../renderer/index.html")).href;
  return targetUrl === rendererUrl || targetUrl.startsWith(`${rendererUrl}#`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
