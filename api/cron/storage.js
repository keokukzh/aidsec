import { getEnvFirst, isProduction } from '../lib/env.js';
import {
  createPresignedGetUrl,
  createPresignedListUrl,
  createPresignedPutUrl,
  getObjectStorageConfig,
} from '../lib/signed-storage-url.js';

function decodeXml(value) {
  return String(value)
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
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
  }

  async putJson(key, data) {
    const body = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    const response = await fetch(createPresignedPutUrl(this.config, key), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body,
    });
    if (!response.ok) throw new Error(`Object storage PUT failed: ${response.status}`);
    return { success: true, key };
  }

  async getJson(key) {
    const response = await fetch(createPresignedGetUrl(this.config, key));
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Object storage GET failed: ${response.status}`);
    return JSON.parse(await response.text());
  }

  async list(prefix = '') {
    const response = await fetch(createPresignedListUrl(this.config, prefix));
    if (!response.ok) throw new Error(`Object storage LIST failed: ${response.status}`);
    const xml = await response.text();
    return Array.from(xml.matchAll(/<Key>([\s\S]*?)<\/Key>/g), (match) => decodeXml(match[1]));
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
