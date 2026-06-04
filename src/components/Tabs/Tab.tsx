interface TabProps {
  id: string;
  title: string;
  active: boolean;
  dirty: boolean;
  onSelect: () => void;
  onClose: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

export default function Tab({ title, active, dirty, onSelect, onClose, onContextMenu }: TabProps) {
  return (
    <div
      className={`tab${active ? ' active' : ''}`}
      onClick={onSelect}
      onContextMenu={onContextMenu}
    >
      <span className="tab-title">
        {title}{dirty && <sup className="tab-dirty-mark">*</sup>}
      </span>
      <button
        className="tab-close"
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
