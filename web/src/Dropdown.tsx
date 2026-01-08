import React, { useState, useEffect, useRef, useCallback } from "react";

export interface DropdownNavigationOptions<T> {
  items: T[];
  onSelect: (item: T) => void;
  onClose?: () => void;
  defaultIndex?: number;
}

export function useDropdownNavigation<T>({
  items,
  onSelect,
  onClose,
  defaultIndex = 0
}: DropdownNavigationOptions<T>) {
  const [selectedIndex, setSelectedIndex] = useState(defaultIndex);

  useEffect(() => {
    setSelectedIndex(defaultIndex);
  }, [items, defaultIndex]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, items.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (items[selectedIndex]) {
          onSelect(items[selectedIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        onClose?.();
        break;
      case "Tab":
         onClose?.();
         break;
    }
  }, [items, selectedIndex, onSelect, onClose]);

  return {
    selectedIndex,
    setSelectedIndex,
    handleKeyDown
  };
}

export interface DropdownListProps<T> {
  items: T[];
  selectedIndex: number;
  onSelect: (item: T) => void;
  onHover: (index: number) => void;
  renderItem: (item: T, isSelected: boolean) => React.ReactNode;
  keyExtractor?: (item: T) => string | number;
  className?: string;
  itemClassName?: string;
  listRef?: React.RefObject<HTMLDivElement | null>;
  isItemDisabled?: (item: T) => boolean;
}

export function DropdownList<T>({
  items,
  selectedIndex,
  onSelect,
  onHover,
  renderItem,
  keyExtractor,
  className,
  itemClassName,
  listRef,
  isItemDisabled,
  ...props
}: DropdownListProps<T> & Omit<React.HTMLAttributes<HTMLDivElement>, "onSelect">) {
  const internalRef = useRef<HTMLDivElement>(null);
  const ref = listRef || internalRef;

  useEffect(() => {
    if (ref.current) {
      const selectedElement = ref.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedIndex, ref]);

  return (
    <div ref={ref} className={className} {...props}>
      {items.map((item, index) => {
          const isSelected = index === selectedIndex;
          const isDisabled = isItemDisabled?.(item) ?? false;
          const key = keyExtractor ? keyExtractor(item) : index;
          return (
            <div
              key={key}
              className={`${itemClassName || ""} ${isSelected ? "selected" : ""} ${isDisabled ? "disabled" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                if (isDisabled) {
                  return;
                }
                onSelect(item);
              }}
              onMouseEnter={() => {
                if (!isDisabled) {
                  onHover(index);
                }
              }}
            >
              {renderItem(item, isSelected)}
            </div>
          );
      })}
    </div>
  );
}
