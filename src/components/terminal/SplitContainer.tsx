import React, { useState, useRef, useCallback, useEffect } from 'react';

interface SplitContainerProps {
  direction: 'horizontal' | 'vertical';
  children: React.ReactNode[];
  minSize?: number;
  initialRatio?: number;
}

const SplitContainer: React.FC<SplitContainerProps> = ({
  direction,
  children,
  minSize = 100,
  initialRatio = 0.5,
}) => {
  const [splitRatio, setSplitRatio] = useState(initialRatio);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
  }, [direction]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      let ratio: number;

      if (direction === 'horizontal') {
        ratio = (e.clientX - rect.left) / rect.width;
      } else {
        ratio = (e.clientY - rect.top) / rect.height;
      }

      // Clamp ratio with minSize consideration
      const containerSize = direction === 'horizontal' ? rect.width : rect.height;
      const minRatio = minSize / containerSize;
      const maxRatio = 1 - minRatio;
      ratio = Math.max(minRatio, Math.min(maxRatio, ratio));

      setSplitRatio(ratio);
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [direction, minSize]);

  // Double-click to reset 50/50
  const handleDoubleClick = useCallback(() => {
    setSplitRatio(0.5);
  }, []);

  if (children.length < 2) {
    return <div className="w-full h-full">{children[0]}</div>;
  }

  const isHorizontal = direction === 'horizontal';

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex"
      style={{ flexDirection: isHorizontal ? 'row' : 'column' }}
    >
      {/* First pane */}
      <div
        style={{
          [isHorizontal ? 'width' : 'height']: `${splitRatio * 100}%`,
          overflow: 'hidden',
          minWidth: isHorizontal ? minSize : undefined,
          minHeight: !isHorizontal ? minSize : undefined,
        }}
      >
        {children[0]}
      </div>

      {/* Drag handle */}
      <div
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        className={`
          flex-shrink-0 z-10 group
          ${isHorizontal
            ? 'w-1 cursor-col-resize hover:bg-orange-500/50 active:bg-orange-500'
            : 'h-1 cursor-row-resize hover:bg-orange-500/50 active:bg-orange-500'
          }
          bg-neutral-800 transition-colors
        `}
        title="Drag to resize, double-click to reset"
      />

      {/* Second pane */}
      <div
        style={{
          [isHorizontal ? 'width' : 'height']: `${(1 - splitRatio) * 100}%`,
          overflow: 'hidden',
          minWidth: isHorizontal ? minSize : undefined,
          minHeight: !isHorizontal ? minSize : undefined,
        }}
      >
        {children[1]}
      </div>
    </div>
  );
};

export default SplitContainer;
