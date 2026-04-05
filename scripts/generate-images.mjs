import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import exifr from 'exifr';
import sharp from 'sharp';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(scriptDirectory, '..');
const dataDirectory = path.join(rootDirectory, 'data');
const outputDirectory = path.join(dataDirectory, '.generated', 'v1');

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
const metadataManifest = {};
const manifestPath = path.join(outputDirectory, 'manifest.json');

expectedOutputs.add(manifestPath);

for (const sourceFile of sourceFiles) {
  const relativeSourcePath = toPosixPath(path.relative(dataDirectory, sourceFile));
  const relativeSourceDirectory = path.dirname(relativeSourcePath);
  const targetDirectory = path.join(outputDirectory, relativeSourceDirectory);
  const metadata = await readPhotoMetadata(sourceFile);

  if (metadata) {
    metadataManifest[relativeSourcePath] = metadata;
  }

  await fs.mkdir(targetDirectory, { recursive: true });

  for (const variant of VARIANTS) {
    const outputPath = path.join(targetDirectory, `${path.basename(relativeSourcePath)}${variant.suffix}`);
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
await fs.writeFile(manifestPath, `${JSON.stringify(metadataManifest, null, 2)}\n`);

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

function roundNumber(value, digits) {
  return Number(value.toFixed(digits));
}

function toPosixPath(value) {
  return value.split(path.sep).join('/');
}
