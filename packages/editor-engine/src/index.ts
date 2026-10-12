// Must stay the first import: it seeds settings OVE reads while its own module is evaluated.
import "./defaults";
import {
  createVectorEditor,
  type OveEditorInstance,
  type OveEditorState
} from "@teselagen/ove";
import type {
  AlignmentResult,
  SequenceDocument,
  SequenceSelection
} from "@ove/contracts";
export { getRangeSequence, normalizeDnaSequence } from "./sequence";

export const AXIS_FONT_SCALE_VALUES = [33, 50, 75, 100, 125, 150, 200] as const;
export type AxisFontScale = (typeof AXIS_FONT_SCALE_VALUES)[number];
export type AuxiliaryTool =
  | "primer-design"
  | "alignment"
  | "version-history"
  | "auto-annotate-features"
  | "auto-annotate-parts"
  | "auto-annotate-primers";

export interface EditorMountOptions {
  document: SequenceDocument;
  axisFontScalePercent: AxisFontScale;
  onAxisFontScaleChange(percent: AxisFontScale): void;
  onOpenTool(tool: AuxiliaryTool): void;
  onRename(name: string): void;
  onSave(
    mode: "save" | "saveAs",
    document: SequenceDocument,
    onSuccess: () => void
  ): Promise<void>;
}

export interface EditorSession {
  getDocument(): SequenceDocument;
  getSelection(): SequenceSelection | null;
  updateDocument(document: SequenceDocument, clearHistory?: boolean): void;
  addAlignment(alignment: AlignmentResult): void;
  setAxisFontScalePercent(percent: AxisFontScale): void;
  refreshMenus(): void;
  destroy(): void;
}

export interface EditorEngine {
  mount(container: HTMLElement, options: EditorMountOptions): EditorSession;
}

interface MenuItemDefinition {
  text?: string;
  cmd?: string;
  submenu?: MenuEntry[];
  checked?: boolean;
  shouldDismissPopover?: boolean;
  oveElectronItem?: string;
  onClick?: () => void;
  [key: string]: unknown;
}
type MenuEntry = MenuItemDefinition | string;

function isMenuItem(entry: MenuEntry): entry is MenuItemDefinition {
  return typeof entry === "object" && entry !== null;
}

function buildPanelsShown(document: SequenceDocument) {
  return [
    [
      { id: "circular", name: "Circular Map", active: document.circular !== false },
      { id: "rail", name: "Linear Map", active: document.circular === false }
    ],
    [
      { id: "sequence", name: "Sequence Map", active: true },
      { id: "properties", name: "Properties" }
    ]
  ];
}

function makeMenuFilter(options: EditorMountOptions) {
  return (menu: MenuItemDefinition[]): MenuItemDefinition[] => {
    const fileMenu = menu.find((item) => item.text === "File");
    const exportMenu = fileMenu?.submenu?.find(
      (item): item is MenuItemDefinition => isMenuItem(item) && item.text === "Export Sequence"
    );
    if (exportMenu) {
      exportMenu.submenu = [
        { cmd: "exportSequenceAsGenbank" },
        {
          cmd: options.document.proteinSequence && !options.document.sequence
            ? "exportProteinSequenceAsFasta"
            : "exportDNASequenceAsFasta",
          text: "Export Sequence As Fasta"
        },
        { cmd: "exportSequenceAsTeselagenJson" }
      ];
    }
    if (fileMenu?.submenu) {
      const historyIndex = fileMenu.submenu.findIndex(
        (item) => isMenuItem(item) && item.cmd === "viewRevisionHistory"
      );
      if (historyIndex >= 0) {
        fileMenu.submenu[historyIndex] = {
          text: "Revision History",
          shouldDismissPopover: true,
          onClick: () => options.onOpenTool("version-history")
        };
      }
    }

    const viewMenu = menu.find((item) => item.text === "View");
    if (viewMenu?.submenu) {
      viewMenu.submenu = viewMenu.submenu.filter(
        (item) => !isMenuItem(item) || item.cmd !== "toggleChromatogram"
      );
    }
    const labelsMenu = viewMenu?.submenu?.find(
      (item): item is MenuItemDefinition => isMenuItem(item) && item.text === "Labels"
    );
    if (labelsMenu?.submenu) {
      const axisItem: MenuItemDefinition = {
        oveElectronItem: "axis-font-scale",
        text: "Axis Font Scale",
        submenu: AXIS_FONT_SCALE_VALUES.map((percent) => ({
          text: `${percent}%`,
          checked: options.axisFontScalePercent === percent,
          shouldDismissPopover: true,
          onClick: () => options.onAxisFontScaleChange(percent)
        }))
      };
      const existing = labelsMenu.submenu.findIndex(
        (item) => isMenuItem(item) && item.oveElectronItem === "axis-font-scale"
      );
      if (existing >= 0) labelsMenu.submenu[existing] = axisItem;
      else {
        const labelSize = labelsMenu.submenu.findIndex(
          (item) => isMenuItem(item) && item.cmd === "adjustLabelSize"
        );
        labelsMenu.submenu.splice(labelSize >= 0 ? labelSize + 1 : labelsMenu.submenu.length, 0, axisItem);
      }
    }

    const toolsMenu = menu.find((item) => item.text === "Tools");
    if (toolsMenu?.submenu) {
      const primerItem: MenuItemDefinition = {
        oveElectronItem: "primer-design",
        text: "Primer Design",
        shouldDismissPopover: true,
        onClick: () => options.onOpenTool("primer-design")
      };
      const existing = toolsMenu.submenu.findIndex(
        (item) => isMenuItem(item) && item.oveElectronItem === "primer-design"
      );
      if (existing >= 0) toolsMenu.submenu[existing] = primerItem;
      else toolsMenu.submenu.push(primerItem);
    }
    return menu;
  };
}

export class TeselagenOveAdapter implements EditorEngine {
  public mount(container: HTMLElement, options: EditorMountOptions): EditorSession {
    let currentOptions = options;
    const editorName = `ove-electron-${crypto.randomUUID()}`;
    const menuFilter = makeMenuFilter(currentOptions);
    let instance: OveEditorInstance;

    const saveHandler = (mode: "save" | "saveAs") =>
      async (
        _event: unknown,
        document: SequenceDocument,
        _editorProps: unknown,
        onSuccess: () => void
      ): Promise<void> => currentOptions.onSave(mode, document, onSuccess);

    instance = createVectorEditor(container, {
      editorName,
      autoAnnotateFeatures: () => currentOptions.onOpenTool("auto-annotate-features"),
      autoAnnotateParts: () => currentOptions.onOpenTool("auto-annotate-parts"),
      autoAnnotatePrimers: () => currentOptions.onOpenTool("auto-annotate-primers"),
      isFullscreen: true,
      showCicularViewInternalLabels: true,
      menuFilter,
      allowPrimerBasesToBeEdited: true,
      defaultLinkedOligoMessage: "",
      shouldAutosave: false,
      alwaysAllowSave: true,
      showMenuBar: true,
      onRename: currentOptions.onRename,
      onSave: saveHandler("save"),
      onSaveAs: saveHandler("saveAs"),
      onImport: (document: SequenceDocument) => {
        updateDocument(document);
      },
      PropertiesProps: {
        propertiesList: [
          "general",
          "features",
          "parts",
          "primers",
          "translations",
          "cutsites",
          "orfs",
          "genbank"
        ]
      },
      ToolBarProps: {
        toolList: [
          "saveTool",
          "downloadTool",
          "importTool",
          "undoTool",
          "redoTool",
          "cutsiteTool",
          "featureTool",
          {
            name: "alignmentTool",
            onIconClick: () => currentOptions.onOpenTool("alignment"),
            tooltip: "Align to This Sequence",
            noDropdownIcon: true
          },
          {
            name: "versionHistoryTool",
            onIconClick: () => currentOptions.onOpenTool("version-history"),
            tooltip: "View Version History"
          },
          "orfTool",
          "editTool",
          "findTool",
          "visibilityTool",
          {
            name: "oligoTool",
            onIconClick: () => currentOptions.onOpenTool("primer-design"),
            toggled: false,
            tooltip: "Primer Design",
            tooltipToggled: "Primer Design"
          }
        ]
      }
    });

    const updateDocument = (document: SequenceDocument, clearHistory = false): void => {
      currentOptions = { ...currentOptions, document };
      instance.updateEditor({
        sequenceData: document,
        menuFilter: makeMenuFilter(currentOptions),
        ...(clearHistory ? { sequenceDataHistory: {} } : {}),
        showCicularViewInternalLabels: true,
        annotationVisibility: { orfTranslations: false },
        readOnly: false,
        panelsShown: buildPanelsShown(document),
        annotationsToSupport: {
          features: true,
          translations: true,
          parts: true,
          orfs: true,
          cutsites: true,
          primers: true
        }
      });
    };
    updateDocument(options.document, true);

    return {
      getDocument: () => {
        const state = instance.getState();
        return state.sequenceData ?? {};
      },
      getSelection: () => normalizeSelection(instance.getState()),
      updateDocument,
      addAlignment: (alignment) => instance.addAlignment({
        id: alignment.id,
        name: alignment.name,
        ...(alignment.pairwiseTracks?.length
          ? { pairwiseAlignments: alignment.pairwiseTracks }
          : { alignmentTracks: alignment.tracks })
      }),
      setAxisFontScalePercent: (percent) => {
        currentOptions = { ...currentOptions, axisFontScalePercent: percent };
        instance.updateEditor({ menuFilter: makeMenuFilter(currentOptions) });
      },
      refreshMenus: () => {
        instance.updateEditor({ menuFilter: makeMenuFilter(currentOptions) });
      },
      destroy: () => instance.close()
    };
  }
}

function normalizeSelection(state: OveEditorState): SequenceSelection | null {
  const selection = state.selectionLayer;
  if (
    !selection ||
    !Number.isInteger(selection.start) ||
    !Number.isInteger(selection.end) ||
    selection.start < 0 ||
    selection.end < 0
  ) {
    return null;
  }
  return { start: selection.start, end: selection.end };
}
