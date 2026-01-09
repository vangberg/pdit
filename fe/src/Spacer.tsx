import React, { useState, useLayoutEffect, useCallback } from 'react';

export const useSpacerHeight = (elementRef: React.RefObject<HTMLElement | null>, targetHeight?: number) => {
  const [spacerHeight, setSpacerHeight] = useState(0);

  const calculateSpacerHeight = useCallback(() => {
    if (!targetHeight || !elementRef.current) {
      setSpacerHeight(0);
      return;
    }
    
    try {
      const rect = elementRef.current.getBoundingClientRect();
      const naturalHeight = rect.height;
      const spacerNeeded = Math.max(0, targetHeight - naturalHeight);
      
      const newSpacerHeight = spacerNeeded > 0.1 ? spacerNeeded : 0;
      setSpacerHeight(newSpacerHeight);
    } catch (e) {
      console.warn('Failed to calculate spacer height:', e);
      setSpacerHeight(0);
    }
  }, [targetHeight]);

  // Calculate spacer height synchronously before paint (no flicker)
  useLayoutEffect(() => {
    calculateSpacerHeight();
  }, [calculateSpacerHeight]);

  return spacerHeight;
};

interface SpacerProps {
  height: number;
}

export const Spacer: React.FC<SpacerProps> = ({ height }) => {
  if (height <= 0) {
    return null;
  }

  return (
    <div 
      key="spacer"
      className="preview-spacer" 
      style={{ height: `${height}px` }}
    />
  );
};