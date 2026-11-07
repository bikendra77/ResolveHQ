import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { backendProxyTarget, resolveBackendPort } from './dev-config.mjs';

const projectRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));

async function findAvailablePort(startingPort) {
  for (let port = startingPort; port < startingPort + 20; port += 1) {
    const available = await new Promise((resolve, reject) => {
      const server = createServer();
      server.once('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          resolve(false);
        } else {
          reject(error);
        }
      });
      server.listen(port, 'localhost', () => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve(true);
          }
        });
      });
    });

    if (available) {
      return port;
    }
  }

  throw new Error('No available Vite port found between 5173 and 5192.');
}

async function main() {
  const serverEnvPath = resolve(projectRoot, 'server', '.env');
  const serverEnv = existsSync(serverEnvPath)
    ? dotenv.parse(readFileSync(serverEnvPath))
    : {};
  const backendPort = resolveBackendPort(process.env.PORT, serverEnv.PORT);
  const clientPort = await findAvailablePort(5173);
  console.log(`Starting ResolveHQ client at http://localhost:${clientPort}`);
  const services = [
    {
      name: 'server',
      command: process.execPath,
      args: ['src/server.js'],
      cwd: resolve(projectRoot, 'server'),
      env: {
        ...process.env,
        PORT: String(backendPort),
        CLIENT_ORIGIN: `http://localhost:${clientPort}`,
      },
    },
    {
      name: 'client',
      command: process.execPath,
      args: [resolve(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js')],
      cwd: resolve(projectRoot, 'client'),
      env: {
        ...process.env,
        PORT: String(backendPort),
        VITE_API_PROXY_TARGET: backendProxyTarget(backendPort),
        VITE_DEV_PORT: String(clientPort),
      },
    },
  ];
  const children = [];
  let stopping = false;

  function stop(exitCode) {
    if (stopping) {
      return;
    }

    stopping = true;
    process.exitCode = exitCode;
    for (const child of children) {
      if (child.exitCode === null) {
        child.kill('SIGTERM');
      }
    }
  }

  process.on('SIGINT', () => stop(130));
  process.on('SIGTERM', () => stop(143));

  for (const { name, command, args, cwd, env } of services) {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: 'inherit',
    });
    children.push(child);
    child.on('error', (error) => {
      console.error(`Failed to start the ${name}: ${error.message}`);
      stop(1);
    });
    child.on('exit', (code, signal) => {
      if (!stopping) {
        const status = code ?? 1;
        const reason = signal ? `signal ${signal}` : `exit code ${status}`;
        console.error(
          `The ${name} stopped with ${reason}; stopping both services.`,
        );
        stop(status);
      }
    });
  }
}

main().catch((error) => {
  console.error(
    `Unable to start ResolveHQ development services: ${error.message}`,
  );
  process.exitCode = 1;
});
