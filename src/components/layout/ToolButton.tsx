import type { ReactNode } from "react";

interface Props {
  active?: boolean;
  title: string;
  children: ReactNode;
  onClick: () => void;
}

export function ToolButton({ active, title, children, onClick }: Props) {
  return (
    <button className={`tool-button ${active ? "active" : ""}`} title={title} aria-label={title} onClick={onClick}>
      {children}
    </button>
  );
}
