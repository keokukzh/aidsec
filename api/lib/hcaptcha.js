function getEnvFirst(names) {
  const env = process.env || {};

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

function isProductionRuntime() {
  const vercelEnv = getEnvFirst(['VERCEL_ENV']).toLowerCase();
  return vercelEnv === 'production' || getEnvFirst(['NODE_ENV']) === 'production';
}

export function getHCaptchaToken(body = {}) {
  return (
    body.hCaptchaToken ||
    body.hcaptchaToken ||
    body.hcaptcha ||
    body['h-captcha-response'] ||
    body['g-recaptcha-response'] ||
    ''
  ).toString().trim();
}

export async function verifyHCaptchaToken({ token, remoteIp } = {}) {
  const secret = getEnvFirst(['HCAPTCHA_SECRET']);
  if (!secret) {
    if (isProductionRuntime()) {
      return { ok: false, status: 503, error: 'Formularschutz derzeit nicht verfuegbar.' };
    }
    return { ok: true, skipped: true };
  }

  if (!token) {
    return { ok: false, status: 400, error: 'hCaptcha-Bestaetigung fehlt.' };
  }

  const body = new URLSearchParams();
  body.set('secret', secret);
  body.set('response', token);
  if (remoteIp && remoteIp !== 'unknown') body.set('remoteip', remoteIp);

  const response = await fetch('https://hcaptcha.com/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    return { ok: false, status: 503, error: 'hCaptcha konnte nicht geprueft werden.' };
  }

  const payload = await response.json().catch(() => ({}));
  if (payload?.success === true) return { ok: true };
  return { ok: false, status: 400, error: 'hCaptcha-Bestaetigung ungueltig.' };
}
