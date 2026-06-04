import { useEffect, useRef, useCallback, useState } from 'react';

export interface MenuItem {
  label: string;
  action?: () => void;
  disabled?: boolean;
  separator?: boolean;
  checked?: boolean;
  submenu?: MenuItem[];
}

interface ContextMenuProps {
  visible: boolean;
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export default function ContextMenu({ visible, x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  const adjustPosition = useCallback(() => {
    if (!menuRef.current || !visible) return;
    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let adjustedX = x;
    let adjustedY = y;

    if (x + rect.width > vw) {
      adjustedX = vw - rect.width - 4;
    }
    if (y + rect.height > vh) {
      adjustedY = vh - rect.height - 4;
    }

    menuRef.current.style.left = `${Math.max(0, adjustedX)}px`;
    menuRef.current.style.top = `${Math.max(0, adjustedY)}px`;
  }, [x, y, visible]);

  useEffect(() => {
    adjustPosition();
  }, [adjustPosition]);

  useEffect(() => {
    if (!visible) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [visible, onClose]);

  if (!visible) return null;

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{ left: x, top: y }}
    >
      {items.map((item, index) => {
        if (item.separator) {
          return <div key={index} className="context-menu-separator" />;
        }
        if (item.submenu) {
          return (
            <SubMenuItem
              key={index}
              item={item}
              onClose={onClose}
            />
          );
        }
        return (
          <div
            key={index}
            className={`context-menu-item${item.disabled ? ' disabled' : ''}`}
            onClick={() => {
              if (!item.disabled && item.action) {
                item.action();
                onClose();
              }
            }}
          >
            <span className="context-menu-check">
              {item.checked !== undefined ? (item.checked ? '✓' : '') : ''}
            </span>
            <span className="context-menu-label">{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function SubMenuItem({ item, onClose }: { item: MenuItem; onClose: () => void }) {
  const [open, setOpen] = useState(false);
  const itemRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLDivElement>(null);

  // Adjust submenu position to stay in viewport
  useEffect(() => {
    if (!open || !itemRef.current || !subRef.current) return;
    const parentRect = itemRef.current.getBoundingClientRect();
    const subRect = subRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Horizontal: prefer right, fallback left
    if (parentRect.right + subRect.width > vw) {
      subRef.current.style.left = 'auto';
      subRef.current.style.right = '100%';
    } else {
      subRef.current.style.left = '100%';
      subRef.current.style.right = 'auto';
    }

    // Vertical: keep within viewport
    if (parentRect.top + subRect.height > vh) {
      subRef.current.style.top = 'auto';
      subRef.current.style.bottom = '0';
    } else {
      subRef.current.style.top = '0';
      subRef.current.style.bottom = 'auto';
    }
  }, [open]);

  return (
    <div
      ref={itemRef}
      className={`context-menu-item has-submenu${item.disabled ? ' disabled' : ''}`}
      onMouseEnter={() => !item.disabled && setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span className="context-menu-check"></span>
      <span className="context-menu-label">{item.label}</span>
      <span className="context-menu-arrow">▶</span>
      {open && item.submenu && (
        <div ref={subRef} className="context-menu context-submenu">
          {item.submenu.map((sub, idx) => {
            if (sub.separator) {
              return <div key={idx} className="context-menu-separator" />;
            }
            return (
              <div
                key={idx}
                className={`context-menu-item${sub.disabled ? ' disabled' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!sub.disabled && sub.action) {
                    sub.action();
                    onClose();
                  }
                }}
              >
                <span className="context-menu-check">
                  {sub.checked !== undefined ? (sub.checked ? '✓' : '') : ''}
                </span>
                <span className="context-menu-label">{sub.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
