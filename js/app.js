import generatedManifest from '../data/.generated/v1/manifest.json';

const THEME_STORAGE_KEY = 'field-notes-theme';
const ARCHIVE_DIRECTORY = 'archive';
const ARCHIVE_LABEL = 'Archive';

function getSavedTheme() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return null;
  }
}

function saveTheme(theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {}
}

function applyTheme(theme) {
  const nextTheme = theme === 'light' ? 'light' : 'dark';
  const toggle = document.getElementById('theme-toggle');

  document.documentElement.dataset.theme = nextTheme;

  if (!toggle) return;

  const toggleTarget = nextTheme === 'light' ? 'dark' : 'light';
  toggle.textContent = toggleTarget;
  toggle.setAttribute('aria-label', `Switch to ${toggleTarget} theme`);
  toggle.setAttribute('aria-pressed', String(nextTheme === 'light'));
}

function initThemeToggle() {
  const toggle = document.getElementById('theme-toggle');
  if (!toggle) return;

  const savedTheme = getSavedTheme();
  const initialTheme = savedTheme === 'light' ? 'light' : 'dark';

  applyTheme(initialTheme);

  toggle.addEventListener('click', () => {
    const currentTheme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
    const nextTheme = currentTheme === 'light' ? 'dark' : 'light';

    applyTheme(nextTheme);
    saveTheme(nextTheme);
  });
}

/* ── Render Journal ── */
function renderJournal({ days, archive }) {
  const journal = document.getElementById('journal');

  if ((!days || days.length === 0) && (!archive || archive.images.length === 0)) {
    journal.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--muted);">No images found in the data folder.</div>';
    return;
  }

  // Update header metadata dynamically based on days
  updateHeaderMeta(days, archive.images.length);

  let lastMonth = '';
  days.forEach((day, di) => {
    // Parse JS Date from our ISO format date string, or from its components
    const dayDate = new Date(day.date);
    const monthLabel = dayDate.toLocaleString('en-GB', { month: 'long' }).toUpperCase() + ' ' + day.year;

    // Month separator
    if (monthLabel !== lastMonth) {
      const sep = document.createElement('div');
      sep.className = 'month-label';
      sep.innerHTML = `<span>${monthLabel}</span>`;
      journal.appendChild(sep);
      lastMonth = monthLabel;
    }

    // Day row
    const row = document.createElement('div');
    row.className = 'day-row';

    const lbl = document.createElement('div');
    lbl.className = 'date-label';
    lbl.innerHTML = `<span class="date-day">${day.dayNum}</span><span class="date-month">${day.monthShort}</span>`;
    row.appendChild(lbl);

    const strip = document.createElement('div');
    strip.className = 'images-strip';

    day.images.forEach((image, idx) => {
      const prioritizeImage = di === 0 && idx < 2;
      strip.appendChild(createImageCard(image, day.label, prioritizeImage, idx));
    });

    row.appendChild(strip);
    journal.appendChild(row);
  });

  if (archive.images.length > 0) {
    const sectionLabel = document.createElement('div');
    sectionLabel.className = 'journal-section-label';
    sectionLabel.innerHTML = `<span>${ARCHIVE_LABEL}</span>`;
    journal.appendChild(sectionLabel);

    const row = document.createElement('div');
    row.className = 'day-row day-row--undated';

    const strip = document.createElement('div');
    strip.className = 'images-strip';

    archive.images.forEach((image, idx) => {
      strip.appendChild(createImageCard(image, ARCHIVE_LABEL, false, idx));
    });

    row.appendChild(strip);
    journal.appendChild(row);
  }
}

function createImageCard(image, label, prioritizeImage, index) {
  const card = document.createElement('div');
  card.className = 'img-card';
  card.dataset.date = label;
  card.style.animationDelay = `${index * 0.07}s`;

  const img = document.createElement('img');
  img.src = image.thumbSrc;
  img.loading = prioritizeImage ? 'eager' : 'lazy';
  img.decoding = 'async';
  img.fetchPriority = prioritizeImage ? 'high' : 'auto';
  img.alt = `Photo from ${label}`;

  card.appendChild(img);
  card.addEventListener('click', () => openLightbox(image.viewSrc, label, image.metadata));
  return card;
}

function updateHeaderMeta(days, archiveImageCount) {
  const metaElem = document.querySelector('.header-meta');
  if (!metaElem) return;

  const segments = [];

  if (days.length) {
    const totalDays = days.length;
    // unique months using Year-Month format
    const uniqueMonths = new Set(days.map(d => `${d.year}-${d.monthNum}`));
    const numMonths = uniqueMonths.size;

    segments.push(`${numMonths} month${numMonths !== 1 ? 's' : ''}`);
    segments.push(`${totalDays} day${totalDays !== 1 ? 's' : ''}`);
  }

  if (archiveImageCount > 0) {
    segments.push(`${archiveImageCount} archive photo${archiveImageCount !== 1 ? 's' : ''}`);
  }

  metaElem.textContent = segments.join(' · ');
}

/* ── Lightbox ── */
const lightbox = document.getElementById('lightbox');
const lightboxWrap = document.getElementById('lb-img-wrap');
const lightboxMeta = document.getElementById('lb-meta');
const lightboxExif = document.getElementById('lb-exif');
const lightboxInfoToggle = document.getElementById('lb-info-toggle');

function setLightboxExifExpanded(expanded) {
  const shouldExpand = expanded && !lightboxExif.hidden;
  lightboxExif.classList.toggle('is-open', shouldExpand);
  lightboxExif.setAttribute('aria-hidden', String(!shouldExpand));
  lightboxInfoToggle.setAttribute('aria-expanded', String(shouldExpand));
}

function closeLightbox() {
  lightbox.classList.remove('active');
  setLightboxExifExpanded(false);
}

function openLightbox(imgSrc, dateStr, metadata) {
  lightboxWrap.innerHTML = `<img src="${imgSrc}" alt="Photo on ${dateStr}" loading="eager" decoding="async" />`;
  lightboxMeta.textContent = dateStr;
  renderExifDetails(lightboxExif, metadata);
  lightbox.classList.add('active');
}

document.getElementById('lb-close').addEventListener('click', closeLightbox);
lightboxInfoToggle.addEventListener('click', () => {
  setLightboxExifExpanded(lightboxInfoToggle.getAttribute('aria-expanded') !== 'true');
});
lightbox.addEventListener('click', e => {
  if (e.target === lightbox) closeLightbox();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeLightbox();
});

/* ── Cursor ── */
const cursor = document.getElementById('cursor');
document.addEventListener('mousemove', e => {
  cursor.style.left = e.clientX + 'px';
  cursor.style.top  = e.clientY + 'px';
});
document.querySelectorAll && document.addEventListener('mouseover', e => {
  if (e.target.closest('.img-card')) cursor.classList.add('big');
  else cursor.classList.remove('big');
});

/* ── Build data using Vite's import.meta.glob ── */
function initData() {
  // Discover optimized image derivatives while preserving the date-based folder flow.
  const thumbs = import.meta.glob('../data/.generated/v1/**/*--thumb.webp', { eager: true, import: 'default' });
  const views = import.meta.glob('../data/.generated/v1/**/*--view.webp', { eager: true, import: 'default' });
  const daysMap = new Map();
  const archiveImages = [];
  const thumbMap = new Map();
  const viewMap = new Map();

  for (const [assetPath, src] of Object.entries(thumbs)) {
    const assetId = extractGeneratedAssetId(assetPath, '--thumb.webp');
    if (assetId) thumbMap.set(assetId, src);
  }

  for (const [assetPath, src] of Object.entries(views)) {
    const assetId = extractGeneratedAssetId(assetPath, '--view.webp');
    if (assetId) viewMap.set(assetId, src);
  }

  const manifestImages = Array.isArray(generatedManifest.images) ? generatedManifest.images : [];

  for (const entry of manifestImages) {
    const thumbSrc = thumbMap.get(entry.id);
    if (!thumbSrc) continue;

    const image = {
      thumbSrc,
      viewSrc: viewMap.get(entry.id) ?? thumbSrc,
      metadata: entry.metadata ?? null
    };

    if (entry.kind === 'dated' && entry.date) {
      if (!daysMap.has(entry.date)) {
        daysMap.set(entry.date, createDayEntry(entry.date, entry.year, entry.month, entry.day));
      }

      daysMap.get(entry.date).images.push(image);

      continue;
    }

    if (entry.kind === 'archive') {
      archiveImages.push(image);
    }
  }

  // Convert to array and sort descending
  const sortedDates = Array.from(daysMap.keys()).sort((a, b) => b.localeCompare(a));
  return {
    days: sortedDates.map(date => daysMap.get(date)),
    archive: {
      label: ARCHIVE_LABEL,
      images: archiveImages
    }
  };
}

function createDayEntry(dateStr, year, month, day) {
  const d = new Date(dateStr);

  return {
    date: dateStr,
    year,
    monthNum: month,
    dayNum: day,
    label: `${day} ${d.toLocaleString('en-GB', { month: 'short' }).toUpperCase()} ${year}`,
    monthShort: d.toLocaleString('en-GB', { month: 'short' }).toUpperCase(),
    images: []
  };
}

function extractGeneratedAssetId(assetPath, suffix) {
  const match = assetPath.match(/data\/\.generated\/v1\/(.+)$/);
  if (!match) return null;

  const relativePath = match[1];
  return relativePath.endsWith(suffix) ? relativePath.slice(0, -suffix.length) : null;
}

function renderExifDetails(container, metadata) {
  const items = buildExifItems(metadata);

  container.replaceChildren(
    ...items.map(({ label, value }) => {
      const item = document.createElement('div');
      item.className = 'lightbox-exif-item';

      const term = document.createElement('dt');
      term.textContent = label;

      const description = document.createElement('dd');
      description.textContent = value;

      item.append(term, description);
      return item;
    })
  );

  const hasExif = items.length > 0;
  container.hidden = !hasExif;
  lightboxInfoToggle.hidden = !hasExif;
  setLightboxExifExpanded(false);
}

function buildExifItems(metadata) {
  if (!metadata) {
    return [];
  }

  const items = [];

  if (metadata.camera) {
    items.push({ label: 'Camera', value: metadata.camera });
  }

  if (metadata.lens) {
    items.push({ label: 'Lens', value: metadata.lens });
  }

  if (Number.isFinite(metadata.focalLength)) {
    items.push({ label: 'Focal', value: `${formatNumber(metadata.focalLength)}mm` });
  }

  if (Number.isFinite(metadata.aperture)) {
    items.push({ label: 'Aperture', value: `f/${formatNumber(metadata.aperture)}` });
  }

  if (Number.isFinite(metadata.exposureTime)) {
    items.push({ label: 'Shutter', value: formatShutterSpeed(metadata.exposureTime) });
  }

  if (Number.isFinite(metadata.iso)) {
    items.push({ label: 'ISO', value: String(metadata.iso) });
  }

  if (Number.isFinite(metadata.exposureCompensation)) {
    items.push({ label: 'EV', value: `${formatSignedNumber(metadata.exposureCompensation)} EV` });
  }

  return items;
}

function formatShutterSpeed(seconds) {
  if (seconds >= 1) {
    return `${formatNumber(seconds)}s`;
  }

  return `1/${Math.round(1 / seconds)}s`;
}

function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : String(value).replace(/\.0$/, '');
}

function formatSignedNumber(value) {
  return value > 0 ? `+${formatNumber(value)}` : formatNumber(value);
}

/* ── Bootstrap ── */
document.addEventListener('DOMContentLoaded', () => {
  initThemeToggle();

  const finalData = initData();
  renderJournal(finalData);

  document.querySelectorAll('.images-strip').forEach(strip => {
    let down = false, sx, sl;
    strip.addEventListener('mousedown', e => { down = true; sx = e.pageX; sl = strip.scrollLeft; });
    document.addEventListener('mousemove', e => { if (down) strip.scrollLeft = sl - (e.pageX - sx); });
    document.addEventListener('mouseup',   () => { down = false; });
    strip.addEventListener('wheel', e => { e.preventDefault(); strip.scrollLeft += e.deltaY; }, { passive: false });
  });
});
