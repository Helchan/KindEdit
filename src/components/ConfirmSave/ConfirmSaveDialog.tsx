export type ConfirmSaveChoice = 'yes' | 'no' | 'noAll' | 'cancel';

interface ConfirmSaveDialogProps {
  open: boolean;
  subject: string;
  allowNoAll: boolean;
  onChoice: (choice: ConfirmSaveChoice) => void;
}

export default function ConfirmSaveDialog({
  open,
  subject,
  allowNoAll,
  onChoice,
}: ConfirmSaveDialogProps) {
  if (!open) return null;

  return (
    <div className="settings-overlay">
      <div
        className="settings-dialog confirm-save-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-save-title"
      >
        <div className="settings-header">
          <span id="confirm-save-title">确认保存</span>
        </div>
        <div className="confirm-save-body">
          <p>「{subject}」有未保存的修改，确认是否保存？</p>
        </div>
        <div className="settings-footer confirm-save-footer">
          <button className="settings-btn primary" onClick={() => onChoice('yes')}>是</button>
          <button className="settings-btn" onClick={() => onChoice('no')}>否</button>
          {allowNoAll && (
            <button className="settings-btn" onClick={() => onChoice('noAll')}>全否</button>
          )}
          <button className="settings-btn" onClick={() => onChoice('cancel')}>取消</button>
        </div>
      </div>
    </div>
  );
}
