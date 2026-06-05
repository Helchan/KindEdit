interface ToolbarProps {
  onOpenFile: () => void;
  onSaveFile: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onOpenSettings: () => void;
  onAbout: () => void;
}

export default function Toolbar({ onOpenFile, onSaveFile, onUndo, onRedo, onOpenSettings, onAbout }: ToolbarProps) {
  return (
    <div className="toolbar">
      <button className="toolbar-btn" onClick={onOpenFile} title="打开文件">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 4h4l2 2h6v7H2V4z" />
        </svg>
      </button>
      <button className="toolbar-btn" onClick={onSaveFile} title="保存">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 2h8l3 3v9H3V2z" />
          <path d="M5 2v4h5V2" />
          <path d="M5 10h6" />
        </svg>
      </button>
      <div className="toolbar-separator" />
      <button className="toolbar-btn" onClick={onUndo} title="回退">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6.2 3.4L3 6.6l3.2 3.2" />
          <path d="M3 6.6h6.7a3.4 3.4 0 0 1 0 6.8H7.5" />
        </svg>
      </button>
      <button className="toolbar-btn" onClick={onRedo} title="重做">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9.8 3.4L13 6.6l-3.2 3.2" />
          <path d="M13 6.6H6.3a3.4 3.4 0 0 0 0 6.8h2.2" />
        </svg>
      </button>
      <div className="toolbar-separator" />
      <button className="toolbar-btn" onClick={onOpenSettings} title="设置">
        <svg viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd"/>
        </svg>
      </button>
      <button className="toolbar-btn" onClick={onAbout} title="关于">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="8" cy="8" r="6" />
          <line x1="8" y1="7" x2="8" y2="11" />
          <circle cx="8" cy="5" r="0.5" fill="currentColor" stroke="none" />
        </svg>
      </button>
    </div>
  );
}
