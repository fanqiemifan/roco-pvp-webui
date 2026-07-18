import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const sourceIndexFile = path.join(projectRoot, '精灵图片迭代', 'spirits_index.json');
const attributeMappingFile = path.join(projectRoot, 'resources', 'data', 'attribute_mapping.json');
const outputIndexFile = path.join(projectRoot, 'resources', 'data', 'sprites.json');
const spriteImageDir = path.join(projectRoot, 'resources', 'sprites-img');

const shouldDownload = !process.argv.includes('--skip-download');

function uniqueStrings(values) {
  const seen = new Set();
  const result = [];

  for (const value of values) {
    const text = String(value ?? '').trim();
    if (!text || seen.has(text)) {
      continue;
    }
    seen.add(text);
    result.push(text);
  }

  return result;
}

function splitAttributes(value) {
  return String(value ?? '')
    .split(/[、/,，\s]+/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function cleanCardName(value) {
  return String(value ?? '').trim().replace(/[-_－—]\d+$/u, '');
}

function parseNumber(value) {
  const match = /(\d+)/.exec(String(value ?? ''));
  return match ? Number(match[1]) : null;
}

function parseVariant(value) {
  const match = /[-_－—](\d+)$/u.exec(String(value ?? '').trim());
  return match ? Number(match[1]) : 0;
}

function sanitizeFilenameSegment(value, fallback) {
  const normalized = String(value ?? '')
    .normalize('NFC')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, '')
    .replace(/\.+$/g, '')
    .trim();

  return normalized || fallback;
}

function inferExtension(imageUrl) {
  try {
    const pathname = new URL(imageUrl).pathname;
    const ext = path.extname(pathname);
    return ext ? ext.toLowerCase() : '.png';
  } catch {
    return '.png';
  }
}

function buildFilename(record, index, filenameCounts) {
  const numberText = sanitizeFilenameSegment(record['精灵编号'] || `NO.${String(index + 1).padStart(3, '0')}`, `NO.${String(index + 1).padStart(3, '0')}`);
  const nameText = sanitizeFilenameSegment(record['精灵名字2'] || record['精灵名称'] || `sprite-${index + 1}`, `sprite-${index + 1}`);
  const ext = inferExtension(record['精灵图片']);
  const base = `${numberText}_${nameText}`;
  const count = (filenameCounts.get(base) ?? 0) + 1;
  filenameCounts.set(base, count);
  return count > 1 ? `${base}__${count}${ext}` : `${base}${ext}`;
}

async function downloadBuffer(url) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      'user-agent': 'pvp-webui-for-roco/1.0',
    },
  });

  if (!response.ok) {
    throw new Error(`download failed: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function main() {
  const [sourceRaw, attributeRaw] = await Promise.all([
    fs.readFile(sourceIndexFile, 'utf8'),
    fs.readFile(attributeMappingFile, 'utf8'),
  ]);

  const sourceRecords = JSON.parse(sourceRaw);
  const attributeMapping = JSON.parse(attributeRaw);

  if (!Array.isArray(sourceRecords)) {
    throw new Error('spirits_index.json must be an array');
  }

  const attributeCodeByName = new Map(
    attributeMapping.map((item) => [String(item.属性).trim(), String(item.编号).trim()]),
  );

  const filenameCounts = new Map();
  const normalizedSprites = sourceRecords.map((record, index) => {
    const filename = buildFilename(record, index, filenameCounts);
    const rawName = String(record['精灵名字2'] ?? record['精灵名称'] ?? '').trim();
    const chineseName = String(record['精灵名称'] ?? rawName).trim() || rawName;
    const cardName = cleanCardName(rawName);
    const number = parseNumber(record['精灵编号']);
    const attributes = splitAttributes(record['精灵属性']);
    const attributeCodes = attributes
      .map((attribute) => attributeCodeByName.get(attribute) ?? '')
      .filter(Boolean)
      .slice(0, 2);

    return {
      id: filename,
      filename,
      displayName: rawName,
      name: rawName,
      chineseName,
      cardName,
      path: `/resources/sprites-img/${filename}`,
      aliases: uniqueStrings([
        rawName,
        cardName,
        chineseName,
        record['精灵编号'],
        number !== null ? String(number) : '',
        number !== null ? String(number).padStart(3, '0') : '',
        filename,
        path.parse(filename).name,
      ]),
      number,
      variant: parseVariant(rawName),
      attribute: attributes.join('、'),
      attributeCodes,
      attributeIcon1: attributeCodes[0] ? `/resources/attribute/${attributeCodes[0]}.png` : '',
      attributeIcon2: attributeCodes[1] ? `/resources/attribute/${attributeCodes[1]}.png` : '',
      form: String(record['精灵形态'] ?? '').trim(),
      sourceImageUrl: String(record['精灵图片'] ?? '').trim(),
    };
  });

  await fs.mkdir(spriteImageDir, { recursive: true });

  if (shouldDownload) {
    const downloadedByUrl = new Map();

    for (const sprite of normalizedSprites) {
      if (!sprite.sourceImageUrl) {
        continue;
      }

      const targetFile = path.join(spriteImageDir, sprite.filename);

      try {
        await fs.access(targetFile);
        if (!downloadedByUrl.has(sprite.sourceImageUrl)) {
          downloadedByUrl.set(sprite.sourceImageUrl, targetFile);
        }
        continue;
      } catch {
        // fall through and download or copy
      }

      const cachedFile = downloadedByUrl.get(sprite.sourceImageUrl);
      if (cachedFile) {
        await fs.copyFile(cachedFile, targetFile);
        continue;
      }

      const buffer = await downloadBuffer(sprite.sourceImageUrl);
      await fs.writeFile(targetFile, buffer);
      downloadedByUrl.set(sprite.sourceImageUrl, targetFile);
    }
  }

  const payload = {
    version: 2,
    generatedAt: new Date().toISOString(),
    sourceFile: '精灵图片迭代/spirits_index.json',
    sprites: normalizedSprites,
  };

  await fs.writeFile(outputIndexFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  console.log(`sprites: ${normalizedSprites.length}`);
  console.log(`download: ${shouldDownload ? 'enabled' : 'skipped'}`);
  console.log(`index: ${path.relative(projectRoot, outputIndexFile)}`);
  console.log(`images: ${path.relative(projectRoot, spriteImageDir)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
