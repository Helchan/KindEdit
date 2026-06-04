import React, { useCallback, useRef, useState } from 'react';

interface ResizerProps {
  onResize: (deltaX: number) => void;
}

export default function Resizer({ onResize }: ResizerProps) {
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
      startXRef.current = e.clientX;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaX = moveEvent.clientX - startXRef.current;
        startXRef.current = moveEvent.clientX;
        onResize(deltaX);
      };

      const handleMouseUp = () => {
        setIsDragging(false);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [onResize]
  );

  return (
    <div
      className="tree-resizer"
      onMouseDown={handleMouseDown}
      style={{
        width: 5,
        cursor: 'col-resize',
        background: isDragging ? 'var(--accent)' : 'transparent',
        transition: isDragging ? 'none' : 'background 0.15s',
        flexShrink: 0,
      }}
    />
  );
}
