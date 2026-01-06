import { describe, expect, it } from "vitest";
import { executeScript } from "./execution-python";

describe("executeScript", () => {
  it("returns an async iterator without touching WebSocket", () => {
    const iterator = executeScript("", { sessionId: "test" });
    expect(typeof iterator[Symbol.asyncIterator]).toBe("function");
  });
});
