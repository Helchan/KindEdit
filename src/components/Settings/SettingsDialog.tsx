import { useCallback } from 'react';
import { AppConfig } from '../../stores/configStore';

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  config: AppConfig;
  onConfigChange: (config: Partial<AppConfig>) => void;
}

const DEFAULT_CONFIG: AppConfig = {
  theme: 'system',
  textFontSize: 14,
  treeFontSize: 13,
  syncDisplay: true,
  sqlUppercaseKeywords: true,
};

export default function SettingsDialog({ open, onClose, config, onConfigChange }: SettingsDialogProps) {
  if (!open) return null;

  const applyChange = useCallback((updates: Partial<AppConfig>) => {
    onConfigChange(updates);
  }, [onConfigChange]);

  const handleReset = useCallback(() => {
    onConfigChange(DEFAULT_CONFIG);
  }, [onConfigChange]);

  const clampFontSize = (value: number): number => {
    return Math.max(8, Math.min(28, value));
  };

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <span>设置</span>
        </div>
        <div className="settings-body">
          {/* Theme */}
          <div className="settings-row">
            <span className="settings-label">主题</span>
            <div className="settings-select">
              {(['system', 'light', 'dark'] as const).map((theme) => (
                <button
                  key={theme}
                  className={`settings-select-option${config.theme === theme ? ' active' : ''}`}
                  onClick={() => applyChange({ theme })}
                >
                  {theme === 'system' ? '跟随系统' : theme === 'light' ? '明亮' : '暗色'}
                </button>
              ))}
            </div>
          </div>

          {/* Text Font Size */}
          <div className="settings-row">
            <span className="settings-label">编辑器字体大小</span>
            <input
              type="number"
              className="settings-input"
              min={8}
              max={28}
              value={config.textFontSize}
              onChange={(e) => applyChange({ textFontSize: clampFontSize(Number(e.target.value)) })}
            />
          </div>

          {/* Tree Font Size */}
          <div className="settings-row">
            <span className="settings-label">树视图字体大小</span>
            <input
              type="number"
              className="settings-input"
              min={8}
              max={28}
              value={config.treeFontSize}
              onChange={(e) => applyChange({ treeFontSize: clampFontSize(Number(e.target.value)) })}
            />
          </div>

          {/* Sync Display */}
          <div className="settings-row">
            <span className="settings-label">同步显示</span>
            <div
              className={`settings-switch${config.syncDisplay ? ' on' : ''}`}
              onClick={() => applyChange({ syncDisplay: !config.syncDisplay })}
            />
          </div>

          {/* SQL Uppercase Keywords */}
          <div className="settings-row">
            <span className="settings-label">SQL格式化大写关键字</span>
            <div
              className={`settings-switch${config.sqlUppercaseKeywords ? ' on' : ''}`}
              onClick={() => applyChange({ sqlUppercaseKeywords: !config.sqlUppercaseKeywords })}
            />
          </div>
        </div>
        <div className="settings-footer">
          <button className="settings-btn" onClick={handleReset}>重置</button>
          <button className="settings-btn" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  );
}
