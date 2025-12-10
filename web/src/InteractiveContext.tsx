import { createContext, useContext } from "react";

/**
 * Context for controlling interactive mode.
 * When interactive=false (e.g., /output endpoint), components should:
 * - Show all data without pagination
 * - Hide interactive controls (filters, buttons, etc.)
 */
export const InteractiveContext = createContext<boolean>(true);

export function useInteractive(): boolean {
  return useContext(InteractiveContext);
}
