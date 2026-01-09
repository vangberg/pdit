import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BACKEND_HOST = "127.0.0.1";
const DEFAULT_PORT = 8888;

function getFreePort(preferredPort) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on("error", () => {
      server.listen(0, BACKEND_HOST);
    });
    server.listen(preferredPort, BACKEND_HOST, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function checkHealth(port) {
  return new Promise((resolve) => {
    const req = http.request(
      {
        method: "GET",
        host: BACKEND_HOST,
        port,
        path: "/api/list-files",
        timeout: 500,
      },
      (res) => {
        res.resume();
        resolve(res.statusCode ?? null);
      }
    );
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
    req.end();
  });
}

async function waitForHealthy(port, retries) {
  for (let i = 0; i < retries; i++) {
    const status = await checkHealth(port);
    if (status === 200) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const port = await getFreePort(DEFAULT_PORT);

const backend = spawn(
  "uv",
  ["run", "uvicorn", "pdit.server:app", "--port", String(port)],
  {
    cwd: repoRoot,
    env: {
      ...process.env,
      PDIT_TOKEN: "",
      PDIT_PORT: String(port),
    },
    stdio: "inherit",
  }
);

const healthy = await waitForHealthy(port, 40);
if (!healthy) {
  backend.kill("SIGTERM");
  console.error("Failed to start backend for frontend tests.");
  process.exit(1);
}

const vitestArgs = process.argv.slice(2);
const vitest = spawn("vitest", vitestArgs, {
  cwd: path.resolve(repoRoot, "fe"),
  env: {
    ...process.env,
    VITE_PDIT_BACKEND_PORT: String(port),
  },
  stdio: "inherit",
});

const shutdown = () => {
  if (!backend.killed) {
    backend.kill("SIGTERM");
  }
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

vitest.on("exit", (code) => {
  shutdown();
  process.exit(code ?? 1);
});
