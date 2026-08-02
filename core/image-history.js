const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const MIME_EXTENSION = Object.freeze({
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp'
});

class ImageHistoryStore {
  constructor(root, options = {}) {
    this.root = path.resolve(root);
    this.indexPath = path.join(this.root, 'history.json');
    this.maxItems = Number(options.maxItems || 24);
  }

  ensureRoot() {
    fs.mkdirSync(this.root, { recursive: true });
  }

  loadIndex() {
    try {
      const value = JSON.parse(fs.readFileSync(this.indexPath, 'utf8'));
      return Array.isArray(value?.items) ? value.items : [];
    } catch {
      return [];
    }
  }

  saveIndex(items) {
    this.ensureRoot();
    const temporary = `${this.indexPath}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify({ version: 1, items }, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temporary, this.indexPath);
  }

  resolveStoredFile(fileName) {
    const safeName = path.basename(String(fileName || ''));
    const resolved = path.resolve(this.root, safeName);
    if (path.dirname(resolved) !== this.root) throw new Error('历史图片路径无效');
    return resolved;
  }

  removeFiles(item) {
    for (const fileName of [item.file, item.thumbnail]) {
      if (!fileName) continue;
      try { fs.unlinkSync(this.resolveStoredFile(fileName)); } catch {}
    }
  }

  add(buffer, metadata = {}, thumbnailBuffer = null) {
    const mimeType = MIME_EXTENSION[metadata.mimeType] ? metadata.mimeType : 'image/png';
    const extension = MIME_EXTENSION[mimeType];
    const id = crypto.randomUUID();
    const file = `${id}.${extension}`;
    const thumbnail = `${id}.thumb.png`;
    this.ensureRoot();
    fs.writeFileSync(this.resolveStoredFile(file), buffer, { mode: 0o600 });
    fs.writeFileSync(this.resolveStoredFile(thumbnail), thumbnailBuffer || buffer, { mode: 0o600 });

    const item = {
      id,
      file,
      thumbnail,
      mimeType,
      prompt: String(metadata.prompt || '').slice(0, 32_000),
      revisedPrompt: String(metadata.revisedPrompt || '').slice(0, 32_000),
      model: String(metadata.model || ''),
      mode: metadata.mode === 'edit' ? 'edit' : 'generate',
      size: String(metadata.size || 'auto'),
      quality: String(metadata.quality || 'auto'),
      createdAt: metadata.createdAt || new Date().toISOString()
    };

    const items = [item, ...this.loadIndex()];
    const kept = items.slice(0, this.maxItems);
    items.slice(this.maxItems).forEach((oldItem) => this.removeFiles(oldItem));
    this.saveIndex(kept);
    return this.publicItem(item, true);
  }

  publicItem(item, includeThumbnail = false) {
    const value = {
      id: item.id,
      mimeType: item.mimeType,
      prompt: item.prompt,
      revisedPrompt: item.revisedPrompt,
      model: item.model,
      mode: item.mode,
      size: item.size,
      quality: item.quality,
      createdAt: item.createdAt
    };
    if (includeThumbnail) {
      try {
        value.thumbnailDataUrl = `data:image/png;base64,${fs.readFileSync(this.resolveStoredFile(item.thumbnail)).toString('base64')}`;
      } catch {
        value.thumbnailDataUrl = '';
      }
    }
    return value;
  }

  list() {
    const items = this.loadIndex().filter((item) => {
      try { return fs.statSync(this.resolveStoredFile(item.file)).isFile(); } catch { return false; }
    });
    return items.map((item) => this.publicItem(item, true));
  }

  find(id) {
    const item = this.loadIndex().find((entry) => entry.id === id);
    if (!item) throw new Error('历史图片不存在或已被清理');
    return item;
  }

  load(id) {
    const item = this.find(id);
    return {
      ...this.publicItem(item),
      buffer: fs.readFileSync(this.resolveStoredFile(item.file)),
      fileName: item.file
    };
  }

  clear() {
    const items = this.loadIndex();
    items.forEach((item) => this.removeFiles(item));
    this.saveIndex([]);
    return { cleared: items.length };
  }
}

module.exports = { ImageHistoryStore, MIME_EXTENSION };
