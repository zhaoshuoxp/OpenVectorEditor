export const IPC_CHANNELS = {
  getLaunchContext: "desktop:get-launch-context",
  openFiles: "desktop:open-files",
  saveDocument: "desktop:save-document",
  designPrimers: "desktop:design-primers",
  cancelPrimerDesign: "desktop:cancel-primer-design",
  runAlignment: "desktop:run-alignment",
  cancelAlignment: "desktop:cancel-alignment",
  chooseAlignmentFiles: "desktop:choose-alignment-files",
  listRevisions: "desktop:list-revisions",
  getRevision: "desktop:get-revision",
  getPreferences: "desktop:get-preferences",
  setPreferences: "desktop:set-preferences",
  restartForUpdate: "desktop:restart-for-update",
  nativeCommand: "desktop:native-command",
  updateStatus: "desktop:update-status",
  preferencesChanged: "desktop:preferences-changed"
} as const;
