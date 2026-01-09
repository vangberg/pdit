import { useState, useEffect, useCallback } from "react";

const STORAGE_PREFIX = "pdit-settings-";

interface ScriptSettings {
  autorun: boolean;
  readerMode: boolean;
}

const DEFAULT_SETTINGS: ScriptSettings = {
  autorun: false,
  readerMode: false,
};

export function useScriptSettings(scriptPath: string | null) {
  const getStoredSettings = useCallback((): ScriptSettings => {
    if (!scriptPath) return DEFAULT_SETTINGS;
    try {
      const item = localStorage.getItem(`${STORAGE_PREFIX}${scriptPath}`);
      return item ? { ...DEFAULT_SETTINGS, ...JSON.parse(item) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  }, [scriptPath]);

  const [settings, setSettings] = useState<ScriptSettings>(getStoredSettings);

  useEffect(() => {
    setSettings(getStoredSettings());
  }, [getStoredSettings]);

  const updateSettings = useCallback((newPartialSettings: Partial<ScriptSettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...newPartialSettings };
      if (scriptPath) {
        try {
          localStorage.setItem(`${STORAGE_PREFIX}${scriptPath}`, JSON.stringify(updated));
        } catch (e) {
          console.warn("Failed to save settings", e);
        }
      }
      return updated;
    });
  }, [scriptPath]);

  return {
    autorun: settings.autorun,
    setAutorun: (val: boolean) => updateSettings({ autorun: val }),
    readerMode: settings.readerMode,
    setReaderMode: (val: boolean) => updateSettings({ readerMode: val }),
  };
}
