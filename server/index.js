/* eslint-env node */

import express from 'express';
import cors from 'cors';
import { nanoid } from 'nanoid';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import process from 'node:process';
import { Buffer } from 'node:buffer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file manually (without dotenv package)
function loadEnvFile() {
  try {
    const envPath = path.join(__dirname, '..', '.env');
    const envContent = fs.readFileSync(envPath, 'utf8');
    
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').trim();
        process.env[key.trim()] = value;
      }
    });
    
    console.log('✅ Loaded .env file');
  } catch (error) {
    console.warn('⚠️ No .env file found, using defaults');
  }
}

loadEnvFile();

const app = express();
const fsPromises = fs.promises;

const PORT = Number.parseInt(process.env.PORT ?? '8787', 10);
const MAX_PAYLOAD_BYTES = Number.parseInt(process.env.MAX_PAYLOAD_BYTES ?? String(512 * 1024), 10);
const DATA_ROOT = process.env.MAP_DATA_DIR
  ? path.resolve(process.env.MAP_DATA_DIR)
  : path.join(__dirname, 'storage');
const MAPS_DIR = path.join(DATA_ROOT, 'maps');
const INDEX_FILE = path.join(DATA_ROOT, 'index.json');
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? '';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const TILE_LIMIT = Number.parseInt(process.env.TILE_LIMIT ?? '10000', 10);

function ensurePositiveInteger(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

async function pathExists(targetPath) {
  try {
    await fsPromises.access(targetPath);
    return true;
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

async function ensureStorageLayout() {
  await fsPromises.mkdir(MAPS_DIR, { recursive: true });
  if (!(await pathExists(INDEX_FILE))) {
    await fsPromises.writeFile(INDEX_FILE, '[]', 'utf8');
  }
}

async function readIndex() {
  try {
    const raw = await fsPromises.readFile(INDEX_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function writeIndex(index) {
  await fsPromises.writeFile(INDEX_FILE, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
}

function sanitizeName(name) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed) {
    return 'Untitled Map';
  }
  return trimmed.slice(0, 120);
}

function validateTile(tile, index) {
  if (!tile || typeof tile !== 'object') {
    throw new Error(`Tile at index ${index} is invalid.`);
  }

  const { q, r, y } = tile;
  if (!Number.isFinite(q) || !Number.isFinite(r) || !Number.isFinite(y)) {
    throw new Error(`Tile at index ${index} has invalid coordinates.`);
  }

  if (tile.biomeId && typeof tile.biomeId !== 'string') {
    throw new Error(`Tile at index ${index} has an invalid biome id.`);
  }

  if (tile.instanceId && typeof tile.instanceId !== 'string') {
    throw new Error(`Tile at index ${index} has an invalid instance id.`);
  }
}

function validateMapData(mapData) {
  if (!mapData || typeof mapData !== 'object') {
    throw new Error('Request body must be a JSON object.');
  }

  if (typeof mapData.version !== 'string' || !mapData.version.trim()) {
    throw new Error('Map version is required.');
  }

  if (typeof mapData.name !== 'string' || !mapData.name.trim()) {
    throw new Error('Map name is required.');
  }

  if (!Array.isArray(mapData.tiles)) {
    throw new Error('Tiles array is required.');
  }

  const tileLimit = ensurePositiveInteger(TILE_LIMIT, 10000);
  if (mapData.tiles.length > tileLimit) {
    throw new Error(`Tile count exceeds the limit of ${tileLimit} entries.`);
  }

  mapData.tiles.forEach(validateTile);

  if (mapData.packCounts && typeof mapData.packCounts !== 'object') {
    throw new Error('packCounts must be an object.');
  }

  if (mapData.standaloneBiomeSetCounts && typeof mapData.standaloneBiomeSetCounts !== 'object') {
    throw new Error('standaloneBiomeSetCounts must be an object.');
  }
}

function buildCorsConfig() {
  if (!ALLOWED_ORIGINS.length) {
    return { origin: true };
  }

  return {
    origin(origin, callback) {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Origin not allowed by CORS policy.'), false);
    }
  };
}

function requireAdmin(req, res, next) {
  if (!ADMIN_TOKEN) {
    return res.status(404).json({ error: 'Admin API is disabled.' });
  }

  const headerTokenRaw = req.headers['x-admin-token'];
  const queryToken = req.query.adminToken || req.query.token;
  const headerToken = Array.isArray(headerTokenRaw) ? headerTokenRaw[0] : headerTokenRaw;
  const provided = (headerToken ?? queryToken ?? '').toString();

  if (!provided || provided !== ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  return next();
}

app.use(cors(buildCorsConfig()))
  .use(express.json({ limit: MAX_PAYLOAD_BYTES }))
  .get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

app.post('/api/maps', async (req, res) => {
  try {
    validateMapData(req.body);
    const storedAt = new Date().toISOString();
    const id = nanoid(8);
    const safeMapName = sanitizeName(req.body.name);
    const storedMap = {
      ...req.body,
      name: safeMapName,
      sharedAt: storedAt
    };

    const payload = JSON.stringify(storedMap);
    const payloadBytes = Buffer.byteLength(payload, 'utf8');
    
    if (payloadBytes > MAX_PAYLOAD_BYTES) {
      throw new Error('Map payload exceeds server limit.');
    }

    const mapPath = path.join(MAPS_DIR, `${id}.json`);
    await fsPromises.writeFile(mapPath, `${JSON.stringify(storedMap, null, 2)}\n`, 'utf8');

  const index = await readIndex();
    const metadata = {
      id,
      name: safeMapName,
      tileCount: Array.isArray(req.body.tiles) ? req.body.tiles.length : 0,
      sizeBytes: payloadBytes,
      placementMode: typeof req.body.placementMode === 'string' ? req.body.placementMode : 'limited',
      createdAt: req.body.createdAt ?? storedAt,
      sharedAt: storedAt,
      lastAccessed: storedAt,
      accessCount: 0
    };
    const updatedIndex = [metadata, ...index.filter((entry) => entry.id !== id)];
    await writeIndex(updatedIndex);

    res.status(201).json({ id, url: `/api/maps/${id}`, sharedAt: storedAt });
  } catch (error) {
    console.error('Failed to store map payload:', error);
    res.status(400).json({ error: error.message ?? 'Unable to store map.' });
  }
});

app.get('/api/maps/:id', async (req, res) => {
  const { id } = req.params;
  const mapPath = path.join(MAPS_DIR, `${id}.json`);

  try {
    const raw = await fsPromises.readFile(mapPath, 'utf8');
    const parsed = JSON.parse(raw);

    const index = await readIndex();
    const now = new Date().toISOString();
    const updatedIndex = index.map((entry) => {
      if (entry.id !== id) {
        return entry;
      }
      return {
        ...entry,
        lastAccessed: now,
        accessCount: (entry.accessCount ?? 0) + 1
      };
    });
    await writeIndex(updatedIndex);

    res.json(parsed);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      res.status(404).json({ error: 'Map not found.' });
      return;
    }
    console.error('Failed to read map payload:', error);
    res.status(500).json({ error: 'Unable to load map.' });
  }
});

app.get('/api/admin/maps', requireAdmin, async (req, res) => {
  try {
    let index = await readIndex();
    
    // Calculate missing sizeBytes for existing maps
    let needsUpdate = false;
    const updatedIndex = await Promise.all(index.map(async (entry) => {
      if (entry.sizeBytes === undefined) {
        needsUpdate = true;
        const mapPath = path.join(MAPS_DIR, `${entry.id}.json`);
        try {
          const stats = await fsPromises.stat(mapPath);
          return { ...entry, sizeBytes: stats.size };
        } catch (error) {
          console.warn(`Could not get size for map ${entry.id}:`, error.message);
          return { ...entry, sizeBytes: 0 };
        }
      }
      return entry;
    }));
    
    if (needsUpdate) {
      await writeIndex(updatedIndex);
      console.log('✅ Updated index with file sizes');
    }
    
    res.json({ data: updatedIndex });
  } catch (error) {
    console.error('Failed to read map index:', error);
    res.status(500).json({ error: 'Unable to read index.' });
  }
});

app.delete('/api/admin/maps/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const mapPath = path.join(MAPS_DIR, `${id}.json`);

  try {
    try {
      await fsPromises.unlink(mapPath);
    } catch (error) {
      if (!error || error.code !== 'ENOENT') {
        throw error;
      }
    }

    const index = await readIndex();
    const updatedIndex = index.filter((entry) => entry.id !== id);
    await writeIndex(updatedIndex);

    res.status(204).end();
  } catch (error) {
    console.error('Failed to delete map:', error);
    res.status(500).json({ error: 'Unable to delete map.' });
  }
});

app.put('/api/admin/maps/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  const mapPath = path.join(MAPS_DIR, `${id}.json`);

  try {
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Map name is required.' });
    }

    // Check if map exists
    if (!(await pathExists(mapPath))) {
      return res.status(404).json({ error: 'Map not found.' });
    }

    // Read current map data
    const mapContent = await fsPromises.readFile(mapPath, 'utf8');
    const mapData = JSON.parse(mapContent);
    
    // Update name
    mapData.name = name.trim();
    
    // Write back to file
    await fsPromises.writeFile(mapPath, JSON.stringify(mapData, null, 2));

    // Update index
    const index = await readIndex();
    const entry = index.find((e) => e.id === id);
    if (entry) {
      entry.name = name.trim();
      await writeIndex(index);
    }

    res.json({ success: true, name: name.trim() });
  } catch (error) {
    console.error('Failed to update map:', error);
    res.status(500).json({ error: 'Unable to update map.' });
  }
});

app.get('/api/admin/maps/:id/download', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const mapPath = path.join(MAPS_DIR, `${id}.json`);

  try {
    if (!(await pathExists(mapPath))) {
      return res.status(404).json({ error: 'Map not found.' });
    }

    const mapContent = await fsPromises.readFile(mapPath, 'utf8');
    const mapData = JSON.parse(mapContent);
    
    const filename = `${mapData.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${id}.lsm`;
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(mapContent);
  } catch (error) {
    console.error('Failed to download map:', error);
    res.status(500).json({ error: 'Unable to download map.' });
  }
});

app.use((err, req, res, _next) => {
  if (err && err.message === 'Origin not allowed by CORS policy.') {
    res.status(403).json({ error: err.message });
    return;
  }

  if (err && err.type === 'entity.too.large') {
    res.status(413).json({ error: 'Request payload too large.' });
    return;
  }

  console.error('Unhandled server error:', err);
  res.status(500).json({ error: 'Internal server error.' });
});

async function bootstrap() {
  await ensureStorageLayout();
  app.listen(PORT, () => {
    console.warn(`Share API ready on http://localhost:${PORT}`);
  });
}

bootstrap().catch((error) => {
  console.error('Failed to start share API:', error);
  process.exitCode = 1;
});
