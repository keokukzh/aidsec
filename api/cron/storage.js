import crypto from 'node:crypto';
import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getEnvFirst, isProduction } from '../lib/env.js';

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

function createPresignedGetUrl(config, key, expiresIn = 3600) {
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
  const params = new Map([
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Content-Sha256', 'UNSIGNED-PAYLOAD'],
    ['X-Amz-Credential', `${config.accessKeyId}/${scope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(expires)],
    ['X-Amz-SignedHeaders', signedHeaders],
  ]);
  const query = canonicalQuery(params);
  const canonicalRequest = [
    'GET',
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

class UnconfiguredStorage {
  constructor(reason) {
    this.reason = reason || 'Object storage is not configured';
  }

  async putJson() {
    throw new Error(this.reason);
  }

  async getJson() {
    throw new Error(this.reason);
  }

  async list() {
    throw new Error(this.reason);
  }

  async createSignedReadUrl() {
    throw new Error(this.reason);
  }

  async put(key, data) {
    return this.putJson(key, data);
  }

  async get(key) {
    return this.getJson(key);
  }
}

class S3Storage {
  constructor(config) {
    this.config = config;
    this.bucket = config.bucket;
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: true,
    });
  }

  async putJson(key, data) {
    const body = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: 'application/json; charset=utf-8',
      }),
    );
    return { success: true, key };
  }

  async getJson(key) {
    try {
      const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      const body = await result.Body.transformToString();
      return JSON.parse(body);
    } catch (error) {
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) return null;
      throw error;
    }
  }

  async list(prefix = '') {
    const result = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
      }),
    );
    return (result.Contents || []).map((item) => item.Key);
  }

  async createSignedReadUrl(key, expiresIn = 3600) {
    return createPresignedGetUrl(this.config, key, expiresIn);
  }

  async put(key, data) {
    return this.putJson(key, data);
  }

  async get(key) {
    return this.getJson(key);
  }
}

class LocalStorage {
  constructor(baseDir = './reports') {
    this.baseDir = baseDir;
    this.fs = null;
    this.path = null;
  }

  async init() {
    if (this.fs && this.path) return;
    const fsModule = await import('fs');
    const pathModule = await import('path');
    this.fs = fsModule.promises;
    this.path = pathModule;
    await this.fs.mkdir(this.baseDir, { recursive: true });
  }

  async putJson(key, data) {
    await this.init();
    const fullPath = this.path.join(this.baseDir, key);
    await this.fs.mkdir(this.path.dirname(fullPath), { recursive: true });
    await this.fs.writeFile(fullPath, typeof data === 'string' ? data : JSON.stringify(data, null, 2), 'utf8');
    return { success: true, key };
  }

  async getJson(key) {
    await this.init();
    try {
      return JSON.parse(await this.fs.readFile(this.path.join(this.baseDir, key), 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }

  async list(prefix = '') {
    await this.init();
    const dir = this.path.join(this.baseDir, prefix);
    try {
      const files = await this.fs.readdir(dir);
      return files.map((file) => `${prefix}/${file}`.replace(/^\//, ''));
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }

  async createSignedReadUrl(key) {
    return `/reports/${key}`;
  }

  async put(key, data) {
    return this.putJson(key, data);
  }

  async get(key) {
    return this.getJson(key);
  }
}

function r2Config() {
  const accountId = getEnvFirst(['R2_ACCOUNT_ID']);
  const accessKeyId = getEnvFirst(['R2_ACCESS_KEY_ID']);
  const secretAccessKey = getEnvFirst(['R2_SECRET_ACCESS_KEY']);
  const bucket = getEnvFirst(['R2_BUCKET']);
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  return {
    bucket,
    accessKeyId,
    secretAccessKey,
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  };
}

function s3Config() {
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

export function createStorage() {
  const config = r2Config() || s3Config();
  if (config) return new S3Storage(config);
  if (!isProduction() || getEnvFirst(['USE_LOCAL_STORAGE']) === 'true') return new LocalStorage('./reports');
  return new UnconfiguredStorage('Object storage is not configured for production');
}

export const storage = createStorage();
