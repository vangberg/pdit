import React, { useState, useLayoutEffect, useRef, useCallback } from 'react'

export const useSpacer = (targetHeight?: number) => {
  const [spacerHeight, setSpacerHeight] = useState(0);
  const elementRef = useRef<HTMLElement | null>(null);

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

  const ref = useCallback((element: HTMLElement | null) => {
    elementRef.current = element;
    calculateSpacerHeight();
  }, [calculateSpacerHeight]);

  const spacer = spacerHeight > 0 ? (
    <div 
      key="spacer"
      className="preview-spacer" 
      style={{ height: `${spacerHeight}px` }}
    />
  ) : null;

  return { ref, spacer };
};

