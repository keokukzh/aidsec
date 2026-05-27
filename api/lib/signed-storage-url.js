import crypto from 'node:crypto';
import { getEnvFirst } from './env.js';

function encodeRfc3986(value) {
  return encodeURIComponent(String(value)).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function encodeKeyPath(key) {
  return String(key || '')
    .replace(/^\/+/, '')
    .split('/')
    .map(encodeRfc3986)
    .join('/');
}

function hmac(key, value, encoding) {
  return crypto.createHmac('sha256', key).update(value).digest(encoding);
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function formatAmzDate(date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function canonicalQuery(params) {
  return Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encodeRfc3986(key)}=${encodeRfc3986(value)}`)
    .join('&');
}

export function createPresignedUrl(config, method, key = '', expiresIn = 3600, queryParams = []) {
  const now = new Date();
  const amzDate = formatAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const region = config.region || 'auto';
  const service = 's3';
  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const endpoint = new URL(config.endpoint || `https://s3.${region}.amazonaws.com`);
  const endpointPath = endpoint.pathname.replace(/\/+$/, '');
  const canonicalUri = `${endpointPath}/${encodeRfc3986(config.bucket)}/${encodeKeyPath(key)}`;
  const signedHeaders = 'host';
  const expires = Math.max(1, Math.min(Number(expiresIn) || 3600, 604800));
  const params = new Map(queryParams);
  [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Content-Sha256', 'UNSIGNED-PAYLOAD'],
    ['X-Amz-Credential', `${config.accessKeyId}/${scope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(expires)],
    ['X-Amz-SignedHeaders', signedHeaders],
  ].forEach(([paramKey, paramValue]) => params.set(paramKey, paramValue));
  const query = canonicalQuery(params);
  const canonicalRequest = [
    method,
    canonicalUri,
    query,
    `host:${endpoint.host}\n`,
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
  const dateKey = hmac(Buffer.from(`AWS4${config.secretAccessKey}`, 'utf8'), dateStamp);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, service);
  const signingKey = hmac(serviceKey, 'aws4_request');
  const signature = hmac(signingKey, stringToSign, 'hex');

  return `${endpoint.origin}${canonicalUri}?${query}&X-Amz-Signature=${signature}`;
}

export function createPresignedGetUrl(config, key, expiresIn = 3600) {
  return createPresignedUrl(config, 'GET', key, expiresIn);
}

export function createPresignedPutUrl(config, key, expiresIn = 3600) {
  return createPresignedUrl(config, 'PUT', key, expiresIn);
}

export function createPresignedListUrl(config, prefix = '', expiresIn = 3600) {
  return createPresignedUrl(
    config,
    'GET',
    '',
    expiresIn,
    [
      ['list-type', '2'],
      ['prefix', String(prefix || '')],
    ],
  );
}

export function getObjectStorageConfig() {
  const accountId = getEnvFirst(['R2_ACCOUNT_ID']);
  const r2AccessKeyId = getEnvFirst(['R2_ACCESS_KEY_ID']);
  const r2SecretAccessKey = getEnvFirst(['R2_SECRET_ACCESS_KEY']);
  const r2Bucket = getEnvFirst(['R2_BUCKET']);
  if (accountId && r2AccessKeyId && r2SecretAccessKey && r2Bucket) {
    return {
      bucket: r2Bucket,
      accessKeyId: r2AccessKeyId,
      secretAccessKey: r2SecretAccessKey,
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    };
  }

  const accessKeyId = getEnvFirst(['AWS_ACCESS_KEY_ID']);
  const secretAccessKey = getEnvFirst(['AWS_SECRET_ACCESS_KEY']);
  const region = getEnvFirst(['AWS_REGION']) || 'eu-central-1';
  const bucket = getEnvFirst(['S3_BUCKET']);
  if (!accessKeyId || !secretAccessKey || !bucket) return null;
  return {
    bucket,
    accessKeyId,
    secretAccessKey,
    region,
    endpoint: getEnvFirst(['S3_ENDPOINT']) || undefined,
  };
}

export async function createSignedStorageReadUrl(key, expiresIn = 3600) {
  const config = getObjectStorageConfig();
  if (!config) throw new Error('Object storage is not configured for signed reads');
  return createPresignedGetUrl(config, key, expiresIn);
}
