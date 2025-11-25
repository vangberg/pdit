import React from "react";
import type { Story } from "@ladle/react";
import { TopBar } from "./TopBar";

export const Default: Story = () => (
  <TopBar onRunAll={() => console.log("Run all clicked")} />
);

Default.storyName = "Default";
