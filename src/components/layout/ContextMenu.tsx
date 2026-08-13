import { useCadStore } from "../../store/useCadStore";

export function ContextMenu() {
  const menu = useCadStore((state) => state.contextMenu);
  const copySelected = useCadStore((state) => state.copySelected);
  const duplicateSelected = useCadStore((state) => state.duplicateSelected);
  const deleteSelected = useCadStore((state) => state.deleteSelected);
  const bringForward = useCadStore((state) => state.bringForward);
  const sendBackward = useCadStore((state) => state.sendBackward);
  const lockObjects = useCadStore((state) => state.lockObjects);
  const setContextMenu = useCadStore((state) => state.setContextMenu);

  if (!menu) return null;
  const run = (callback: () => void) => {
    callback();
    setContextMenu(null);
  };

  return (
    <div className="context-menu" style={{ left: menu.x, top: menu.y }}>
      <button onClick={() => run(copySelected)}>Copy</button>
      <button onClick={() => run(duplicateSelected)}>Duplicate</button>
      <button onClick={() => run(deleteSelected)}>Delete</button>
      <hr />
      <button onClick={() => run(() => bringForward(menu.ids))}>Bring Forward</button>
      <button onClick={() => run(() => sendBackward(menu.ids))}>Send Backward</button>
      <hr />
      <button onClick={() => run(() => lockObjects(menu.ids, true))}>Lock</button>
      <button onClick={() => run(() => lockObjects(menu.ids, false))}>Unlock</button>
    </div>
  );
}
