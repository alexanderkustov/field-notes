import generatedManifest from '../data/.generated/v1/manifest.json';

const THEME_STORAGE_KEY = 'field-notes-theme';
const ARCHIVE_DIRECTORY = 'archive';
const ARCHIVE_LABEL = 'Archive';
const PRIORITY_IMAGE_COUNT = 2;

let journalImageObserver;
let lightboxItems = [];
let activeLightboxIndex = -1;

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
function renderJournal({ entries, archive }) {
  const journal = document.getElementById('journal');
  journal.replaceChildren();
  lightboxItems = [];
  activeLightboxIndex = -1;

  if ((!entries || entries.length === 0) && (!archive || archive.images.length === 0)) {
    journal.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--muted);">No images found in the data folder.</div>';
    return;
  }

  updateHeaderMeta(entries, archive.images.length);

  let lastYear = '';
  let lastMonth = '';
  entries.forEach((entry, di) => {
    if (lastYear && entry.year !== lastYear) {
      journal.appendChild(createYearSeparator(entry.year));
      lastMonth = '';
    }

    if (entry.year !== lastYear) {
      lastYear = entry.year;
    }

    const monthLabel = entry.monthLabel;

    if (monthLabel !== lastMonth) {
      const sep = document.createElement('div');
      sep.className = 'month-label';
      sep.innerHTML = `<span>${monthLabel}</span>`;
      journal.appendChild(sep);
      lastMonth = monthLabel;
    }

    const row = document.createElement('div');
    row.className = entry.kind === 'month' ? 'day-row day-row--undated' : 'day-row';

    if (entry.kind === 'day') {
      const lbl = document.createElement('div');
      lbl.className = 'date-label';
      lbl.innerHTML = `<span class="date-day">${entry.dayNum}</span><span class="date-month">${entry.monthShort}</span>`;
      row.appendChild(lbl);
    }

    const strip = document.createElement('div');
    strip.className = 'images-strip';

    entry.images.forEach((image, idx) => {
      const prioritizeImage = di === 0 && idx < PRIORITY_IMAGE_COUNT;
      const lightboxIndex = registerLightboxItem(image, entry.label);
      strip.appendChild(createImageCard(image, entry.label, prioritizeImage, idx, lightboxIndex));
    });

    row.appendChild(strip);
    journal.appendChild(row);
  });

  if (archive.images.length > 0) {
    const sectionLabel = document.createElement('div');
    sectionLabel.className = 'journal-section-label';
    sectionLabel.innerHTML = `<span>${ARCHIVE_LABEL}</span>`;
    journal.appendChild(sectionLabel);
    journal.appendChild(createArchiveLayout(archive.images));
  }
}

function createYearSeparator(year) {
  const separator = document.createElement('div');
  separator.className = 'year-separator';

  const value = document.createElement('div');
  value.className = 'year-separator-value';

  const leading = document.createElement('span');
  leading.className = 'year-separator-leading';
  leading.textContent = year.slice(0, 2);

  const trailing = document.createElement('span');
  trailing.className = 'year-separator-trailing';
  trailing.textContent = year.slice(2);

  value.append(leading, trailing);
  separator.appendChild(value);
  return separator;
}

function createArchiveLayout(images) {
  const layout = document.createElement('div');
  layout.className = 'archive-layout';

  buildArchiveLayoutImages(images).forEach(({ image, variant }, idx) => {
    const lightboxIndex = registerLightboxItem(image, ARCHIVE_LABEL);
    const card = createImageCard(image, ARCHIVE_LABEL, false, idx, lightboxIndex);
    card.classList.add('archive-card', variant);
    layout.appendChild(card);
  });

  layout.addEventListener('click', event => {
    const card = event.target.closest('.img-card');
    if (!card || !layout.contains(card)) {
      return;
    }

    openLightbox(Number(card.dataset.lightboxIndex));
  });

  return layout;
}

function buildArchiveLayoutImages(images) {
  return images
    .map((image, index) => {
      const seed = hashString(`${image.viewSrc}|${image.width ?? 0}|${image.height ?? 0}|${index}`);

      return {
        image,
        order: seed,
        variant: getArchiveCardVariant(image, seed),
      };
    })
    .sort((a, b) => a.order - b.order);
}

function getArchiveCardVariant(image, seed) {
  const hasDimensions = Number.isFinite(image.width) && Number.isFinite(image.height) && image.width > 0 && image.height > 0;
  const aspectRatio = hasDimensions ? image.width / image.height : 1;

  if (aspectRatio >= 2.1) {
    return 'archive-card--panorama';
  }

  if (aspectRatio >= 1.45) {
    return seed % 5 === 0 ? 'archive-card--standard' : 'archive-card--compact';
  }

  if (aspectRatio <= 0.82) {
    return seed % 2 === 0 ? 'archive-card--feature' : 'archive-card--standard';
  }

  return ['archive-card--standard', 'archive-card--feature', 'archive-card--compact'][seed % 3];
}

function hashString(value) {
  let hash = 2166136261;

  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function registerLightboxItem(image, label) {
  return lightboxItems.push({
    src: image.viewSrc,
    label,
    metadata: image.metadata,
  }) - 1;
}

function createImageCard(image, label, prioritizeImage, index, lightboxIndex) {
  const card = document.createElement('div');
  card.className = 'img-card';
  card.dataset.date = label;
  card.dataset.lightboxIndex = String(lightboxIndex);
  card.style.animationDelay = `${index * 0.07}s`;
  const hasDimensions = Number.isFinite(image.width) && Number.isFinite(image.height) && image.width > 0 && image.height > 0;

  if (hasDimensions) {
    card.style.aspectRatio = `${image.width} / ${image.height}`;
  }

  const img = document.createElement('img');
  img.loading = prioritizeImage ? 'eager' : 'lazy';
  img.decoding = 'async';
  img.fetchPriority = prioritizeImage ? 'high' : 'low';
  img.alt = `Photo from ${label}`;
  attachImageLoadState(card, img);

  if (prioritizeImage || !hasDimensions) {
    hydrateImage(img, image.thumbSrc);
  } else {
    queueImageForLazyLoad(img, image.thumbSrc);
  }

  card.appendChild(img);
  return card;
}

function attachImageLoadState(card, img) {
  const markLoaded = () => card.classList.add('is-loaded');

  if (img.complete && img.naturalWidth > 0) {
    markLoaded();
    return;
  }

  img.addEventListener('load', markLoaded, { once: true });
}

function queueImageForLazyLoad(img, src) {
  img.dataset.src = src;

  const observer = getJournalImageObserver();
  if (!observer) {
    hydrateImage(img, src);
    return;
  }

  observer.observe(img);
}

function hydrateImage(img, src = img.dataset.src) {
  if (!src || img.dataset.loaded === 'true') {
    return;
  }

  img.src = src;
  img.dataset.loaded = 'true';
  delete img.dataset.src;
}

function getJournalImageObserver() {
  if (journalImageObserver || typeof window === 'undefined' || !('IntersectionObserver' in window)) {
    return journalImageObserver ?? null;
  }

  const rootMargin = window.matchMedia('(max-width: 720px)').matches
    ? '120px 0px 120px 0px'
    : '240px 0px 240px 0px';

  journalImageObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) {
        return;
      }

      const img = entry.target;
      hydrateImage(img);
      journalImageObserver.unobserve(img);
    });
  }, {
    rootMargin,
    threshold: 0.01,
  });

  return journalImageObserver;
}

function updateHeaderMeta(entries, archiveImageCount) {
  const metaElem = document.querySelector('.header-meta');
  if (!metaElem) return;

  const segments = [];

  if (entries.length) {
    const totalDays = entries.filter(entry => entry.kind === 'day').length;
    const uniqueMonths = new Set(entries.map(entry => `${entry.year}-${entry.monthNum}`));
    const numMonths = uniqueMonths.size;

    segments.push(`${numMonths} month${numMonths !== 1 ? 's' : ''}`);

    if (totalDays > 0) {
      segments.push(`${totalDays} day${totalDays !== 1 ? 's' : ''}`);
    }
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

function isLightboxOpen() {
  return lightbox.classList.contains('active');
}

function closeLightbox() {
  lightbox.classList.remove('active');
  setLightboxExifExpanded(false);
  activeLightboxIndex = -1;
}

function renderLightboxItem(item) {
  const image = document.createElement('img');
  image.src = item.src;
  image.alt = `Photo on ${item.label}`;
  image.loading = 'eager';
  image.decoding = 'async';

  lightboxWrap.replaceChildren(image);
  lightboxMeta.textContent = item.label;
  renderExifDetails(lightboxExif, item.metadata);
}

function openLightbox(index) {
  const item = lightboxItems[index];
  if (!item) return;

  activeLightboxIndex = index;
  renderLightboxItem(item);
  lightbox.classList.add('active');
}

function navigateLightbox(offset) {
  if (!isLightboxOpen() || lightboxItems.length === 0 || activeLightboxIndex < 0) {
    return;
  }

  const nextIndex = (activeLightboxIndex + offset + lightboxItems.length) % lightboxItems.length;
  activeLightboxIndex = nextIndex;
  renderLightboxItem(lightboxItems[nextIndex]);
}

document.getElementById('lb-close').addEventListener('click', closeLightbox);
lightboxInfoToggle.addEventListener('click', () => {
  setLightboxExifExpanded(lightboxInfoToggle.getAttribute('aria-expanded') !== 'true');
});
lightbox.addEventListener('click', e => {
  if (e.target === lightbox) closeLightbox();
});
document.addEventListener('keydown', e => {
  if (!isLightboxOpen()) {
    return;
  }

  if (e.key === 'Escape') {
    closeLightbox();
    return;
  }

  if (e.key === 'ArrowLeft') {
    e.preventDefault();
    navigateLightbox(-1);
    return;
  }

  if (e.key === 'ArrowRight') {
    e.preventDefault();
    navigateLightbox(1);
  }
});

/* ── Build data using Vite's import.meta.glob ── */
function initData() {
  // Discover optimized image derivatives while preserving the date-based folder flow.
  const thumbs = import.meta.glob('../data/.generated/v1/**/*--thumb.webp', { eager: true, import: 'default' });
  const views = import.meta.glob('../data/.generated/v1/**/*--view.webp', { eager: true, import: 'default' });
  const journalEntries = new Map();
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
      metadata: entry.metadata ?? null,
      width: Number.isFinite(entry.width) ? entry.width : null,
      height: Number.isFinite(entry.height) ? entry.height : null,
    };

    if (entry.kind === 'dated' && entry.date) {
      const datedKey = `day:${entry.date}`;

      if (!journalEntries.has(datedKey)) {
        journalEntries.set(datedKey, createDayEntry(entry.date, entry.year, entry.month, entry.day));
      }

      journalEntries.get(datedKey).images.push(image);
      continue;
    }

    if (entry.kind === 'monthly' && entry.year && entry.month) {
      const monthlyKey = `month:${entry.year}-${entry.month}`;

      if (!journalEntries.has(monthlyKey)) {
        journalEntries.set(monthlyKey, createMonthEntry(entry.year, entry.month));
      }

      journalEntries.get(monthlyKey).images.push(image);

      continue;
    }

    if (entry.kind === 'archive') {
      archiveImages.push(image);
    }
  }

  const sortedEntries = Array.from(journalEntries.values()).sort((a, b) => b.sortKey.localeCompare(a.sortKey));
  return {
    entries: sortedEntries,
    archive: {
      label: ARCHIVE_LABEL,
      images: archiveImages
    }
  };
}

function createDayEntry(dateStr, year, month, day) {
  const d = new Date(Number(year), Number(month) - 1, Number(day));
  const monthShort = d.toLocaleString('en-GB', { month: 'short' }).toUpperCase();
  const monthLabel = d.toLocaleString('en-GB', { month: 'long' }).toUpperCase();

  return {
    kind: 'day',
    sortKey: dateStr,
    date: dateStr,
    year,
    monthNum: month,
    dayNum: day,
    label: `${day} ${monthShort} ${year}`,
    monthShort,
    monthLabel: `${monthLabel} ${year}`,
    images: []
  };
}

function createMonthEntry(year, month) {
  const d = new Date(Number(year), Number(month) - 1, 1);
  const monthLong = d.toLocaleString('en-GB', { month: 'long' });

  return {
    kind: 'month',
    sortKey: `${year}-${month}-00`,
    year,
    monthNum: month,
    label: `${monthLong} ${year}`,
    monthLabel: `${monthLong.toUpperCase()} ${year}`,
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

function setupImageStripInteractions(strip) {
  let isPointerDown = false;
  let activePointerId = null;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let pointerDownCard = null;
  let movedDuringPointer = false;

  const DRAG_THRESHOLD = 6;

  strip.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }

    isPointerDown = true;
    activePointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    startLeft = strip.scrollLeft;
    pointerDownCard = event.target.closest('.img-card');
    movedDuringPointer = false;
    strip.classList.add('is-dragging');
    strip.setPointerCapture?.(event.pointerId);
  });

  strip.addEventListener('pointermove', event => {
    if (!isPointerDown || event.pointerId !== activePointerId) {
      return;
    }

    if (
      Math.abs(event.clientX - startX) > DRAG_THRESHOLD
      || Math.abs(event.clientY - startY) > DRAG_THRESHOLD
    ) {
      movedDuringPointer = true;
    }

    strip.scrollLeft = startLeft - (event.clientX - startX);
  });

  const stopDragging = event => {
    if (!isPointerDown || (event && event.pointerId !== activePointerId)) {
      return;
    }

    if (activePointerId !== null && strip.hasPointerCapture?.(activePointerId)) {
      strip.releasePointerCapture(activePointerId);
    }

    isPointerDown = false;
    activePointerId = null;
    strip.classList.remove('is-dragging');
  };

  strip.addEventListener('pointerup', event => {
    const card = pointerDownCard;
    const shouldOpen = !movedDuringPointer && card?.dataset.lightboxIndex;

    stopDragging(event);
    pointerDownCard = null;
    movedDuringPointer = false;

    if (shouldOpen) {
      openLightbox(Number(card.dataset.lightboxIndex));
    }
  });
  strip.addEventListener('pointercancel', event => {
    stopDragging(event);
    pointerDownCard = null;
    movedDuringPointer = false;
  });

  strip.addEventListener('wheel', event => {
    const hasHorizontalOverflow = strip.scrollWidth > strip.clientWidth;
    const wantsHorizontalScroll = event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY);

    if (!hasHorizontalOverflow || !wantsHorizontalScroll) {
      return;
    }

    event.preventDefault();
    strip.scrollLeft += event.deltaX || event.deltaY;
  }, { passive: false });
}

/* ── Bootstrap ── */
document.addEventListener('DOMContentLoaded', () => {
  initThemeToggle();

  const finalData = initData();
  renderJournal(finalData);

  document.querySelectorAll('.images-strip').forEach(strip => {
    setupImageStripInteractions(strip);
  });
});
