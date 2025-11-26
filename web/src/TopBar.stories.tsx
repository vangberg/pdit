import React from "react";
import type { Story } from "@ladle/react";
import { TopBar } from "./TopBar";

export const Default: Story = () => (
  <TopBar onRunAll={() => console.log("Run all clicked")} />
);

Default.storyName = "Default";

export const WithConflict: Story = () => (
  <TopBar
    onRunAll={() => console.log("Run all")}
    onRunCurrent={() => console.log("Run current")}
    onSave={() => console.log("Save")}
    hasUnsavedChanges={true}
    scriptName="example.py"
    hasConflict={true}
    onReloadFromDisk={() => console.log("Reload from disk")}
    onKeepChanges={() => console.log("Keep changes")}
  />
);

WithConflict.storyName = "With Conflict";
