import { useEffect, useState } from "react";
import type { DocumentRevision } from "@ove/contracts";
import { PanelHeader } from "./PrimerDesignPanel";

interface VersionHistoryPanelProps {
  close(): void;
  list(): Promise<DocumentRevision[]>;
  restore(revision: DocumentRevision): void;
}

export function VersionHistoryPanel({ close, list, restore }: VersionHistoryPanelProps) {
  const [revisions, setRevisions] = useState<DocumentRevision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void list()
      .then((items) => {
        if (active) setRevisions(items);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Unable to load version history.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [list]);

  return (
    <section className="toolPanel" aria-label="Version History">
      <PanelHeader title="Version History" close={close} />
      <div className="toolPanel__body toolPanel__body--narrow">
        <section className="toolCard">
          <h2>Saved Checkpoints</h2>
          <p className="toolCard__help">Up to 50 successful saves are kept locally for this file. Restoring creates an unsaved edit and never overwrites the file.</p>
          {loading && <p>Loading history…</p>}
          {error && <p className="toolStatus toolStatus--error">{error}</p>}
          {!loading && !error && !revisions.length && <p className="historyEmpty">No saved checkpoints yet.</p>}
          <ol className="historyList">
            {revisions.map((revision) => (
              <li key={revision.id}>
                <div>
                  <strong>{revision.document.name || "Untitled Sequence"}</strong>
                  <span>{new Date(revision.savedAt).toLocaleString()}</span>
                </div>
                <span>{(revision.document.sequence?.length ?? revision.document.proteinSequence?.length ?? 0).toLocaleString()} bp</span>
                <button type="button" onClick={() => { restore(revision); close(); }}>Restore</button>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </section>
  );
}
