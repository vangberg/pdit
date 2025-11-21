import React from "react";
import type { Story } from "@ladle/react";
import { TopBar } from "./TopBar";

export const Ready: Story = () => (
  <TopBar isPyodideReady={true} onRunAll={() => console.log("Run all clicked")} />
);

Ready.storyName = "Ready State";

export const Initializing: Story = () => (
  <TopBar
    isPyodideReady={false}
    onRunAll={() => console.log("Run all clicked")}
  />
);

Initializing.storyName = "Initializing";

export const CustomInitMessage: Story = () => (
  <TopBar
    isPyodideReady={false}
    onRunAll={() => console.log("Run all clicked")}
    initMessage="LOADING PACKAGES..."
  />
);

CustomInitMessage.storyName = "Custom Init Message";
