#!/usr/bin/env node
'use strict';

/**
 * Build a local-only editorial media review bundle from existing draft
 * candidate declarations. Original image bytes are copied unchanged to a
 * temporary review artifact; no derivative, approval, article, or public
 * route is created or modified.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { auditMedia, safeImagePath } = require('./audit-editorial-media-readiness');

const IMAGE_EXTENSIONS = new Set(['.webp', '.avif', '.jpg', '.jpeg', '.png']);

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

function prepareOutputDirectory(root, outputDirectory) {
  const rootReal = fs.realpathSync(root);
  const output = path.resolve(outputDirectory);
  if (isWithin(rootReal, output)) {
    throw new Error('Review bundle output must be outside the repository root.');
  }

  const parent = path.dirname(output);
  const parentReal = fs.realpathSync(parent);
  const resolvedOutput = path.join(parentReal, path.basename(output));
  if (isWithin(rootReal, resolvedOutput)) {
    throw new Error('Review bundle output must be outside the repository root.');
  }

  if (fs.existsSync(output)) {
    const stat = fs.lstatSync(output);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new Error('Review bundle output must be a regular directory, not a symlink.');
    }
    if (fs.readdirSync(output).length !== 0) {
      throw new Error('Review bundle output directory must be empty.');
    }
  } else {
    fs.mkdirSync(output);
  }

  const imagesDirectory = path.join(output, 'images');
  fs.mkdirSync(imagesDirectory);
  return { output, imagesDirectory };
}

function candidatePlacement(article, candidate) {
  const roleKey = candidate.role === 'hero' ? 'hero' : 'socialPreview';
  const requirement = article.requirements && article.requirements[roleKey];
  const approved = (article.approvedAssets || []).some((asset) =>
    asset && asset.path === candidate.path && asset.role === candidate.role
  );
  const evidence = candidate.sourceEvidence || {};
  const visualReview = candidate.visualReview || {};

  return {
    articleSlug: article.slug,
    articleTitle: article.title,
    articleStatus: article.status,
    mediaStatus: article.mediaStatus,
    role: candidate.role,
    requirement: requirement && requirement.subject ? requirement.subject : null,
    rationale: candidate.rationale || '',
    provenanceNote: candidate.provenance || '',
    fit: candidate.fit || 'not-assessed',
    reviewStatus: candidate.reviewStatus || 'unreviewed',
    visualReviewStatus: visualReview.status || 'missing',
    visualReviewEvidence: visualReview.evidence || null,
    visualReviewer: visualReview.reviewer || null,
    visualReviewedAt: visualReview.reviewedAt || null,
    rightsStatus: candidate.rightsStatus || 'unverified',
    sourceEvidenceStatus: evidence.status || 'unverified',
    sourceCreator: evidence.creator || null,
    sourceUrl: evidence.sourceUrl || null,
    licenseName: evidence.licenseName || null,
    evidenceReference: evidence.evidenceReference || null,
    evidenceVerifiedBy: evidence.verifiedBy || null,
    evidenceVerifiedAt: evidence.verifiedAt || null,
    altText: candidate.altText || null,
    technical: candidate.technical === true,
    technicalErrors: Array.isArray(candidate.technicalErrors) ? candidate.technicalErrors : [],
    approvalState: approved ? 'approved-record-present' : 'not-approved',
  };
}

function renderPlacement(placement) {
  const sourceEvidence = [
    ['Source evidence', placement.sourceEvidenceStatus],
    ['Creator', placement.sourceCreator],
    ['Source URL', placement.sourceUrl],
    ['Licence', placement.licenseName],
    ['Evidence reference', placement.evidenceReference],
    ['Verified by / date', [placement.evidenceVerifiedBy, placement.evidenceVerifiedAt].filter(Boolean).join(' · ') || null],
  ].filter(([, value]) => value);

  const technical = placement.technical
    ? '<span class="state state-pass">Technical role check passed — not editorial approval</span>'
    : '<span class="state state-blocked">Technical role check blocked</span>';

  return [
    '<section class="placement">',
    '<h4>' + escapeHtml(placement.articleTitle) + ' · ' + escapeHtml(placement.articleSlug) + '</h4>',
    '<p><strong>Existing draft declaration:</strong> role ' + escapeHtml(placement.role) + '</p>',
    placement.requirement
      ? '<p><strong>Draft-stated subject requirement:</strong> ' + escapeHtml(placement.requirement) + '</p>'
      : '',
    '<p><strong>Candidate rationale:</strong> ' + escapeHtml(placement.rationale) + '</p>',
    '<p><strong>Candidate provenance note:</strong> ' + escapeHtml(placement.provenanceNote) + '</p>',
    '<dl>',
    '<dt>Fit</dt><dd>' + escapeHtml(placement.fit) + '</dd>',
    '<dt>Review</dt><dd>' + escapeHtml(placement.reviewStatus) + '</dd>',
    '<dt>Visual review</dt><dd>' + escapeHtml(placement.visualReviewStatus) + '</dd>',
    '<dt>Rights</dt><dd>' + escapeHtml(placement.rightsStatus) + '</dd>',
    ...sourceEvidence.map(([label, value]) => '<dt>' + escapeHtml(label) + '</dt><dd>' + escapeHtml(value) + '</dd>'),
    '</dl>',
    placement.visualReviewEvidence
      ? '<p><strong>Recorded visual-review evidence:</strong> ' + escapeHtml(placement.visualReviewEvidence) + '</p>'
      : '',
    placement.altText
      ? '<p><strong>Candidate alt text (unapproved):</strong> ' + escapeHtml(placement.altText) + '</p>'
      : '<p><strong>Alt text:</strong> not yet supplied for this candidate.</p>',
    technical,
    placement.technicalErrors.length
      ? '<ul class="errors">' + placement.technicalErrors.map((error) => '<li>' + escapeHtml(error) + '</li>').join('') + '</ul>'
      : '',
    '<p class="approval">Publication approval: ' + escapeHtml(placement.approvalState) + '</p>',
    '</section>',
  ].join('');
}

function buildHtml(manifest) {
  const assetSections = manifest.assets.map((asset) => {
    const image = asset.copyPath
      ? '<img src="' + escapeHtml(asset.copyPath) + '" alt="Unreviewed candidate preview: ' + escapeHtml(asset.path) + '" loading="lazy">'
      : '<div class="image-placeholder">Image bytes unavailable; inspect the technical report.</div>';
    const placements = asset.placements.map(renderPlacement).join('');
    const technicalSummary = [
      asset.format || 'unknown format',
      asset.width && asset.height ? asset.width + ' × ' + asset.height + ' px' : 'dimensions unavailable',
      Number.isInteger(asset.bytes) ? asset.bytes.toLocaleString('en-IN') + ' bytes' : 'byte count unavailable',
      asset.decodeStatus || 'decode status unavailable',
    ].join(' · ');

    return [
      '<article class="asset-card">',
      '<header><p class="eyebrow">DECLARED CANDIDATE · NOT APPROVED</p><h2>' + escapeHtml(asset.path) + '</h2></header>',
      '<figure>' + image + '<figcaption>' + escapeHtml(technicalSummary) + '</figcaption></figure>',
      '<p><strong>SHA-256:</strong> <code>' + escapeHtml(asset.sha256 || 'unavailable') + '</code></p>',
      '<p><strong>Review-copy integrity:</strong> ' + escapeHtml(asset.copyStatus) + '</p>',
      '<h3>Existing draft declarations — not an assessment</h3>',
      placements || '<p>No article placement is recorded for this candidate.</p>',
      '</article>',
    ].join('');
  }).join('');

  const articleGaps = manifest.articles.map((article) => {
    const requirements = article.requirements || {};
    const requirementRows = ['hero', 'socialPreview'].map((role) => {
      const requirement = requirements[role] && requirements[role].subject;
      return requirement
        ? '<li><strong>' + escapeHtml(role) + ' requirement:</strong> ' + escapeHtml(requirement) + '</li>'
        : '';
    }).join('');
    const candidates = article.candidatePaths.length
      ? article.candidatePaths.map((candidate) => '<li>' + escapeHtml(candidate.role) + ': ' + escapeHtml(candidate.path) + '</li>').join('')
      : '<li>No candidate is declared in this draft record.</li>';
    return '<li><strong>' + escapeHtml(article.slug) + '</strong> — ' + escapeHtml(article.status) +
      ' / media ' + escapeHtml(article.mediaStatus) +
      '<ul>' + requirementRows + candidates + '</ul></li>';
  }).join('');

  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="robots" content="noindex,nofollow">',
    '<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; img-src &#39;self&#39;; style-src &#39;unsafe-inline&#39;; base-uri &#39;none&#39;; form-action &#39;none&#39;">',
    '<title>Editorial media review — local-only, not approved</title>',
    '<style>',
    ':root{color-scheme:light;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#222;background:#f4f1eb}',
    '*{box-sizing:border-box}body{margin:0}main{max-width:1120px;margin:auto;padding:28px 20px 64px}',
    'header.hero{background:#fff;border:1px solid #d9d1c5;border-radius:14px;padding:24px;margin-bottom:22px}',
    'h1{font-size:clamp(1.7rem,4vw,2.5rem);line-height:1.12;margin:0 0 12px}h2{font-size:1.15rem;overflow-wrap:anywhere}',
    'h3{font-size:1rem;margin:20px 0 10px}h4{font-size:.98rem;margin:0 0 8px}p{line-height:1.55}',
    '.warning{border-left:5px solid #a33;background:#fff1ed;padding:14px 16px;border-radius:8px}',
    '.summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px;margin:18px 0}',
    '.metric{background:#fff;border:1px solid #d9d1c5;border-radius:10px;padding:12px}.metric strong{display:block;font-size:1.5rem}',
    '.asset-card{background:#fff;border:1px solid #d9d1c5;border-radius:14px;padding:18px;margin:18px 0}',
    'figure{margin:12px 0}figure img{display:block;max-width:100%;max-height:480px;object-fit:contain;background:#eee;border:1px solid #ddd}',
    'figcaption,.eyebrow,.muted{color:#625d55;font-size:.86rem}.eyebrow{font-weight:700;letter-spacing:.08em}',
    '.placement{border-top:1px solid #e5dfd6;padding:12px 0}.placement dl{display:grid;grid-template-columns:minmax(130px,190px) 1fr;gap:4px 12px}',
    'dt{font-weight:650}dd{margin:0;overflow-wrap:anywhere}.state{display:inline-block;padding:5px 8px;border-radius:6px;font-size:.88rem}',
    '.state-pass{background:#e6f3e8;color:#245b2b}.state-blocked{background:#fff0d9;color:#754500}',
    '.approval{font-weight:700;color:#9a2f20}.errors{color:#754500}.gaps{background:#fff;border:1px solid #d9d1c5;border-radius:12px;padding:18px}',
    '.image-placeholder{padding:36px;background:#eee;color:#555}.foot{margin-top:24px;color:#625d55;font-size:.9rem}',
    '@media(max-width:600px){main{padding:16px 12px 40px}.placement dl{grid-template-columns:1fr}.asset-card{padding:14px}}',
    '</style>',
    '</head>',
    '<body><main>',
    '<header class="hero">',
    '<p class="eyebrow">LOCAL-ONLY ENGINEERING ARTIFACT · REVIEW ONLY</p>',
    '<h1>Editorial media review bundle — NOT APPROVED</h1>',
    '<p class="warning"><strong>Review-only.</strong> This bundle presents only candidate declarations already present in draft records. It does not assert visual relevance, creator identity, rights, factual context, or publication fitness. No candidate is approved, no derivative is created, and no public article or site route is changed. An authorized owner/editor must inspect the original image and record evidence in the content record before any approval.</p>',
    '<div class="summary">',
    '<div class="metric"><strong>' + manifest.summary.articleCount + '</strong>Draft articles</div>',
    '<div class="metric"><strong>' + manifest.summary.candidatePlacementCount + '</strong>Declared placements</div>',
    '<div class="metric"><strong>' + manifest.summary.uniqueCandidateAssetCount + '</strong>Unique candidate files</div>',
    '<div class="metric"><strong>' + manifest.summary.approvedPlacementCount + '</strong>Approved candidate placements</div>',
    '</div>',
    '<p class="muted">Artifact source: existing draft candidate records and the read-only editorial media audit. Images in this bundle are byte-identical review copies, not publication derivatives.</p>',
    '</header>',
    '<section aria-labelledby="candidate-assets"><h2 id="candidate-assets">Candidate images — existing declarations only</h2>',
    assetSections || '<p>No candidate images are declared.</p>',
    '</section>',
    '<section class="gaps" aria-labelledby="article-requirements"><h2 id="article-requirements">Article requirements and candidate gaps</h2><ul>' + articleGaps + '</ul></section>',
    '<p class="foot">This artifact is not a staging site, public page, rights certificate, editorial decision, or release approval. Keep all unreviewed content in draft and keep approved media empty until every owner/editor gate is documented.</p>',
    '</main></body></html>',
  ].join('\n');
}

function buildEditorialMediaReview(root, outputDirectory, report) {
  const resolvedRoot = path.resolve(root);
  const audit = report || auditMedia(resolvedRoot);
  if (!audit || !audit.summary || !Array.isArray(audit.articles) || !Array.isArray(audit.inventory)) {
    throw new Error('Editorial media audit report is incomplete.');
  }

  const prepared = prepareOutputDirectory(resolvedRoot, outputDirectory);
  const inventoryByPath = new Map(audit.inventory.map((asset) => [asset.path, asset]));
  const grouped = new Map();

  for (const article of [...audit.articles].sort((left, right) => left.slug.localeCompare(right.slug))) {
    for (const candidate of article.candidates || []) {
      if (!candidate || typeof candidate.path !== 'string' || !candidate.path) continue;
      if (!grouped.has(candidate.path)) grouped.set(candidate.path, []);
      grouped.get(candidate.path).push(candidatePlacement(article, candidate));
    }
  }

  const assets = [];
  for (const [relativePath, placements] of [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const info = inventoryByPath.get(relativePath) || {};
    let copyPath = null;
    let copyStatus = 'unavailable';
    let digest = info.sha256 || null;

    const sourcePath = safeImagePath(resolvedRoot, relativePath);
    if (sourcePath && IMAGE_EXTENSIONS.has(path.extname(relativePath).toLowerCase())) {
      const sourceBytes = fs.readFileSync(sourcePath);
      const sourceDigest = crypto.createHash('sha256').update(sourceBytes).digest('hex');
      if (digest && digest !== sourceDigest) {
        throw new Error('Candidate bytes changed after the read-only audit: ' + relativePath);
      }
      digest = sourceDigest;
      const pathDigest = crypto.createHash('sha256').update(relativePath).digest('hex').slice(0, 8);
      const extension = path.extname(relativePath).toLowerCase();
      const fileName = 'asset-' + sourceDigest.slice(0, 16) + '-' + pathDigest + extension;
      const destination = path.join(prepared.imagesDirectory, fileName);
      fs.copyFileSync(sourcePath, destination, fs.constants.COPYFILE_EXCL);
      const copiedBytes = fs.readFileSync(destination);
      const copiedDigest = crypto.createHash('sha256').update(copiedBytes).digest('hex');
      if (copiedDigest !== sourceDigest || copiedBytes.length !== sourceBytes.length) {
        throw new Error('Review copy failed byte-integrity verification: ' + relativePath);
      }
      copyPath = 'images/' + fileName;
      copyStatus = 'copied-verified';
    }

    assets.push({
      path: relativePath,
      copyPath,
      copyStatus,
      format: info.format || path.extname(relativePath).slice(1).toLowerCase() || null,
      width: info.width || null,
      height: info.height || null,
      bytes: Number.isInteger(info.bytes) ? info.bytes : null,
      sha256: digest,
      headerValid: info.headerValid === true,
      decodeStatus: info.decodeStatus || 'unavailable',
      warnings: Array.isArray(info.warnings) ? info.warnings : [],
      errors: Array.isArray(info.errors) ? info.errors : [],
      placements: placements.sort((left, right) =>
        (left.articleSlug + ':' + left.role).localeCompare(right.articleSlug + ':' + right.role)
      ),
    });
  }

  const articles = [...audit.articles].sort((left, right) => left.slug.localeCompare(right.slug)).map((article) => ({
    slug: article.slug,
    title: article.title,
    status: article.status,
    mediaStatus: article.mediaStatus,
    requirements: article.requirements || null,
    candidatePaths: (article.candidates || []).map((candidate) => ({ path: candidate.path, role: candidate.role })),
    missingRoles: article.missingRoles || [],
    blockers: article.blockers || [],
    approvedAssetCount: (article.approvedAssets || []).length,
  }));

  const candidatePlacementCount = assets.reduce((total, asset) => total + asset.placements.length, 0);
  const approvedPlacementCount = assets.reduce((total, asset) =>
    total + asset.placements.filter((placement) => placement.approvalState === 'approved-record-present').length, 0);

  const manifest = {
    schemaVersion: 1,
    artifactType: 'editorial-media-review',
    reviewOnly: true,
    publicationEligible: false,
    approvalStatus: 'not-approved',
    source: 'existing draft candidate declarations plus read-only editorial media audit',
    summary: {
      articleCount: audit.summary.articleCount,
      blockedArticleCount: audit.summary.blockedArticleCount,
      approvedArticleCount: audit.summary.approvedArticleCount,
      declaredApprovedArticleCount: audit.summary.declaredApprovedArticleCount,
      candidatePlacementCount,
      uniqueCandidateAssetCount: assets.length,
      approvedPlacementCount,
      unapprovedPlacementCount: candidatePlacementCount - approvedPlacementCount,
      headerValidAssetCount: audit.summary.headerValidAssetCount,
      verifiedPixelDecodeAssetCount: audit.summary.verifiedPixelDecodeAssetCount,
      roleEligibleAssetCount: audit.summary.roleEligibleAssetCount,
    },
    policy: {
      originalBytesPreserved: true,
      derivativesCreated: false,
      publicRoutesChanged: false,
      draftRecordsChanged: false,
      rightsInferred: false,
      visualRelevanceInferred: false,
      candidateDeclarationsAreNotApproval: true,
    },
    errors: audit.errors || [],
    assets,
    articles,
  };

  fs.writeFileSync(path.join(prepared.output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  fs.writeFileSync(path.join(prepared.output, 'index.html'), buildHtml(manifest), { flag: 'wx' });
  return manifest;
}

function parseOutputArgument(args) {
  if (args.length !== 2 || args[0] !== '--output' || !args[1]) {
    throw new Error('Usage: node scripts/build-editorial-media-review.js --output <directory-outside-repository>');
  }
  return args[1];
}

if (require.main === module) {
  try {
    const output = parseOutputArgument(process.argv.slice(2));
    const manifest = buildEditorialMediaReview(path.resolve(__dirname, '..'), output);
    console.log('PASS: local-only editorial media review bundle created.');
    console.log('Draft articles: ' + manifest.summary.articleCount);
    console.log('Declared placements: ' + manifest.summary.candidatePlacementCount);
    console.log('Unique candidate files: ' + manifest.summary.uniqueCandidateAssetCount);
    console.log('Approved placements: ' + manifest.summary.approvedPlacementCount);
    console.log('Review-only output: ' + path.resolve(output));
    if (manifest.errors.length) {
      console.error('FAIL: editorial media audit reported integrity errors; review artifact is not an acceptance result.');
      process.exitCode = 1;
    }
  } catch (error) {
    console.error('FAIL: could not build local-only editorial media review bundle: ' + error.message);
    process.exitCode = 1;
  }
}

module.exports = { buildEditorialMediaReview, escapeHtml };
