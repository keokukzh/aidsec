export function getEnvFirst(names, env = process.env || {}) {
  for (const name of names) {
    const direct = env[name];
    if (typeof direct === 'string' && direct.trim()) return direct.trim();

    const wanted = name.toLowerCase();
    const matchedKey = Object.keys(env).find((key) => key.toLowerCase() === wanted);
    if (matchedKey && typeof env[matchedKey] === 'string' && env[matchedKey].trim()) {
      return env[matchedKey].trim();
    }
  }

  return '';
}

export function isProduction(env = process.env || {}) {
  const vercelEnv = getEnvFirst(['VERCEL_ENV'], env).toLowerCase();
  if (vercelEnv) return vercelEnv === 'production';
  return getEnvFirst(['NODE_ENV'], env).toLowerCase() === 'production';
}

export function requireEnv(name) {
  const value = getEnvFirst([name]);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}
