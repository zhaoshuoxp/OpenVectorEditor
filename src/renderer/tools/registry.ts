import { createElement, type ReactNode } from "react";
import type { DocumentRevision, SequenceDocument } from "@ove/contracts";
import type { AuxiliaryTool, EditorSession } from "@ove/editor-engine";
import { AlignmentPanel } from "./AlignmentPanel";
import { AutoAnnotatePanel } from "./AutoAnnotatePanel";
import { PrimerDesignPanel } from "./PrimerDesignPanel";
import { VersionHistoryPanel } from "./VersionHistoryPanel";

export interface ToolContext {
  document: SequenceDocument;
  session: EditorSession;
  close(): void;
  listRevisions(): Promise<DocumentRevision[]>;
  restoreRevision(revision: DocumentRevision): void;
}

export interface ToolDefinition {
  id: AuxiliaryTool;
  label: string;
  toolbarTool: "oligoTool" | "alignmentTool" | "versionHistoryTool" | null;
  render(context: ToolContext): ReactNode;
}

const definitions: ToolDefinition[] = [
  {
    id: "primer-design",
    label: "Primer Design",
    toolbarTool: "oligoTool",
    render: ({ document, session, close }) => createElement(PrimerDesignPanel, {
      document,
      selection: session.getSelection(),
      design: (request) => window.desktopApi.designPrimers(request),
      cancel: () => window.desktopApi.cancelPrimerDesign(),
      close
    })
  },
  {
    id: "alignment",
    label: "Alignment",
    toolbarTool: "alignmentTool",
    render: ({ document, session, close }) => createElement(AlignmentPanel, {
      document,
      chooseFiles: () => window.desktopApi.chooseAlignmentFiles(),
      align: (request) => window.desktopApi.runAlignment(request),
      cancel: () => window.desktopApi.cancelAlignment(),
      apply: (result) => session.addAlignment(result),
      close
    })
  },
  {
    id: "version-history",
    label: "Version History",
    toolbarTool: "versionHistoryTool",
    render: ({ close, listRevisions, restoreRevision }) => createElement(VersionHistoryPanel, {
      list: listRevisions,
      restore: restoreRevision,
      close
    })
  },
  ...(["features", "parts", "primers"] as const).map((kind): ToolDefinition => ({
    id: `auto-annotate-${kind}`,
    label: `Auto Annotate ${kind[0]!.toUpperCase()}${kind.slice(1)}`,
    toolbarTool: null,
    render: ({ document, session, close }) => createElement(AutoAnnotatePanel, {
      kind,
      document,
      apply: (nextDocument) => session.updateDocument(nextDocument),
      close
    })
  }))
];

export const TOOL_REGISTRY: ReadonlyMap<AuxiliaryTool, ToolDefinition> = new Map(
  definitions.map((definition) => [definition.id, definition])
);
