import { describe, it, expect, beforeEach } from "vitest";
import { getAuthToken } from "./api-auth";

function setUrl(pathWithSearch: string) {
  window.history.replaceState({}, "", pathWithSearch);
}

describe("api-auth", () => {
  beforeEach(() => {
    sessionStorage.clear();
    setUrl("/");
  });

  it("stores token from URL, removes it, and returns it", () => {
    setUrl("/?token=abc123");

    const token = getAuthToken();

    expect(token).toBe("abc123");
    expect(sessionStorage.getItem("pdit.token")).toBe("abc123");
    expect(window.location.search).toBe("");
  });

  it("uses stored token when URL has none", () => {
    sessionStorage.setItem("pdit.token", "stored-token");

    const token = getAuthToken();

    expect(token).toBe("stored-token");
    expect(window.location.search).toBe("");
  });

  it("overwrites stored token when URL has a new one", () => {
    sessionStorage.setItem("pdit.token", "old-token");
    setUrl("/?token=new-token");

    const token = getAuthToken();

    expect(token).toBe("new-token");
    expect(sessionStorage.getItem("pdit.token")).toBe("new-token");
    expect(window.location.search).toBe("");
  });
});
