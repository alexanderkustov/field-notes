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

const stats = {
  failed: 0,
  removed: 0,
  skipped: 0,
  written: 0,
};

await fs.mkdir(outputDirectory, { recursive: true });

const sourceFiles = await collectSourceFiles(dataDirectory);
const expectedOutputs = new Set();
const generatedManifest = {
  version: 3,
  images: [],
};
const manifestPath = path.join(outputDirectory, 'manifest.json');

expectedOutputs.add(manifestPath);

for (const sourceFile of sourceFiles) {
  const relativeSourcePath = toPosixPath(path.relative(dataDirectory, sourceFile));
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
      console.error(`Failed to optimize ${relativeSourcePath}:`, error.message);
    }
  }
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
  const entries = await fs.readdir(directory, { withFileTypes: true });
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
    console.warn(`Skipping EXIF metadata for ${toPosixPath(path.relative(dataDirectory, sourcePath))}: ${error.message}`);
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
    console.warn(`Skipping image dimensions for ${toPosixPath(path.relative(dataDirectory, sourcePath))}: ${error.message}`);
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

  if (relativeSourcePath.startsWith(`${ARCHIVE_DIRECTORY}/`)) {
    return {
      ...baseEntry,
      kind: 'archive',
      sourceName: path.basename(relativeSourcePath),
    };
  }

  return baseEntry;
}
