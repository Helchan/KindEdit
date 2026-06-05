import aboutIcon from '../../assets/about-icon.png';

interface AboutDialogProps {
  open: boolean;
  version: string;
  onClose: () => void;
}

export default function AboutDialog({ open, version, onClose }: AboutDialogProps) {
  if (!open) return null;

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="about-dialog" onClick={(e) => e.stopPropagation()}>
        <img className="about-icon" src={aboutIcon} alt="" draggable={false} />
        <div className="about-name">KindEdit</div>
        <div className="about-version">版本 {version}</div>
        <div className="about-copyright">Copyright 2026 Helchan. All rights reserved.</div>
      </div>
    </div>
  );
}
