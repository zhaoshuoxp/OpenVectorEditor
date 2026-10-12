import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AppPreferences,
  DocumentRevision,
  LaunchContext,
  SequenceDocument,
  ThemeMode,
  UpdateStatus
} from "@ove/contracts";
import {
  TeselagenOveAdapter,
  AXIS_FONT_SCALE_VALUES,
  type AuxiliaryTool,
  type AxisFontScale,
  type EditorSession
} from "@ove/editor-engine";
import { TOOL_REGISTRY } from "./tools/registry";
import { ThemeSwitch, usePrefersDark } from "./theme";

const originalTitle = "Open Vector Editor";

export function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<EditorSession | null>(null);
  const preferencesRef = useRef<AppPreferences | null>(null);
  const [launch, setLaunch] = useState<LaunchContext | null>(null);
  const [preferences, setPreferences] = useState<AppPreferences | null>(null);
  const [activeTool, setActiveTool] = useState<AuxiliaryTool | null>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [fatalError, setFatalError] = useState("");
  const prefersDark = usePrefersDark();

  useEffect(() => {
    let active = true;
    if (!window.desktopApi) {
      setFatalError("The secure desktop bridge did not load. Please reinstall the application.");
      return () => {
        active = false;
      };
    }
    void Promise.all([
      window.desktopApi.getLaunchContext(),
      window.desktopApi.getPreferences()
    ])
      .then(async ([context, savedPreferences]) => {
        if (!active) return;
        const migratedPreferences = await migrateLegacyPreferences(savedPreferences);
        if (!active) return;
        preferencesRef.current = migratedPreferences;
        setLaunch(context);
        setPreferences(migratedPreferences);
      })
      .catch((error: unknown) => {
        if (active) setFatalError(error instanceof Error ? error.message : "Unable to start Open Vector Editor.");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!launch || !preferences || !hostRef.current || sessionRef.current) return;
    const editorNode = document.createElement("div");
    editorNode.className = "oveEditorHost";
    hostRef.current.appendChild(editorNode);
    let session: EditorSession;
    try {
      const adapter = new TeselagenOveAdapter();
      session = adapter.mount(editorNode, {
        document: launch.document,
        axisFontScalePercent: preferences.axisFontScalePercent,
        onAxisFontScaleChange: (percent) => void updateAxisFontScale(percent),
        onOpenTool: setActiveTool,
        onRename: setTitle,
        onSave: async (mode, document, onSuccess) => {
          const result = await window.desktopApi.saveDocument({ mode, document });
          if (result.canceled) return;
          const savedDocument = {
            ...document,
            ...(result.documentName ? { name: result.documentName } : {})
          };
          sessionRef.current?.updateDocument(savedDocument);
          setLaunch((current) => current
            ? { document: savedDocument, ...(result.filePath ? { filePath: result.filePath } : {}) }
            : current
          );
          setTitle(savedDocument.name);
          onSuccess();
          notifySuccess(`Sequence saved to ${result.filePath ?? "file"}`);
        }
      });
    } catch (error) {
      editorNode.remove();
      setFatalError(error instanceof Error ? error.message : "The editor could not be initialized.");
      return;
    }
    sessionRef.current = session;
    setTitle(launch.document.name);
    return () => {
      sessionRef.current = null;
      session.destroy();
      if (editorNode.isConnected) editorNode.remove();
    };
  }, [launch !== null, preferences !== null]);

  // Main sets nativeTheme.themeSource from the preference, so prefers-color-scheme already
  // reflects explicit choices; the preference is still consulted so the switch never lags.
  const isDark = preferences?.theme === "dark" || (preferences?.theme !== "light" && prefersDark);
  useEffect(() => {
    document.body.classList.toggle("bp3-dark", isDark);
    document.body.classList.toggle("ve-dark-mode", isDark);
  }, [isDark]);

  const axisFontScalePercent = preferences?.axisFontScalePercent;
  useEffect(() => {
    if (!axisFontScalePercent) return;
    applyAxisFontScale(axisFontScalePercent);
    sessionRef.current?.setAxisFontScalePercent(axisFontScalePercent);
  }, [axisFontScalePercent]);

  useEffect(() => {
    if (!window.desktopApi) return;
    const removeNative = window.desktopApi.onNativeCommand((command) => {
      if (command === "primer-design") setActiveTool("primer-design");
      if (command === "open-file") void window.desktopApi.openFiles();
    });
    const removeUpdate = window.desktopApi.onUpdateStatus(setUpdateStatus);
    const removePreferences = window.desktopApi.onPreferencesChanged(applyPreferences);
    return () => {
      removeNative();
      removeUpdate();
      removePreferences();
    };
  }, []);

  function applyPreferences(next: AppPreferences): void {
    preferencesRef.current = next;
    setPreferences(next);
  }

  const savePreferences = async (patch: Partial<AppPreferences>): Promise<void> => {
    applyPreferences(await window.desktopApi.setPreferences(patch));
  };
  const updateAxisFontScale = (percent: AxisFontScale) => savePreferences({ axisFontScalePercent: percent });
  const setTheme = (theme: ThemeMode) => savePreferences({ theme });

  const getDocument = (): SequenceDocument => sessionRef.current?.getDocument() ?? launch?.document ?? {};
  const closeTool = (): void => setActiveTool(null);
  const listRevisions = useCallback(() => window.desktopApi.listRevisions(), []);
  const restoreRevision = (revision: DocumentRevision): void => {
    const restored = { ...revision.document, name: revision.document.name || "Untitled Sequence" };
    sessionRef.current?.updateDocument(restored);
    setLaunch((current) => current ? { ...current, document: restored } : current);
    setTitle(restored.name);
    notifySuccess("Version restored as an unsaved edit.");
  };
  const activeToolDefinition = activeTool ? TOOL_REGISTRY.get(activeTool) : undefined;
  const activeSession = sessionRef.current;

  if (fatalError) {
    return <main className="fatalError"><h1>Open Vector Editor could not start</h1><p>{fatalError}</p></main>;
  }

  return (
    <>
      <div id="editor-root" ref={hostRef} />
      {(!launch || !preferences) && <main className="startupStatus">Loading Open Vector Editor…</main>}
      {preferences && <ThemeSwitch value={preferences.theme} onChange={(theme) => void setTheme(theme)} />}

      {activeToolDefinition && activeSession && activeToolDefinition.render({
        document: getDocument(),
        session: activeSession,
        close: closeTool,
        listRevisions,
        restoreRevision
      })}

      {updateStatus && <UpdateNotification status={updateStatus} close={() => setUpdateStatus(null)} />}
    </>
  );
}

function UpdateNotification({ status, close }: { status: UpdateStatus; close(): void }) {
  const message = updateMessage(status);
  if (!message) return null;
  return (
    <aside id="notification" className={status.state === "error" ? "notification--error" : undefined} aria-live="polite">
      <button className="notification__close" aria-label="Dismiss update notification" type="button" onClick={close}>×</button>
      <p>{message}</p>
      {status.state === "progress" && (
        <progress className="notification__progress" max={100} value={Math.round(status.percent)} />
      )}
      {status.state === "downloaded" && (
        <button className="toolPanel__primary" type="button" onClick={() => void window.desktopApi.restartForUpdate()}>Restart</button>
      )}
    </aside>
  );
}

function updateMessage(status: UpdateStatus): string {
  switch (status.state) {
    case "checking": return "Checking for updates…";
    case "available": return `Version ${status.version ?? "update"} is available. Downloading now…`;
    case "not-available": return "";
    case "progress": return `Downloading update: ${Math.round(status.percent)}%`;
    case "downloaded": return "Update downloaded. It will be installed on restart. Restart now?";
    case "error": return `Error updating: ${status.message}`;
  }
}

function setTitle(name: string | undefined): void {
  document.title = `${originalTitle} -- ${name || "Untitled Sequence"}`;
}

function applyAxisFontScale(percent: AxisFontScale): void {
  const id = "ove-circular-view-dynamic-style";
  let element = document.getElementById(id);
  if (!element) {
    element = document.createElement("style");
    element.id = id;
    document.head.appendChild(element);
  }
  const fontSize = Math.max(6, Math.round(12 * percent / 100));
  element.textContent = `
    .veCircularView .veAxis text,
    .veCircularView g[class*="axis"] text,
    .veCircularView g[class*="Axis"] text,
    .veCircularView text[class*="axis"],
    .veCircularView text[class*="Axis"] { font-size: ${fontSize}px !important; }
    .veCircularView { background: transparent !important; border: none !important; }
  `;
}

function notifySuccess(message: string): void {
  if (window.toastr) window.toastr.success(message);
}

const LEGACY_DARK_MODE_KEY = "isDarkMode";
const LEGACY_AXIS_SCALE_KEY = "oveAxisFontScalePercent";

/**
 * Releases before preferences.json kept these values in localStorage. They are imported once
 * and then removed, so later explicit choices (including "system") are never overridden.
 */
async function migrateLegacyPreferences(preferences: AppPreferences): Promise<AppPreferences> {
  let storage: Storage;
  try {
    storage = window.localStorage;
  } catch {
    return preferences;
  }
  const legacyDarkMode = storage.getItem(LEGACY_DARK_MODE_KEY);
  const legacyAxisScale = storage.getItem(LEGACY_AXIS_SCALE_KEY);
  if (legacyDarkMode === null && legacyAxisScale === null) return preferences;

  const patch: Partial<AppPreferences> = {};
  if (legacyDarkMode === "true" && preferences.theme === "system") patch.theme = "dark";
  const axisScale = Number(legacyAxisScale);
  if (AXIS_FONT_SCALE_VALUES.includes(axisScale as AxisFontScale)) {
    patch.axisFontScalePercent = axisScale as AxisFontScale;
  }
  const migrated = Object.keys(patch).length ? await window.desktopApi.setPreferences(patch) : preferences;
  storage.removeItem(LEGACY_DARK_MODE_KEY);
  storage.removeItem(LEGACY_AXIS_SCALE_KEY);
  return migrated;
}
