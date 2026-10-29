#!/usr/bin/env node
'use strict';

// Deterministic, dependency-free static renderer. Only owner-approved live records
// can create public HTML or sitemap entries. Draft preview is intentionally absent.
const fs = require('node:fs');
const path = require('node:path');
const { safeRelativePath, validateAgainstSchema } = require('./validate-content');

const ROOT = path.resolve(__dirname, '..');
const GENERATED_MARKER = '<!-- generated-by: scripts/build-content-pages.js; do not edit -->';
const SITEMAP_BEGIN = '<!-- BEGIN generated content URLs: scripts/build-content-pages.js -->';
const SITEMAP_END = '<!-- END generated content URLs -->';
const TYPES = Object.freeze([
  { key: 'tour', schema: 'tour.schema.json', title: 'Jaisalmer Experiences', intro: 'Explore available experiences and confirm current arrangements directly before planning.' },
  { key: 'blog', schema: 'blog.schema.json', title: 'Jaisalmer Travel Guides', intro: 'Practical, source-backed guides for planning time in Jaisalmer.' },
]);

function fail(message) {
  throw new Error(message);
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeJsonForHtml(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function resolveInside(root, relative, label) {
  if (!safeRelativePath(relative)) fail(label + ' is not a safe repository-relative path: ' + relative);
  const absoluteRoot = path.resolve(root);
  const absolute = path.resolve(absoluteRoot, relative);
  const fromRoot = path.relative(absoluteRoot, absolute);
  if (!fromRoot || fromRoot === '..' || fromRoot.startsWith('..' + path.sep) || path.isAbsolute(fromRoot)) {
    fail(label + ' escapes the repository root: ' + relative);
  }
  return absolute;
}

function readJson(root, relative) {
  const file = resolveInside(root, relative, 'JSON path');
  let stat;
  try { stat = fs.lstatSync(file); } catch (_) { fail('Missing JSON file: ' + relative); }
  if (!stat.isFile() || stat.isSymbolicLink()) fail('JSON path is not a regular file: ' + relative);
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { fail('Invalid JSON in ' + relative + ': ' + error.message); }
}

function listJsonFiles(root, relativeDirectory) {
  const directory = resolveInside(root, relativeDirectory, 'Record directory');
  let stat;
  try { stat = fs.lstatSync(directory); } catch (_) { fail('Missing record directory: ' + relativeDirectory); }
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail('Record directory is not a real directory: ' + relativeDirectory);
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
    .map(entry => entry.name)
    .sort();
}

function readRecords(root, registry, type) {
  const config = registry.contentTypes && registry.contentTypes[type.key];
  if (!config || !safeRelativePath(config.recordDirectory) || !safeRelativePath(config.outputDirectory) || !/^[a-z0-9-]+$/.test(config.outputDirectory) || config.outputExtension !== '.html') {
    fail('Unsafe or unsupported registry configuration for ' + type.key);
  }
  const schema = readJson(root, path.posix.join('content/schemas', type.schema));
  const records = [];
  const seen = new Set();
  for (const filename of listJsonFiles(root, config.recordDirectory)) {
    const relative = path.posix.join(config.recordDirectory, filename);
    const record = readJson(root, relative);
    const findings = validateAgainstSchema(schema, record, relative);
    if (findings.length) fail('Schema validation failed for ' + relative + ': ' + findings.map(item => item.path + ' ' + item.message).join('; '));
    if (typeof record.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(record.slug)) fail('Invalid slug in ' + relative);
    if (filename !== record.slug + '.json') fail('Filename must match slug: ' + relative);
    if (seen.has(record.slug)) fail('Duplicate ' + type.key + ' slug: ' + record.slug);
    seen.add(record.slug);
    records.push({ type: type.key, config, record, sourcePath: relative });
  }
  return records;
}

function validateHttpsUrl(value, label, allowedHosts) {
  let url;
  try { url = new URL(value); } catch (_) { fail(label + ' must be an absolute HTTPS URL'); }
  if (url.protocol !== 'https:' || url.username || url.password) fail(label + ' must use HTTPS and contain no credentials');
  if (allowedHosts && !allowedHosts.includes(url.hostname.toLowerCase())) fail(label + ' uses an unsupported host');
  return url;
}

function canonicalOrigin(siteConfig, hasPublishedRecords) {
  const site = siteConfig.site || {};
  if (!hasPublishedRecords) return null;
  if (site.canonicalHostApproved !== true) fail('Publishing is blocked: content/site-config.json must explicitly approve the canonical host');
  const url = validateHttpsUrl(site.newStaticSiteCanonicalHost, 'Canonical host');
  if (url.pathname !== '/' || url.search || url.hash) fail('Canonical host must be an HTTPS origin without a path, query or fragment');
  return url.origin;
}

function verifiedCta(type, record, siteConfig) {
  const cta = type === 'tour' ? record.enquiry : record.enquiryCta;
  if (!cta || typeof cta.mode !== 'string') fail('Live record is missing an enquiry mode: ' + record.slug);
  const contact = siteConfig.contact || {};
  const booking = siteConfig.booking || {};
  const subject = 'Question about ' + record.title;
  if (cta.mode === 'whatsapp') {
    if (contact.status !== 'verified') fail('Publishing is blocked: WhatsApp contact endpoint is not verified for ' + record.slug);
    const url = validateHttpsUrl(contact.whatsappBaseUrl, 'WhatsApp endpoint', ['wa.me', 'api.whatsapp.com']);
    const validWhatsAppPath = url.hostname.toLowerCase() === 'wa.me'
      ? /^\/\d{8,15}\/?$/.test(url.pathname)
      : url.pathname === '/send' && /^\d{8,15}$/.test(url.searchParams.get('phone') || '');
    if (!validWhatsAppPath) fail('WhatsApp endpoint must include a valid phone number path/query');
    url.searchParams.set('text', 'Namaste Garh Jaisal Haveli, please share the current details for ' + record.title + '. I understand this is an enquiry, not a confirmed booking.');
    return { href: url.toString(), label: cta.label, external: true };
  }
  if (cta.mode === 'booking_gateway') {
    if (booking.status !== 'verified') fail('Publishing is blocked: booking gateway is not verified for ' + record.slug);
    const url = validateHttpsUrl(booking.legacyBookingEngineUrl, 'Booking gateway');
    return { href: url.toString(), label: cta.label || booking.primaryLabel || 'Check availability', external: true };
  }
  if (cta.mode === 'contact') {
    if (contact.status !== 'verified' || typeof contact.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) {
      fail('Publishing is blocked: a verified contact email is required for ' + record.slug);
    }
    return { href: 'mailto:' + contact.email + '?subject=' + encodeURIComponent(subject), label: cta.label, external: false };
  }
  fail('Unsupported enquiry mode for ' + record.slug + ': ' + cta.mode);
}

function walkAssetPaths(value, root, location) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => walkAssetPaths(entry, root, location + '[' + index + ']'));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    const at = location + '.' + key;
    if (['image', 'src', 'heroImage', 'ogImage'].includes(key) && typeof child === 'string' && child.startsWith('assets/')) {
      const file = resolveInside(root, child, 'Asset path');
      let stat;
      try { stat = fs.lstatSync(file); } catch (_) { fail('Referenced asset is missing at ' + at + ': ' + child); }
      if (!stat.isFile() || stat.isSymbolicLink()) fail('Referenced asset must be a regular file at ' + at + ': ' + child);
    } else {
      walkAssetPaths(child, root, at);
    }
  }
}


function validateApprovedBlogMedia(record, sourcePath, root) {
  const media = record.media || {};
  const sourceEvidenceIssues = require('./validate-content').mediaSourceEvidenceIssues;
  const candidates = Array.isArray(media.candidates) ? media.candidates.filter(item => item && typeof item === 'object' && !Array.isArray(item)) : [];
  const approved = Array.isArray(media.approvedAssets) ? media.approvedAssets.filter(item => item && typeof item === 'object' && !Array.isArray(item)) : [];
  if (approved.length !== 2) fail('Live article must have exactly two approved media-role records: ' + sourcePath);

  const mediaAudit = require('./audit-editorial-media-readiness');
  const policy = mediaAudit.imagePolicy(root);
  const roles = [
    ['hero', record.heroImage, record.heroAlt],
    ['socialPreview', record.seo && record.seo.ogImage, record.seo && record.seo.ogAlt],
  ];
  const selected = roles.map(([role, imagePath, alt]) => {
    const asset = approved.find(item => item.role === role);
    if (!asset) fail('Live article requires approved ' + role + ' media evidence: ' + sourcePath);
    if (asset.path !== imagePath || asset.alt !== alt) fail('Live article ' + role + ' metadata must match approved path and alt text: ' + sourcePath);
    if (!String(asset.approvedBy || '').trim() || !isValidDate(asset.approvedAt) || !String(asset.rightsEvidence || '').trim()) {
      fail('Live article ' + role + ' requires reviewer, approval date and rights evidence: ' + sourcePath);
    }
    const candidate = candidates.find(item => {
      const visual = item.visualReview || {};
      return item.path === asset.path && item.role === role
        && item.reviewStatus === 'approved'
        && visual.status === 'matched'
        && typeof visual.evidence === 'string' && visual.evidence.trim().length >= 10
        && typeof visual.reviewer === 'string' && visual.reviewer.trim().length >= 2
        && isValidDate(visual.reviewedAt)
        && ['owner-confirmed', 'licensed'].includes(item.rightsStatus)
        && sourceEvidenceIssues(item).length === 0
        && item.sourceEvidence.evidenceReference === asset.rightsEvidence;
    });
    if (!candidate) fail('Live article ' + role + ' must reference a candidate with documented visual match and resolved rights: ' + sourcePath);
    const info = mediaAudit.imageInfo(root, asset.path, policy);
    return { role, asset, info };
  });
  const decoded = mediaAudit.verifyImageDecode(root, selected.map(item => item.info));
  for (const item of selected) {
    const result = decoded.get(item.asset.path);
    const technical = mediaAudit.validateForRole({ ...item.info, decodeStatus: result && result.status }, item.role, policy);
    if (!technical.valid) fail('Live article ' + item.role + ' failed technical media checks: ' + sourcePath + ' (' + technical.errors.join('; ') + ')');
  }
}
function validateLiveRecord(item, root, siteConfig) {
  const { type, record, sourcePath } = item;
  if (record.status !== 'live') return;
  if (record.seo && record.seo.ogImage
      && (typeof record.seo.ogAlt !== 'string' || record.seo.ogAlt.trim().length < 5)) {
    fail('seo.ogImage requires meaningful seo.ogAlt text: ' + sourcePath);
  }
  if (type === 'tour') {
    if (record.factsConfirmed !== true) fail('Live tour requires factsConfirmed: true: ' + sourcePath);
    if (!isValidDate(record.lastVerified)) fail('Live tour requires a valid lastVerified date: ' + sourcePath);
    if (!Array.isArray(record.factSources) || record.factSources.length === 0) fail('Live tour requires at least one verified factSources entry: ' + sourcePath);
    for (const source of record.factSources) {
      if (!isValidDate(source.verifiedOn) || !String(source.verifiedBy || '').trim() || !String(source.source || '').trim()) {
        fail('Every live tour fact source requires source, verifiedOn and verifiedBy: ' + sourcePath);
      }
    }
  }
  if (type === 'blog' && !isValidDate(record.lastReviewed)) fail('Live article requires a valid lastReviewed date: ' + sourcePath);
  if (type === 'blog') {
    const review = record.editorialReview || {};
    const requiredApprovals = ['editorialStatus', 'sourceStatus', 'factStatus', 'mediaStatus'];
    const missingApprovals = requiredApprovals.filter(field => review[field] !== 'approved');
    if (missingApprovals.length || review.ownerFactApproved !== true) {
      fail('Live article requires approved editorial/source/fact/media review and owner fact approval: '
        + sourcePath + ' (' + missingApprovals.concat(review.ownerFactApproved === true ? [] : ['ownerFactApproved']).join(', ') + ')');
    }
    if (!isValidDate(review.reviewedAt) || typeof review.reviewer !== 'string' || review.reviewer.trim().length < 2) {
      fail('Live article requires a valid editorial review date and named reviewer: ' + sourcePath);
    }
    if (typeof record.heroCaption !== 'string'
        || record.heroCaption.trim().length < 20
        || record.heroCaption.trim().length > 180) {
      fail('Live article requires a reviewed hero caption between 20 and 180 characters: ' + sourcePath);
    }
    const captionReview = record.heroCaptionReview || {};
    if (captionReview.status !== 'approved'
        || typeof captionReview.reviewer !== 'string'
        || captionReview.reviewer.trim().length < 2
        || !isValidDate(captionReview.reviewedAt)
        || typeof captionReview.evidenceReference !== 'string'
        || captionReview.evidenceReference.trim().length < 8) {
      fail('Live article requires approved hero-caption review metadata with a named reviewer, valid date and evidence reference: ' + sourcePath);
    }
    if (!record.heroImage || typeof record.heroAlt !== 'string' || record.heroAlt.trim().length < 5
        || !record.seo || !record.seo.ogImage || typeof record.seo.ogAlt !== 'string' || record.seo.ogAlt.trim().length < 5) {
      fail('Live article requires hero and OG image assets with meaningful alt text: ' + sourcePath);
    }
    validateApprovedBlogMedia(record, sourcePath, root);
  }
  if (record.publishedAt != null && !isValidDate(record.publishedAt)) fail('publishedAt must be a real YYYY-MM-DD date: ' + sourcePath);
  walkAssetPaths(record, root, sourcePath);
  item.cta = verifiedCta(type, record, siteConfig);
}

function xmlEscape(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function xmlUnescape(value) {
  return value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

function stripGeneratedSitemapBlock(xml) {
  const beginCount = xml.split(SITEMAP_BEGIN).length - 1;
  const endCount = xml.split(SITEMAP_END).length - 1;
  if (beginCount === 0 && endCount === 0) return xml;
  if (beginCount !== 1 || endCount !== 1) fail('sitemap.xml contains malformed or duplicate generated-content markers');
  const start = xml.indexOf(SITEMAP_BEGIN);
  const end = xml.indexOf(SITEMAP_END);
  if (end < start) fail('sitemap.xml generated-content markers are out of order');
  return xml.slice(0, start) + xml.slice(end + SITEMAP_END.length);
}

function renderSitemap(original, urls, origin) {
  let xml = stripGeneratedSitemapBlock(original);
  if (!/<urlset\b/.test(xml) || !/<\/urlset>/.test(xml)) fail('sitemap.xml must contain a valid urlset root');
  const existing = [...xml.matchAll(/<loc>\s*([\s\S]*?)\s*<\/loc>/g)].map(match => xmlUnescape(match[1].trim()));
  if (urls.length) {
    for (const value of existing) {
      let url;
      try { url = new URL(value); } catch (_) { fail('sitemap.xml contains an invalid absolute URL: ' + value); }
      if (url.origin !== origin) fail('Existing sitemap origin differs from the approved canonical host: ' + value);
    }
  }
  const existingSet = new Set(existing);
  const uniqueUrls = [...new Set(urls)].filter(url => !existingSet.has(url)).sort();
  if (!uniqueUrls.length) {
    // An already-empty owned block is the canonical pre-launch representation.
    // Returning it unchanged keeps --check idempotent and avoids duplicate markers.
    const begin = original.indexOf(SITEMAP_BEGIN);
    const end = original.indexOf(SITEMAP_END);
    if (begin >= 0 && end > begin && !/<loc\b/i.test(original.slice(begin, end))) return original;
    // Remove any prior generated URLs and leave one empty owned block.
    const emptyBlock = ['  ' + SITEMAP_BEGIN, '  ' + SITEMAP_END].join('\n');
    return xml.replace(/\s*<\/urlset>/, '\n' + emptyBlock + '\n</urlset>');
  }
  const block = [
    '  ' + SITEMAP_BEGIN,
    ...uniqueUrls.map(url => '  <url><loc>' + xmlEscape(url) + '</loc></url>'),
    '  ' + SITEMAP_END,
  ].join('\n');
  return xml.replace(/\s*<\/urlset>/, '\n' + block + '\n</urlset>');
}

function rootLink(file) { return '../' + file; }

const imageMetadataCache = new Map();
function localImageMetadata(root, relative) {
  if (typeof relative !== 'string' || !safeRelativePath(relative) || !relative.startsWith('assets/images/')) return null;
  const key = path.resolve(root) + '\\0' + relative;
  if (imageMetadataCache.has(key)) return imageMetadataCache.get(key);
  const mediaAudit = require('./audit-editorial-media-readiness');
  const policy = mediaAudit.imagePolicy(root);
  const image = mediaAudit.imageInfo(root, relative, policy);
  const metadata = image.exists && image.safe && Number.isInteger(image.width) && image.width > 0
    && Number.isInteger(image.height) && image.height > 0
    ? { width: image.width, height: image.height, type: 'image/' + image.format }
    : null;
  imageMetadataCache.set(key, metadata);
  return metadata;
}

function renderLocalImage(root, relative, alt, options = {}) {
  const metadata = localImageMetadata(root, relative);
  if (!metadata) fail('Cannot render an image without a safe local path and intrinsic dimensions: ' + relative);
  const classAttribute = options.className ? ' class="' + escapeHtml(options.className) + '"' : '';
  const priorityAttributes = options.priority ? ' loading="eager" fetchpriority="high"' : ' loading="lazy"';
  return '<img' + classAttribute + ' src="' + escapeHtml(rootLink(relative)) + '" alt="' + escapeHtml(alt) + '"'
    + ' width="' + metadata.width + '" height="' + metadata.height + '"'
    + priorityAttributes + ' decoding="async">';
}

function navLink(href, label, active) {
  return '<a' + (active ? ' class="is-active" aria-current="page"' : '') + ' href="' + escapeHtml(href) + '">' + escapeHtml(label) + '</a>';
}

function renderHeader(type, publishedByType) {
  const tourDirectory = publishedByType.tour[0] ? publishedByType.tour[0].config.outputDirectory : 'tours';
  const blogDirectory = publishedByType.blog[0] ? publishedByType.blog[0].config.outputDirectory : 'blogs';
  const tourHref = publishedByType.tour.length ? (type === 'tour' ? 'index.html' : '../' + tourDirectory + '/index.html') : null;
  const blogHref = publishedByType.blog.length ? (type === 'blog' ? 'index.html' : '../' + blogDirectory + '/index.html') : null;
  return '<a class="skip-link" href="#main">Skip to content</a>' +
    '<div class="announcement"><span class="announcement__dot" aria-hidden="true"></span> A heritage haveli inside the living Jaisalmer Fort <span class="announcement__divider" aria-hidden="true">/</span><a href="' + rootLink('directions.html') + '">Plan your arrival ↗</a></div>' +
    '<header class="site-header" data-header><a class="brand" href="' + rootLink('index.html') + '" aria-label="Garh Jaisal Haveli home"><span class="brand__mark">GJ</span><span class="brand__wordmark"><strong>GARH JAISAL</strong><small>HAVELI · JAISALMER</small></span></a>' +
    '<button class="menu-toggle" type="button" aria-expanded="false" aria-controls="primary-navigation" aria-label="Open navigation"><span></span><span></span></button>' +
    '<nav id="primary-navigation" class="primary-nav" aria-label="Primary navigation">' +
    navLink(rootLink('index.html'), 'Stay', false) + navLink(rootLink('rooms.html'), 'Rooms', false) + navLink(rootLink('experiences.html'), 'Experiences', false) +
    navLink(rootLink('dining.html'), 'Dining', false) + navLink(rootLink('about.html'), 'Our story', false) + navLink(rootLink('directions.html'), 'Find us', false) +
    (tourHref ? navLink(tourHref, 'Tours', type === 'tour') : '') +
    (blogHref ? navLink(blogHref, 'Guides', type === 'blog') : '') +
    '</nav></header>';
}

function renderFooter() {
  return '<footer class="site-footer"><div class="site-footer__main wrap"><div class="footer-brand"><a class="brand brand--footer" href="' + rootLink('index.html') + '"><span class="brand__mark">GJ</span><span class="brand__wordmark"><strong>GARH JAISAL</strong><small>HAVELI · JAISALMER</small></span></a><p>A family-run heritage stay inside the historic walls of Jaisalmer Fort. Rooted in the Golden City, open to the world.</p></div><div class="footer-column"><h2>Explore</h2><a href="' + rootLink('rooms.html') + '">Rooms</a><a href="' + rootLink('experiences.html') + '">Experiences</a><a href="' + rootLink('dining.html') + '">Rooftop dining</a><a href="' + rootLink('about.html') + '">Our story</a></div><div class="footer-column"><h2>Plan your visit</h2><a href="' + rootLink('directions.html') + '">Getting here</a><p>Ask the hotel to confirm current arrangements before you travel.</p></div><div class="footer-address"><h2>Find the haveli</h2><p>Kotari Para, inside Jaisalmer Fort<br>Jaisalmer, Rajasthan 345001, India</p><a href="' + rootLink('directions.html') + '" class="text-link text-link--light">Arrival information →</a></div></div><div class="site-footer__bottom wrap"><span>© <span data-current-year>2026</span> Garh Jaisal Haveli</span><span>Made with a sense of place in Jaisalmer, Rajasthan.</span><a href="#main">Back to top ↑</a></div></footer>';
}

function renderShell({ type, title, description, canonical, image, imagePath, preloadImagePath, imageAlt, body, publishedByType, schema, root = ROOT }) {
  const isBlog = type === 'blog';
  const resolvedImageAlt = image ? String(imageAlt || title).trim() : '';
  const socialMetadata = imagePath ? localImageMetadata(root, imagePath) : null;
  const imageProperties = socialMetadata
    ? '<meta property="og:image:type" content="' + socialMetadata.type + '"><meta property="og:image:width" content="' + socialMetadata.width + '"><meta property="og:image:height" content="' + socialMetadata.height + '">'
    : '';
  const imageTag = image ? '<meta property="og:image" content="' + escapeHtml(image) + '"><meta property="og:image:alt" content="' + escapeHtml(resolvedImageAlt) + '">' + imageProperties : '';
  const preloadMetadata = preloadImagePath ? localImageMetadata(root, preloadImagePath) : null;
  const imagePreloadTag = preloadImagePath && preloadMetadata
    ? '<link rel="preload" as="image" href="' + escapeHtml(rootLink(preloadImagePath)) + '" type="' + preloadMetadata.type + '" fetchpriority="high">'
    : '';
  const twitterImageTag = image ? '<meta name="twitter:image" content="' + escapeHtml(image) + '"><meta name="twitter:image:alt" content="' + escapeHtml(resolvedImageAlt) + '">' : '';
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': isBlog ? 'Article' : 'WebPage',
    name: title,
    headline: title,
    description,
    url: canonical,
    inLanguage: 'en',
    publisher: { '@type': 'Organization', name: 'Garh Jaisal Haveli', url: new URL(canonical).origin },
  };
  if (isBlog && schema.publishedAt) jsonLd.datePublished = schema.publishedAt;
  if (isBlog && schema.lastReviewed) jsonLd.dateModified = schema.lastReviewed;
  const head = '<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#171b19">' +
    '<title>' + escapeHtml(title) + '</title><meta name="description" content="' + escapeHtml(description) + '"><link rel="canonical" href="' + escapeHtml(canonical) + '">' + imagePreloadTag +
    '<meta property="og:type" content="' + (isBlog ? 'article' : 'website') + '"><meta property="og:site_name" content="Garh Jaisal Haveli"><meta property="og:title" content="' + escapeHtml(title) + '"><meta property="og:description" content="' + escapeHtml(description) + '"><meta property="og:url" content="' + escapeHtml(canonical) + '">' + imageTag +
    '<meta name="twitter:card" content="' + (image ? 'summary_large_image' : 'summary') + '"><meta name="twitter:title" content="' + escapeHtml(title) + '"><meta name="twitter:description" content="' + escapeHtml(description) + '">' + twitterImageTag +
    '<link rel="icon" href="' + rootLink('favicon.svg') + '" type="image/svg+xml"><link rel="stylesheet" href="' + rootLink('assets/site.css') + '"><link rel="stylesheet" href="' + rootLink('assets/css/content-pages.css') + '"><link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@400;500;600;700&display=swap" rel="stylesheet"><script type="application/ld+json">' + safeJsonForHtml(jsonLd) + '</script></head><body>';
  return '<!doctype html>\n' + GENERATED_MARKER + '\n' + head + renderHeader(type, publishedByType) + '<main id="main">' + body + '</main>' + renderFooter() + '<script src="' + rootLink('assets/site.js') + '" defer></script></body></html>\n';
}

function renderList(items, emptyText) {
  if (!items || !items.length) return '<p class="content-page__muted">' + escapeHtml(emptyText) + '</p>';
  return '<ul>' + items.map(item => '<li>' + escapeHtml(item) + '</li>').join('') + '</ul>';
}

function renderRelated(record, allPublished) {
  const requested = [
    ...(record.relatedTours || []).map(slug => ({ type: 'tour', slug })),
    ...(record.relatedBlogs || []).map(slug => ({ type: 'blog', slug })),
  ];
  const available = requested.map(item => {
    const found = allPublished.find(entry => entry.type === item.type && entry.record.slug === item.slug);
    if (!found) return null;
    const href = '../' + found.config.outputDirectory + '/' + found.record.slug + '.html';
    return '<li><a href="' + escapeHtml(href) + '">' + escapeHtml(found.record.title) + '</a></li>';
  }).filter(Boolean);
  if (!available.length) return '';
  return '<section class="content-page__section" aria-labelledby="related-title"><h2 id="related-title">Related reading and experiences</h2><ul class="content-page__related">' + available.join('') + '</ul></section>';
}

function renderCta(cta) {
  return '<section class="content-page__cta" aria-labelledby="enquiry-title"><div><p class="eyebrow">Plan with confidence</p><h2 id="enquiry-title">Have a question?</h2><p>Ask about the current details for your dates. An enquiry is not a confirmed reservation.</p></div><a class="button button--gold" href="' + escapeHtml(cta.href) + '"' + (cta.external ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' + escapeHtml(cta.label || 'Ask a question') + ' <span aria-hidden="true">↗</span></a></section>';
}

function renderTour(item, allPublished, origin, publishedByType, root = ROOT) {
  const r = item.record;
  const route = item.config.outputDirectory + '/' + r.slug + item.config.outputExtension;
  const canonical = origin + '/' + route;
  const image = r.seo.ogImage ? origin + '/' + r.seo.ogImage : null;
  const facts = [];
  if (r.duration) facts.push(['Duration', r.duration]);
  if (typeof r.overnight === 'boolean') facts.push(['Overnight', r.overnight ? 'Yes' : 'No']);
  if (r.transport) facts.push(['Transport', r.transport]);
  if (r.startingPoint) facts.push(['Starting point', r.startingPoint]);
  const factsHtml = facts.length ? '<dl class="content-page__facts">' + facts.map(([label, value]) => '<div><dt>' + escapeHtml(label) + '</dt><dd>' + escapeHtml(value) + '</dd></div>').join('') + '</dl>' : '';
  const timeline = '<ol class="content-page__timeline">' + r.timeline.map(step => '<li><span class="content-page__step">' + String(step.step).padStart(2, '0') + '</span><div>' + (step.timeOfDay ? '<p class="content-page__time">' + escapeHtml(step.timeOfDay) + '</p>' : '') + '<h3>' + escapeHtml(step.title) + '</h3><p>' + escapeHtml(step.description) + '</p>' + (step.image ? renderLocalImage(root, step.image, step.imageAlt || step.title) : '') + '</div></li>').join('') + '</ol>';
  const faqs = (r.faqs || []).length ? '<section class="content-page__section" aria-labelledby="faq-title"><h2 id="faq-title">Questions to ask before you go</h2><div data-accordion>' + r.faqs.map((faq, index) => '<details' + (index === 0 ? ' open' : '') + '><summary>' + escapeHtml(faq.question) + '</summary><p>' + escapeHtml(faq.answer) + '</p></details>').join('') + '</div></section>' : '';
  const body = '<section class="page-hero content-page__hero"><div class="wrap"><p class="eyebrow">' + escapeHtml(r.eyebrow || 'Jaisalmer experience') + '</p><h1 class="display-title">' + escapeHtml(r.title) + '</h1><p class="lead">' + escapeHtml(r.summary) + '</p></div></section>' +
    '<div class="section content-page wrap"><div class="content-page__intro">' + (r.bestFor ? '<p>' + escapeHtml(r.bestFor) + '</p>' : '') + factsHtml + '</div>' +
    '<section class="content-page__section" aria-labelledby="itinerary-title"><h2 id="itinerary-title">The experience, step by step</h2>' + timeline + (r.timingNote ? '<p class="content-page__muted">' + escapeHtml(r.timingNote) + '</p>' : '') + '</section>' +
    '<div class="content-page__two-col"><section class="content-page__section" aria-labelledby="included-title"><h2 id="included-title">What is included</h2>' + renderList(r.included, 'Ask the hotel to confirm what is included for your date.') + '</section><section class="content-page__section" aria-labelledby="excluded-title"><h2 id="excluded-title">Not included</h2>' + renderList(r.notIncluded, 'Confirm exclusions with the operator before booking.') + '</section></div>' +
    ((r.practicalNotes || []).length ? '<section class="content-page__section" aria-labelledby="practical-title"><h2 id="practical-title">Practical notes</h2>' + renderList(r.practicalNotes, '') + '</section>' : '') + faqs + renderRelated(r, allPublished) + renderCta(item.cta) + '</div>';
  return { route, content: renderShell({ type: 'tour', title: r.seo.title, description: r.seo.description, canonical, image, imagePath: r.seo.ogImage, imageAlt: r.seo.ogAlt, body, publishedByType, schema: r, root }) };
}

function renderBlog(item, allPublished, origin, publishedByType, root = ROOT) {
  const r = item.record;
  const route = item.config.outputDirectory + '/' + r.slug + item.config.outputExtension;
  const canonical = origin + '/' + route;
  const imagePath = r.seo.ogImage || r.heroImage;
  const image = imagePath ? origin + '/' + imagePath : null;
  const imageAlt = image ? (r.seo.ogImage ? r.seo.ogAlt : r.heroAlt) : '';
  const sectionIds = new Set(r.sections.map(section => section.id));
  if (sectionIds.size !== r.sections.length) fail('Duplicate section IDs in ' + item.sourcePath);
  const toc = (r.tableOfContents || []).filter(entry => sectionIds.has(entry.id));
  if ((r.tableOfContents || []).some(entry => !sectionIds.has(entry.id))) fail('Table of contents references a missing section in ' + item.sourcePath);
  const tocHtml = toc.length ? '<nav class="content-page__toc" aria-label="On this page"><h2>On this page</h2><ol>' + toc.map(entry => '<li><a href="#' + escapeHtml(entry.id) + '">' + escapeHtml(entry.label) + '</a></li>').join('') + '</ol></nav>' : '';
  const sections = r.sections.map(section => '<section class="content-page__section" id="' + escapeHtml(section.id) + '"><h2>' + escapeHtml(section.heading) + '</h2>' + (section.image ? '<figure>' + renderLocalImage(root, section.image, section.imageAlt || section.heading) + '</figure>' : '') + (section.body || []).map(paragraph => '<p>' + escapeHtml(paragraph) + '</p>').join('') + '</section>').join('');
  const sources = '<section class="content-page__section" aria-labelledby="sources-title"><h2 id="sources-title">Sources and further reading</h2><ul class="content-page__sources">' + r.sources.map(source => '<li><a href="' + escapeHtml(source.url) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(source.label) + ' ↗</a></li>').join('') + '</ul></section>';
  const heroFigure = r.heroImage
    ? '<figure class="content-page__hero-figure">' + renderLocalImage(root, r.heroImage, r.heroAlt, { className: 'content-page__hero-image', priority: true })
      + '<figcaption class="content-page__hero-caption">' + escapeHtml(r.heroCaption) + '</figcaption></figure>'
    : '';
  const body = '<section class="page-hero content-page__hero"><div class="wrap"><p class="eyebrow">Jaisalmer travel guide</p><h1 class="display-title">' + escapeHtml(r.title) + '</h1><p class="lead">' + escapeHtml(r.lede) + '</p>' + heroFigure + '</div></section>' +
    '<div class="section content-page wrap">' + tocHtml + '<article class="content-page__article">' + sections + '</article>' + sources + renderRelated(r, allPublished) + renderCta(item.cta) + '</div>';
  return { route, content: renderShell({ type: 'blog', title: r.seo.title, description: r.seo.description, canonical, image, imagePath, preloadImagePath: r.heroImage, imageAlt, body, publishedByType, schema: r, root }) };
}

function renderHub(type, items, origin, publishedByType) {
  if (!items.length) return null;
  const isTour = type.key === 'tour';
  const outputDirectory = items[0].config.outputDirectory;
  const route = outputDirectory + '/index.html';
  const canonical = origin + '/' + outputDirectory + '/';
  const title = isTour ? 'Tours and Experiences in Jaisalmer' : 'Jaisalmer Travel Guides';
  const description = isTour
    ? 'Explore published Jaisalmer experiences and contact the hotel to confirm current routes, timings and inclusions.'
    : 'Read practical, source-backed guides to planning a visit to Jaisalmer, navigating the living fort, and choosing experiences to discuss with the hotel.';
  const cards = items.map(item => {
    const r = item.record;
    const intro = isTour ? r.summary : r.lede;
    return '<article class="content-page__card"><p class="eyebrow">' + (isTour ? 'Experience' : 'Travel guide') + '</p><h2><a href="' + escapeHtml(r.slug + '.html') + '">' + escapeHtml(r.title) + '</a></h2><p>' + escapeHtml(intro) + '</p><a class="text-link" href="' + escapeHtml(r.slug + '.html') + '">Read more <span aria-hidden="true">→</span></a></article>';
  }).join('');
  const body = '<section class="page-hero content-page__hero"><div class="wrap"><p class="eyebrow">' + (isTour ? 'Experiences, thoughtfully planned' : 'Notes for a better journey') + '</p><h1 class="display-title">' + escapeHtml(title) + '</h1><p class="lead">' + escapeHtml(type.intro) + '</p></div></section><section class="section content-page wrap"><div class="content-page__cards">' + cards + '</div></section>';
  return { route, content: renderShell({ type: type.key, title, description, canonical, image: null, body, publishedByType, schema: {} }) };
}

function collectGeneratedFiles(root, outputDirectories) {
  const files = [];
  for (const relativeDirectory of outputDirectories) {
    const directory = resolveInside(root, relativeDirectory, 'Output directory');
    if (!fs.existsSync(directory)) continue;
    const stat = fs.lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('Output directory is not a real directory: ' + relativeDirectory);
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.html')) continue;
      const relative = path.posix.join(relativeDirectory, entry.name);
      const file = resolveInside(root, relative, 'Generated output path');
      const contents = fs.readFileSync(file, 'utf8');
      if (contents.startsWith('<!doctype html>\n' + GENERATED_MARKER)) files.push(relative);
    }
  }
  return files.sort();
}

function buildContentPages(root = ROOT, options = {}) {
  root = path.resolve(root);
  const write = options.write === true;
  const registry = readJson(root, 'content/paths.json');
  const siteConfig = readJson(root, 'content/site-config.json');
  if (registry.schemaVersion !== 1 || !registry.site || registry.site.engine !== 'static-html') fail('Unsupported content registry version or engine');
  for (const shared of [registry.site.sharedStylesheet, registry.site.sharedScript, 'assets/css/content-pages.css', 'favicon.svg']) {
    const file = resolveInside(root, shared, 'Shared asset');
    let stat;
    try { stat = fs.lstatSync(file); } catch (_) { fail('Missing shared asset required by generated pages: ' + shared); }
    if (!stat.isFile() || stat.isSymbolicLink()) fail('Shared asset is not a regular file: ' + shared);
  }
  const records = TYPES.flatMap(type => readRecords(root, registry, type));
  const published = records.filter(item => item.record.status === 'live');
  for (const item of records) {
    if (item.record.status !== 'live') walkAssetPaths(item.record, root, item.sourcePath);
  }
  for (const item of published) validateLiveRecord(item, root, siteConfig);
  const origin = canonicalOrigin(siteConfig, published.length > 0);
  const publishedByType = Object.fromEntries(TYPES.map(type => [type.key, published.filter(item => item.type === type.key)]));
  const outputs = new Map();
  if (published.length) {
    for (const type of TYPES) {
      const items = publishedByType[type.key];
      if (!items.length) continue;
      const hub = renderHub(type, items, origin, publishedByType);
      outputs.set(hub.route, hub.content);
      for (const item of items) {
        const rendered = type.key === 'tour'
          ? renderTour(item, published, origin, publishedByType, root)
          : renderBlog(item, published, origin, publishedByType, root);
        outputs.set(rendered.route, rendered.content);
      }
    }
  }
  const sitemapPath = resolveInside(root, 'sitemap.xml', 'Sitemap path');
  const sitemapOriginal = fs.readFileSync(sitemapPath, 'utf8');
  const sitemapUrls = [];
  for (const type of TYPES) {
    if (!registry.contentTypes[type.key].sitemap) continue;
    if (publishedByType[type.key].length) sitemapUrls.push(origin + '/' + registry.contentTypes[type.key].outputDirectory + '/');
    for (const item of publishedByType[type.key]) sitemapUrls.push(origin + '/' + item.config.outputDirectory + '/' + item.record.slug + item.config.outputExtension);
  }
  const sitemap = renderSitemap(sitemapOriginal, sitemapUrls, origin);
  const outputDirectories = TYPES.map(type => registry.contentTypes[type.key].outputDirectory);
  const existingGenerated = collectGeneratedFiles(root, outputDirectories);
  for (const relative of outputs.keys()) {
    const file = resolveInside(root, relative, 'Generated output path');
    if (fs.existsSync(file) && !existingGenerated.includes(relative)) fail('Refusing to overwrite a non-generated page: ' + relative);
  }
  const stale = existingGenerated.filter(relative => !outputs.has(relative));
  const expectedFiles = [...outputs.keys()].sort();
  const mismatches = [];
  for (const [relative, content] of outputs) {
    const file = resolveInside(root, relative, 'Generated output path');
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== content) mismatches.push(relative);
  }
  if (fs.readFileSync(sitemapPath, 'utf8') !== sitemap) mismatches.push('sitemap.xml');
  mismatches.push(...stale.map(relative => 'stale generated file: ' + relative));

  if (write) {
    for (const relative of stale) fs.unlinkSync(resolveInside(root, relative, 'Stale generated output'));
    for (const [relative, content] of outputs) {
      const file = resolveInside(root, relative, 'Generated output path');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content, 'utf8');
    }
    if (fs.readFileSync(sitemapPath, 'utf8') !== sitemap) fs.writeFileSync(sitemapPath, sitemap, 'utf8');
  } else if (mismatches.length) {
    fail('Generated content is out of date. Run node scripts/build-content-pages.js to reconcile: ' + [...new Set(mismatches)].join(', '));
  }

  return { written: write, publishedTours: publishedByType.tour.length, publishedBlogs: publishedByType.blog.length, outputFiles: expectedFiles, removedFiles: write ? stale : [], sitemapChanged: sitemapOriginal !== sitemap };
}

if (require.main === module) {
  let root = ROOT;
  let write = false;
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--write') write = true;
    else if (args[index] === '--check') write = false;
    else if (args[index] === '--root' && args[index + 1]) root = path.resolve(args[++index]);
    else fail('Unknown argument: ' + args[index]);
  }
  try {
    const result = buildContentPages(root, { write });
    console.log((write ? 'PASS: generated' : 'PASS: generated content is current') + '; ' + result.publishedTours + ' live tour(s), ' + result.publishedBlogs + ' live article(s), ' + result.outputFiles.length + ' generated page(s).');
    if (!result.publishedTours && !result.publishedBlogs) console.log('NOTE: no live content is eligible for public output; draft records remain unpublished.');
  } catch (error) {
    console.error('FAIL: content rendering blocked: ' + error.message);
    process.exitCode = 1;
  }
}

module.exports = { buildContentPages, escapeHtml, GENERATED_MARKER, SITEMAP_BEGIN, SITEMAP_END };
