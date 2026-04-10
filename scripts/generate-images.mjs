import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import exifr from 'exifr';
import sharp from 'sharp';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(scriptDirectory, '..');
const dataDirectory = path.join(rootDirectory, 'data');
const outputDirectory = path.join(dataDirectory, '.generated', 'v1');
const ARCHIVE_DIRECTORY = 'archive';
const SPECIAL_COLLECTION_DIRECTORIES = new Set(['portraits', 'japan-2023']);

const SOURCE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.avif',
  '.tif',
  '.tiff',
]);

const VARIANTS = [
  { suffix: '--thumb.webp', size: 720, quality: 68 },
  { suffix: '--view.webp', size: 1800, quality: 82 },
];
const MANIFEST_VERSION = 5;

const stats = {
  failed: 0,
  removed: 0,
  skipped: 0,
  written: 0,
};
let activeProgressReporter = null;

const manifestPath = path.join(outputDirectory, 'manifest.json');
const generatedManifest = {
  version: MANIFEST_VERSION,
  images: [],
};

await fs.mkdir(outputDirectory, { recursive: true });

const sourceFiles = await collectSourceFiles(dataDirectory);

if (sourceFiles.length === 0) {
  if (await pathExists(manifestPath)) {
    console.log('No source images found. Keeping existing generated assets.');
    process.exit(0);
  }

  await fs.writeFile(manifestPath, `${JSON.stringify(generatedManifest, null, 2)}\n`);
  console.log('No source images found. Wrote an empty generated manifest.');
  process.exit(0);
}

const expectedOutputs = new Set();
const progressReporter = createProgressReporter(sourceFiles.length);

expectedOutputs.add(manifestPath);

logMessage('log', `Generating optimized images for ${sourceFiles.length} source image(s)...`);

activeProgressReporter = progressReporter;

try {
  for (const [index, sourceFile] of sourceFiles.entries()) {
    const relativeSourcePath = toPosixPath(path.relative(dataDirectory, sourceFile));
    progressReporter.update(index + 1, relativeSourcePath, stats);

    const photoInfo = await readPhotoInfo(sourceFile);
    const assetId = createGeneratedAssetId(relativeSourcePath);
    const manifestEntry = buildManifestEntry(assetId, relativeSourcePath, photoInfo);
    const targetDirectory = path.join(outputDirectory, path.dirname(assetId));
    const targetBaseName = path.basename(assetId);

    generatedManifest.images.push(manifestEntry);

    await fs.mkdir(targetDirectory, { recursive: true });

    for (const variant of VARIANTS) {
      const outputPath = path.join(targetDirectory, `${targetBaseName}${variant.suffix}`);
      expectedOutputs.add(outputPath);

      if (!(await shouldGenerate(sourceFile, outputPath))) {
        stats.skipped += 1;
        continue;
      }

      try {
        await sharp(sourceFile, { failOn: 'none' })
          .rotate()
          .resize({
            width: variant.size,
            height: variant.size,
            fit: 'inside',
            withoutEnlargement: true,
          })
          .webp({
            quality: variant.quality,
            effort: 6,
          })
          .toFile(outputPath);

        stats.written += 1;
      } catch (error) {
        stats.failed += 1;
        logMessage('error', `Failed to optimize ${relativeSourcePath}:`, error.message);
      }
    }
  }
} finally {
  progressReporter.finish();
  activeProgressReporter = null;
}

await removeStaleOutputs(outputDirectory, expectedOutputs);
await fs.writeFile(manifestPath, `${JSON.stringify(generatedManifest, null, 2)}\n`);

console.log(
  `Optimized ${sourceFiles.length} source image(s): ${stats.written} written, ${stats.skipped} skipped, ${stats.removed} removed, ${stats.failed} failed.`,
);

if (stats.failed > 0) {
  process.exitCode = 1;
}

async function collectSourceFiles(directory) {
  let entries;

  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return [];
    }

    throw error;
  }

  const files = [];

  for (const entry of entries) {
    if (entry.name === '.generated' || entry.name.startsWith('.')) {
      continue;
    }

    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(entryPath)));
      continue;
    }

    if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(entryPath);
    }
  }

  return files.sort();
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function createProgressReporter(totalFiles) {
  const isInteractive = Boolean(process.stdout.isTTY);
  const stepInterval = 10;
  const timeIntervalMs = 5000;
  let currentMessage = '';
  let lastLoggedIndex = 0;
  let lastLoggedAt = 0;

  return {
    update(currentIndex, relativeSourcePath, currentStats) {
      currentMessage = formatProgressMessage(totalFiles, currentIndex, relativeSourcePath, currentStats);

      if (isInteractive) {
        process.stdout.write(renderProgressLine(currentMessage));
        return;
      }

      const now = Date.now();
      const shouldLog = (
        currentIndex === 1
        || currentIndex === totalFiles
        || currentIndex - lastLoggedIndex >= stepInterval
        || now - lastLoggedAt >= timeIntervalMs
      );

      if (!shouldLog) {
        return;
      }

      console.log(currentMessage);
      lastLoggedIndex = currentIndex;
      lastLoggedAt = now;
    },

    beforeLog() {
      if (!currentMessage || !isInteractive) {
        return;
      }

      process.stdout.write('\n');
    },

    afterLog() {
      if (!currentMessage || !isInteractive) {
        return;
      }

      process.stdout.write(renderProgressLine(currentMessage));
    },

    finish() {
      if (!currentMessage || !isInteractive) {
        return;
      }

      process.stdout.write('\n');
      currentMessage = '';
    },
  };
}

function formatProgressMessage(totalFiles, currentIndex, relativeSourcePath, currentStats) {
  const progressPercent = Math.min(100, Math.max(1, Math.round((currentIndex / totalFiles) * 100)));

  return [
    `[${currentIndex}/${totalFiles}]`,
    `${progressPercent}%`,
    relativeSourcePath,
    `written:${currentStats.written}`,
    `skipped:${currentStats.skipped}`,
    `failed:${currentStats.failed}`,
  ].join(' · ');
}

function renderProgressLine(message) {
  return `\r\x1b[2K${message}`;
}

function logMessage(method, ...parts) {
  activeProgressReporter?.beforeLog();
  console[method](...parts);
  activeProgressReporter?.afterLog();
}

async function shouldGenerate(sourcePath, outputPath) {
  try {
    const [sourceStats, outputStats] = await Promise.all([
      fs.stat(sourcePath),
      fs.stat(outputPath),
    ]);

    return sourceStats.mtimeMs > outputStats.mtimeMs;
  } catch {
    return true;
  }
}

async function removeStaleOutputs(directory, expectedOutputs) {
  const entries = await fs.readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      await removeStaleOutputs(entryPath, expectedOutputs);
      await removeDirectoryIfEmpty(entryPath);
      continue;
    }

    if (!expectedOutputs.has(entryPath)) {
      await fs.rm(entryPath);
      stats.removed += 1;
    }
  }
}

async function removeDirectoryIfEmpty(directory) {
  const entries = await fs.readdir(directory);

  if (entries.length === 0) {
    await fs.rmdir(directory);
  }
}

async function readPhotoInfo(sourcePath) {
  const [metadata, dimensions] = await Promise.all([
    readPhotoMetadata(sourcePath),
    readPhotoDimensions(sourcePath),
  ]);

  return {
    metadata,
    dimensions,
  };
}

async function readPhotoMetadata(sourcePath) {
  let metadata;

  try {
    metadata = await exifr.parse(sourcePath, {
      pick: [
        'Model',
        'LensModel',
        'FocalLength',
        'FNumber',
        'ExposureTime',
        'ISO',
        'ExposureCompensation',
      ],
    });
  } catch (error) {
    logMessage('warn', `Skipping EXIF metadata for ${toPosixPath(path.relative(dataDirectory, sourcePath))}: ${error.message}`);
    return null;
  }

  if (!metadata) {
    return null;
  }

  const result = {};

  if (metadata.Model) {
    result.camera = metadata.Model;
  }

  if (metadata.LensModel) {
    result.lens = metadata.LensModel;
  }

  if (Number.isFinite(metadata.FocalLength)) {
    result.focalLength = roundNumber(metadata.FocalLength, 1);
  }

  if (Number.isFinite(metadata.FNumber)) {
    result.aperture = roundNumber(metadata.FNumber, 1);
  }

  if (Number.isFinite(metadata.ExposureTime)) {
    result.exposureTime = metadata.ExposureTime;
  }

  if (Number.isFinite(metadata.ISO)) {
    result.iso = metadata.ISO;
  }

  if (Number.isFinite(metadata.ExposureCompensation) && metadata.ExposureCompensation !== 0) {
    result.exposureCompensation = roundNumber(metadata.ExposureCompensation, 1);
  }

  return Object.keys(result).length > 0 ? result : null;
}

async function readPhotoDimensions(sourcePath) {
  try {
    const metadata = await sharp(sourcePath, { failOn: 'none' }).rotate().metadata();

    if (Number.isFinite(metadata.width) && Number.isFinite(metadata.height)) {
      return {
        width: metadata.width,
        height: metadata.height,
      };
    }
  } catch (error) {
    logMessage('warn', `Skipping image dimensions for ${toPosixPath(path.relative(dataDirectory, sourcePath))}: ${error.message}`);
  }

  return null;
}

function roundNumber(value, digits) {
  return Number(value.toFixed(digits));
}

function toPosixPath(value) {
  return value.split(path.sep).join('/');
}

function createGeneratedAssetId(relativeSourcePath) {
  const digest = createHash('sha256').update(relativeSourcePath).digest('hex');
  return `${digest.slice(0, 2)}/${digest.slice(2)}`;
}

function buildManifestEntry(assetId, relativeSourcePath, photoInfo) {
  const metadata = photoInfo?.metadata ?? null;
  const dimensions = photoInfo?.dimensions ?? null;
  const baseEntry = {
    id: assetId,
    kind: 'ignored',
    metadata: metadata ?? null,
    ...(dimensions ? { width: dimensions.width, height: dimensions.height } : {}),
  };

  const datedMatch = relativeSourcePath.match(/^(\d{4})\/(\d{2})\/(\d{2})\/.+$/);

  if (datedMatch) {
    const [, year, month, day] = datedMatch;
    return {
      ...baseEntry,
      kind: 'dated',
      date: `${year}-${month}-${day}`,
      year,
      month,
      day,
    };
  }

  const monthlyMatch = relativeSourcePath.match(/^(\d{4})\/(\d{2})\/[^/]+$/);

  if (monthlyMatch) {
    const [, year, month] = monthlyMatch;
    return {
      ...baseEntry,
      kind: 'monthly',
      year,
      month,
    };
  }

  const yearlyFolderMatch = relativeSourcePath.match(/^(\d{4})\/([^/]+)\/.+$/);

  if (yearlyFolderMatch) {
    const [, year, folderName] = yearlyFolderMatch;
    return {
      ...baseEntry,
      kind: 'yearly-folder',
      year,
      folderName,
    };
  }

  const yearlyFileMatch = relativeSourcePath.match(/^(\d{4})\/[^/]+$/);

  if (yearlyFileMatch) {
    const [, year] = yearlyFileMatch;
    return {
      ...baseEntry,
      kind: 'yearly-folder',
      year,
      folderName: 'misc',
    };
  }

  if (relativeSourcePath.startsWith(`${ARCHIVE_DIRECTORY}/`)) {
    return {
      ...baseEntry,
      kind: 'archive',
      sourceName: path.basename(relativeSourcePath),
    };
  }

  const collectionMatch = relativeSourcePath.match(/^([^/]+)\/.+$/);

  if (collectionMatch) {
    const [, collection] = collectionMatch;

    if (SPECIAL_COLLECTION_DIRECTORIES.has(collection)) {
      const sourceName = relativeSourcePath.slice(collection.length + 1);
      const collectionGroupMatch = sourceName.match(/^([^/]+)\/.+$/);
      return {
        ...baseEntry,
        kind: 'collection',
        collection,
        sourceName,
        ...(collectionGroupMatch ? { collectionGroup: collectionGroupMatch[1] } : {}),
      };
    }
  }

  return baseEntry;
}
