interface TabProps {
  id: string;
  title: string;
  active: boolean;
  dirty: boolean;
  dragging: boolean;
  dragOffsetX: number;
  onSelect: () => void;
  onClose: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
}

export default function Tab({
  id,
  title,
  active,
  dirty,
  dragging,
  dragOffsetX,
  onSelect,
  onClose,
  onContextMenu,
  onPointerDown,
  onPointerMove,
}: TabProps) {
  return (
    <div
      className={`tab${active ? ' active' : ''}${dragging ? ' dragging' : ''}`}
      data-tab-id={id}
      style={dragging ? { transform: `translateX(${dragOffsetX}px)` } : undefined}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
    >
      <span className="tab-title">
        {title}{dirty && <sup className="tab-dirty-mark">*</sup>}
      </span>
      <button
        className="tab-close"
        onPointerDown={(e) => {
          e.stopPropagation();
        }}
        onClick={(e) => {
          e.stopPropagation();
          onClose(e);
        }}
        title="Close"
      >
        ×
      </button>
    </div>
  );
}
