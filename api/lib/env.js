export function getEnvFirst(names, env = process.env || {}) {
  const normalize = (value) => {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    if (!trimmed || ['undefined', 'null'].includes(trimmed.toLowerCase())) return '';
    return trimmed;
  };

  for (const name of names) {
    const direct = normalize(env[name]);
    if (direct) return direct;

    const wanted = name.toLowerCase();
    const matchedKey = Object.keys(env).find((key) => key.toLowerCase() === wanted);
    const matched = matchedKey ? normalize(env[matchedKey]) : '';
    if (matched) return matched;
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
