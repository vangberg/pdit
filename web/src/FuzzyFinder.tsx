import React, { useState, useEffect, useRef, useCallback } from "react";

interface FuzzyFinderProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
}

interface MatchedFile {
  path: string;
  score: number;
  matchedIndices: number[];
}

function fuzzyMatch(pattern: string, text: string): { score: number; indices: number[] } | null {
  const patternLower = pattern.toLowerCase();
  const textLower = text.toLowerCase();

  let patternIdx = 0;
  let score = 0;
  const indices: number[] = [];
  let lastMatchIdx = -1;

  for (let i = 0; i < textLower.length && patternIdx < patternLower.length; i++) {
    if (textLower[i] === patternLower[patternIdx]) {
      indices.push(i);
      if (lastMatchIdx === i - 1) {
        score += 10;
      }
      if (i === 0 || text[i - 1] === "/" || text[i - 1] === "_" || text[i - 1] === "-") {
        score += 5;
      }
      score += 1;
      lastMatchIdx = i;
      patternIdx++;
    }
  }

  if (patternIdx !== patternLower.length) {
    return null;
  }

  score -= text.length * 0.1;
  return { score, indices };
}

function highlightMatches(text: string, indices: number[]): React.ReactNode {
  if (indices.length === 0) {
    return text;
  }

  const result: React.ReactNode[] = [];
  let lastIdx = 0;

  for (const idx of indices) {
    if (idx > lastIdx) {
      result.push(text.slice(lastIdx, idx));
    }
    result.push(
      <span key={idx} className="fuzzy-match-highlight">
        {text[idx]}
      </span>
    );
    lastIdx = idx + 1;
  }

  if (lastIdx < text.length) {
    result.push(text.slice(lastIdx));
  }

  return result;
}

export function FuzzyFinder({ isOpen, onClose, onSelect }: FuzzyFinderProps) {
  const [query, setQuery] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [filteredFiles, setFilteredFiles] = useState<MatchedFile[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch files when opened
  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      fetch("/api/list-files")
        .then((res) => res.json())
        .then((data) => {
          setFiles(data.files);
          setIsLoading(false);
        })
        .catch((err) => {
          console.error("Failed to fetch files:", err);
          setIsLoading(false);
        });
    }
  }, [isOpen]);

  // Filter files based on query
  useEffect(() => {
    if (!query.trim()) {
      setFilteredFiles(files.map((path) => ({ path, score: 0, matchedIndices: [] })));
      setSelectedIndex(0);
      return;
    }

    const matched: MatchedFile[] = [];
    for (const path of files) {
      const result = fuzzyMatch(query, path);
      if (result) {
        matched.push({ path, score: result.score, matchedIndices: result.indices });
      }
    }

    matched.sort((a, b) => b.score - a.score);
    setFilteredFiles(matched);
    setSelectedIndex(0);
  }, [query, files]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      setQuery("");
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onClose]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selectedItem = listRef.current.children[selectedIndex] as HTMLElement;
      if (selectedItem) {
        selectedItem.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, filteredFiles.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (filteredFiles[selectedIndex]) {
            onSelect(filteredFiles[selectedIndex].path);
            onClose();
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    },
    [filteredFiles, selectedIndex, onSelect, onClose]
  );

  const handleSelect = useCallback(
    (path: string) => {
      onSelect(path);
      onClose();
    },
    [onSelect, onClose]
  );

  if (!isOpen) {
    return null;
  }

  return (
    <div ref={containerRef} className="fuzzy-finder-dropdown">
      <input
        ref={inputRef}
        type="text"
        className="fuzzy-finder-input"
        placeholder="Search files..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      <div ref={listRef} className="fuzzy-finder-list">
        {isLoading ? (
          <div className="fuzzy-finder-empty">Loading...</div>
        ) : filteredFiles.length === 0 ? (
          <div className="fuzzy-finder-empty">No files found</div>
        ) : (
          filteredFiles.slice(0, 20).map((file, index) => (
            <div
              key={file.path}
              className={`fuzzy-finder-item ${index === selectedIndex ? "selected" : ""}`}
              onClick={() => handleSelect(file.path)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <span className="fuzzy-finder-filename">
                {highlightMatches(file.path.split("/").pop() || "",
                  file.matchedIndices.filter(i => i >= file.path.lastIndexOf("/") + 1)
                    .map(i => i - file.path.lastIndexOf("/") - 1)
                )}
              </span>
              {file.path.includes("/") && (
                <span className="fuzzy-finder-path">
                  {highlightMatches(file.path, file.matchedIndices)}
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
