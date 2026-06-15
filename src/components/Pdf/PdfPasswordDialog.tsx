import { FormEvent, useEffect, useRef, useState } from 'react';

interface PdfPasswordDialogProps {
  open: boolean;
  fileName: string;
  invalid?: boolean;
  onSubmit: (password: string) => void;
  onCancel: () => void;
}

export default function PdfPasswordDialog({
  open,
  fileName,
  invalid = false,
  onSubmit,
  onCancel,
}: PdfPasswordDialogProps) {
  const [password, setPassword] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setPassword('');
      return;
    }
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  if (!open) return null;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit(password);
  };

  return (
    <div className="settings-overlay">
      <form className="pdf-password-dialog" onSubmit={handleSubmit}>
        <div className="settings-header">
          <span>输入 PDF 密码</span>
          <button type="button" className="settings-close" onClick={onCancel}>×</button>
        </div>
        <div className="pdf-password-body">
          <div className="pdf-password-file" title={fileName}>{fileName}</div>
          <input
            ref={inputRef}
            className="pdf-password-input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {invalid && <div className="pdf-password-error">密码错误，请重新输入。</div>}
        </div>
        <div className="pdf-password-actions">
          <button type="submit" className="confirm-save-button primary">打开</button>
          <button type="button" className="confirm-save-button" onClick={onCancel}>取消</button>
        </div>
      </form>
    </div>
  );
}
