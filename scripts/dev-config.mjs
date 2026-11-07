export function resolveBackendPort(environmentValue, fileValue) {
  const value = environmentValue === undefined ? fileValue : environmentValue;
  if (value === undefined) {
    return 4000;
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }

  return port;
}

export function backendProxyTarget(port) {
  return `http://localhost:${port}`;
}
