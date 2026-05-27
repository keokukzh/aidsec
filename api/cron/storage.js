import { getEnvFirst, isProduction } from '../lib/env.js';
import { createPresignedGetUrl, getObjectStorageConfig } from '../lib/signed-storage-url.js';

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
    this.client = null;
    this.commands = null;
  }

  async getSdk() {
    if (this.client && this.commands) return { client: this.client, ...this.commands };
    const { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } = await import('@aws-sdk/client-s3');
    this.client = new S3Client({
      region: this.config.region,
      endpoint: this.config.endpoint,
      credentials: {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
      },
      forcePathStyle: true,
    });
    this.commands = { GetObjectCommand, ListObjectsV2Command, PutObjectCommand };
    return { client: this.client, ...this.commands };
  }

  async putJson(key, data) {
    const { client, PutObjectCommand } = await this.getSdk();
    const body = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    await client.send(
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
      const { client, GetObjectCommand } = await this.getSdk();
      const result = await client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      const body = await result.Body.transformToString();
      return JSON.parse(body);
    } catch (error) {
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) return null;
      throw error;
    }
  }

  async list(prefix = '') {
    const { client, ListObjectsV2Command } = await this.getSdk();
    const result = await client.send(
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

export function createStorage() {
  const config = getObjectStorageConfig();
  if (config) return new S3Storage(config);
  if (!isProduction() || getEnvFirst(['USE_LOCAL_STORAGE']) === 'true') return new LocalStorage('./reports');
  return new UnconfiguredStorage('Object storage is not configured for production');
}

export const storage = createStorage();
