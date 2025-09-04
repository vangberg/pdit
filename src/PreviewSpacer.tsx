import React, { useRef, useState, useLayoutEffect, useEffect } from 'react'

interface PreviewSpacerProps {
  targetHeight?: number;
  children: React.ReactNode;
  onNaturalHeightChange?: (height: number) => void;
}

export const PreviewSpacer: React.FC<PreviewSpacerProps> = ({ 
  targetHeight, 
  children, 
  onNaturalHeightChange 
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [spacerHeight, setSpacerHeight] = useState(0);

  // Calculate spacer height synchronously before paint (no flicker)
  useLayoutEffect(() => {
    if (!targetHeight || !contentRef.current) {
      setSpacerHeight(0);
      return;
    }
    
    try {
      const rect = contentRef.current.getBoundingClientRect();
      const naturalHeight = rect.height;
      const spacerNeeded = Math.max(0, targetHeight - naturalHeight);
      
      const newSpacerHeight = spacerNeeded > 0.1 ? spacerNeeded : 0;
      setSpacerHeight(newSpacerHeight);
    } catch (e) {
      console.warn('Failed to calculate spacer height:', e);
      setSpacerHeight(0);
    }
  }, [targetHeight]);

  // Report natural height changes
  useEffect(() => {
    if (!onNaturalHeightChange || !contentRef.current) return;

    const reportHeight = () => {
      if (contentRef.current) {
        const rect = contentRef.current.getBoundingClientRect();
        onNaturalHeightChange(rect.height);
      }
    };

    // Initial report
    const timeout = setTimeout(reportHeight, 0);

    // Set up ResizeObserver to watch for content size changes
    const resizeObserver = new ResizeObserver(reportHeight);
    resizeObserver.observe(contentRef.current);

    return () => {
      clearTimeout(timeout);
      resizeObserver.disconnect();
    };
  }, [onNaturalHeightChange]);

  return (
    <div className="preview-spacer-container">
      <div ref={contentRef}>
        {children}
      </div>
      {spacerHeight > 0 && (
        <div 
          className="preview-spacer" 
          style={{ height: `${spacerHeight}px` }}
        />
      )}
    </div>
  );
};