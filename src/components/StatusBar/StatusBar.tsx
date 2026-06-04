interface StatusBarProps {
  message?: string;
  isError?: boolean;
  docType?: string;
  cursorLine?: number;
  cursorColumn?: number;
}

export default function StatusBar({ message, isError, docType, cursorLine, cursorColumn }: StatusBarProps) {
  return (
    <div className="status-bar">
      <div className={`status-bar-left${isError ? ' error' : ''}`}>
        {message || ''}
      </div>
      <div className="status-bar-right">
        {docType && <span>{docType}</span>}
        {cursorLine != null && cursorColumn != null && (
          <span>Ln {cursorLine}, Col {cursorColumn}</span>
        )}
      </div>
    </div>
  );
}
