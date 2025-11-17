import React from "react";
import type { Story } from "@ladle/react";
import { TopBar } from "./TopBar";

export const Ready: Story = () => (
  <TopBar isWebRReady={true} onRunAll={() => console.log("Run all clicked")} />
);

Ready.storyName = "Ready State";

export const Initializing: Story = () => (
  <TopBar
    isWebRReady={false}
    onRunAll={() => console.log("Run all clicked")}
  />
);

Initializing.storyName = "Initializing";

export const CustomInitMessage: Story = () => (
  <TopBar
    isWebRReady={false}
    onRunAll={() => console.log("Run all clicked")}
    initMessage="LOADING PACKAGES..."
  />
);

CustomInitMessage.storyName = "Custom Init Message";
