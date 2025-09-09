import React, { useRef, useState, useLayoutEffect } from 'react'

interface PreviewSpacerProps {
  targetHeight?: number;
  children: React.ReactNode;
}

export const PreviewSpacer: React.FC<PreviewSpacerProps> = ({ 
  targetHeight, 
  children
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