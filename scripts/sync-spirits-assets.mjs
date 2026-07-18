import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const sourceIndexFile = path.join(projectRoot, '精灵图片迭代', 'spirits_index.json');
const outputIndexFile = path.join(projectRoot, 'resources', 'data', 'sprites.json');
const spriteImageDir = path.join(projectRoot, 'resources', 'sprites-img');

const shouldDownload = !process.argv.includes('--skip-download');

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
  const sourceRaw = await fs.readFile(sourceIndexFile, 'utf8');
  const sourceRecords = JSON.parse(sourceRaw);

  if (!Array.isArray(sourceRecords)) {
    throw new Error('spirits_index.json must be an array');
  }

  const filenameCounts = new Map();
  const spriteJobs = sourceRecords.map((record, index) => {
    const filename = buildFilename(record, index, filenameCounts);
    const {
      精灵图片: sourceImageUrl,
      精灵属性图标1: _attributeIcon1,
      精灵属性图标2: _attributeIcon2,
      ...rest
    } = record;

    return {
      filename,
      sourceImageUrl: String(sourceImageUrl ?? '').trim(),
      outputRecord: {
        ...rest,
        path: `/resources/sprites-img/${filename}`,
      },
    };
  });

  await fs.mkdir(spriteImageDir, { recursive: true });

  if (shouldDownload) {
    const downloadedByUrl = new Map();

    for (const sprite of spriteJobs) {
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

  const payload = spriteJobs.map((sprite) => sprite.outputRecord);
  await fs.writeFile(outputIndexFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  console.log(`sprites: ${spriteJobs.length}`);
  console.log(`download: ${shouldDownload ? 'enabled' : 'skipped'}`);
  console.log(`index: ${path.relative(projectRoot, outputIndexFile)}`);
  console.log(`images: ${path.relative(projectRoot, spriteImageDir)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
