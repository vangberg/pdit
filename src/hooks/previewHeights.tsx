import { useRef, useEffect, useCallback } from 'react'

export interface PreviewHeight {
  line: number;
  height: number;
}

export const usePreviewHeights = (
  previewData: any[],
  onHeightChange?: (heights: PreviewHeight[]) => void
) => {
  const previewRefs = useRef<{[key: number]: HTMLDivElement | null}>({});
  const containerRef = useRef<HTMLDivElement>(null);

  const getPreviewHeights = useCallback((): PreviewHeight[] => {
    return previewData.map((_, index) => {
      const lineNumber = index + 1;
      const previewElement = previewRefs.current[index];
      
      if (!previewElement) {
        return { line: lineNumber, height: 0 };
      }
      
      return {
        line: lineNumber,
        height: Math.max(0, previewElement.getBoundingClientRect().height)
      };
    });
  }, [previewData]);

  const setPreviewRef = useCallback((index: number) => (element: HTMLDivElement | null) => {
    previewRefs.current[index] = element;
  }, []);

  useEffect(() => {
    if (!containerRef.current || !onHeightChange) return;

    // Initial callback (like CodeMirror's setTimeout pattern)
    const initialTimeout = setTimeout(() => {
      onHeightChange(getPreviewHeights());
    }, 0);

    // MutationObserver for DOM changes that might affect height
    // But skip changes to spacer elements to avoid loops
    const mutationObserver = new MutationObserver((mutations) => {
      const hasNonSpacerChanges = mutations.some(mutation => {
        const target = mutation.target as Element;
        return !target.classList?.contains('preview-spacer');
      });
      
      if (hasNonSpacerChanges) {
        onHeightChange(getPreviewHeights());
      }
    });

    // ResizeObserver to watch for content size changes in line elements
    const resizeObserver = new ResizeObserver(() => {
      onHeightChange(getPreviewHeights());
    });

    // Observe the container for mutations and resizes
    if (containerRef.current) {
      mutationObserver.observe(containerRef.current, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class']
      });

      // Single ResizeObserver on the container catches all internal size changes
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      clearTimeout(initialTimeout);
      mutationObserver.disconnect();
      resizeObserver.disconnect();
    };
  }, [onHeightChange, getPreviewHeights]);

  return {
    containerRef,
    setPreviewRef
  };
};