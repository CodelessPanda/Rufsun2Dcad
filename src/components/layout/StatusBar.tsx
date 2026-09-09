import { useCadStore } from "../../store/useCadStore";
import { formatMetric } from "../../cad/geometry/geometry";
import { zoomPercent } from "../../cad/viewport/viewport";

export function StatusBar() {
  const pointer = useCadStore((state) => state.pointerWorld);
  const document = useCadStore((state) => state.document);
  const viewport = useCadStore((state) => state.viewport);
  const autosaveStatus = useCadStore((state) => state.autosaveStatus);
  const historyPast = useCadStore((state) => state.historyPast);
  const historyFuture = useCadStore((state) => state.historyFuture);
  const undo = useCadStore((state) => state.undo);
  const redo = useCadStore((state) => state.redo);
  const solarObjects = document.objects.filter((object) => object.type === "solarPanel");
  const watts = solarObjects.reduce((sum, object) => sum + (object.type === "solarPanel" ? object.wattage : 0), 0);

  const canUndo = historyPast.length > 0;
  const canRedo = historyFuture.length > 0;

  return (
    <footer className="statusbar">
      <span>X: {formatMetric(pointer.x)}</span>
      <span>Y: {formatMetric(pointer.y)}</span>
      <span>Grid: {document.settings.grid.minor} mm</span>
      <span>Snap: {document.settings.snap.enabled ? "ON" : "OFF"}</span>
      <span>Objects: {document.objects.length}</span>
      <span>Modules: {solarObjects.length}</span>
      <span>DC: {(watts / 1000).toFixed(2)} kWp</span>
      <span>Zoom: {zoomPercent(viewport.scale)}%</span>
      <button
        className={`statusbar-action${canUndo ? "" : " disabled"}`}
        onClick={() => canUndo && undo()}
        title="Undo (Ctrl+Z)"
        disabled={!canUndo}
      >
        ↩ Undo{historyPast.length > 0 ? ` (${historyPast.length})` : ""}
      </button>
      <button
        className={`statusbar-action${canRedo ? "" : " disabled"}`}
        onClick={() => canRedo && redo()}
        title="Redo (Ctrl+Y)"
        disabled={!canRedo}
      >
        ↪ Redo{historyFuture.length > 0 ? ` (${historyFuture.length})` : ""}
      </button>
      <span className={`save-state ${autosaveStatus}`}>
        {autosaveStatus === "idle" ? "Ready" : autosaveStatus === "saved" ? "Saved locally" : autosaveStatus === "saving" ? "Saving..." : "Autosave error"}
      </span>
    </footer>
  );
}
