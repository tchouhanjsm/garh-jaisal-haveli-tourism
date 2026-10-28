#!/usr/bin/env node
'use strict';

/**
 * Read-only editorial readiness audit.
 *
 * This tool distinguishes "structured enough for human review" from "approved
 * for release". It never writes HTML, changes a record status, or edits the
 * sitemap. --strict-release returns exit code 2 while any release blocker remains.
 */
const fs = require('node:fs');
const path = require('node:path');
const { safeRelativePath, validateAgainstSchema } = require('./validate-content');

const ROOT = path.resolve(__dirname, '..');
const APPROVED_SOURCE_HOSTS = new Set([
  'whc.unesco.org',
  'www.tourism.rajasthan.gov.in',
  'tourism.rajasthan.gov.in',
  'mausam.imd.gov.in',
  'github.com',
]);
const REVIEW_FIELDS = ['editorialStatus', 'sourceStatus', 'factStatus', 'mediaStatus'];

function readJson(root, relative) {
  const filename = path.resolve(root, relative);
  try {
    return JSON.parse(fs.readFileSync(filename, 'utf8'));
  } catch (error) {
    throw new Error(relative + ' is missing or invalid: ' + error.message);
  }
}
function insideRoot(root, relative) {
  if (!safeRelativePath(relative)) return false;
  const base = path.resolve(root);
  const target = path.resolve(base, relative);
  const fromRoot = path.relative(base, target);
  return fromRoot !== '' && fromRoot !== '..' && !fromRoot.startsWith('..' + path.sep) && !path.isAbsolute(fromRoot);
}
function localImageExists(root, rawPath) {
  if (typeof rawPath !== 'string' || !rawPath || !insideRoot(root, rawPath)) return false;
  const absolute = path.resolve(root, rawPath);
  try {
    const info = fs.lstatSync(absolute);
    return info.isFile() && !info.isSymbolicLink() && info.size > 0;
  } catch (_) {
    return false;
  }
}
function normaliseQuery(value) {
  return String(value || '').trim().toLowerCase().split(/\s+/).filter(Boolean).join(' ');
}
function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function isReviewComplete(record, heroExists, ogExists) {
  const review = record.editorialReview || {};
  return REVIEW_FIELDS.every(field => review[field] === 'approved')
    && review.ownerFactApproved === true
    && validDate(review.reviewedAt)
    && typeof review.reviewer === 'string'
    && review.reviewer.trim().length >= 2
    && heroExists && ogExists
    && typeof record.heroAlt === 'string' && record.heroAlt.trim().length >= 5
    && typeof (record.seo && record.seo.ogAlt) === 'string'
    && record.seo.ogAlt.trim().length >= 5;
}

function auditEditorialReadiness(root = ROOT) {
  const schema = readJson(root, 'content/schemas/blog.schema.json');
  const config = readJson(root, 'content/site-config.json');
  const robots = fs.readFileSync(path.resolve(root, 'robots.txt'), 'utf8');
  const sitemap = fs.readFileSync(path.resolve(root, 'sitemap.xml'), 'utf8');
  const blogDirectory = path.resolve(root, 'content/blogs');
  const names = fs.readdirSync(blogDirectory, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
    .map(entry => entry.name).sort();
  const records = [];
  const errors = [];
  const primaryQueryOwners = new Map();
  const sitemapUrls = [...sitemap.matchAll(/<loc>\s*(https?:\/\/[^<\s]+)\s*<\/loc>/gi)].map(match => match[1]);
  const publicBlogDirectory = path.resolve(root, 'blogs');
  const publicBlogPages = fs.existsSync(publicBlogDirectory)
    ? fs.readdirSync(publicBlogDirectory, { withFileTypes: true })
      .filter(entry => entry.isFile() && entry.name.endsWith('.html')).map(entry => entry.name).sort()
    : [];
  const site = config.site || {};
  const robotsBlocking = /User-agent\s*:\s*\*[\s\S]*?Disallow\s*:\s*\/(?:\s|$)/i.test(robots);
  const canonicalApproved = site.canonicalHostApproved === true;
  const sitemapContainsNoUrls = sitemapUrls.length === 0;

  for (const name of names) {
    const relative = 'content/blogs/' + name;
    let record;
    try {
      record = JSON.parse(fs.readFileSync(path.join(blogDirectory, name), 'utf8'));
    } catch (error) {
      errors.push(relative + ': invalid JSON: ' + error.message);
      continue;
    }
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      errors.push(relative + ': record must be a JSON object');
      continue;
    }
    records.push({ name, relative, record });
  }
  const slugs = new Set(records.map(item => item.record.slug));
  const reports = [];

  for (const item of records) {
    const { name, relative, record } = item;
    const schemaFindings = validateAgainstSchema(schema, record, relative);
    if (name !== record.slug + '.json') errors.push(relative + ': filename must match slug');
    for (const finding of schemaFindings) errors.push(relative + ': schema ' + finding.path + ' ' + finding.message);

    const query = normaliseQuery(record.seo && record.seo.primaryQuery);
    let queryDuplicate = false;
    if (!query) errors.push(relative + ': primary query is missing');
    else if (primaryQueryOwners.has(query)) {
      queryDuplicate = true;
      errors.push(relative + ': primary query duplicates ' + primaryQueryOwners.get(query) + ' (' + query + ')');
    } else primaryQueryOwners.set(query, record.slug);

    const blockers = [];
    const structureIssues = [];
    const sourceHosts = [];
    const relatedSlugs = Array.isArray(record.relatedBlogs) ? record.relatedBlogs : [];
    const sections = Array.isArray(record.sections) ? record.sections : [];
    const sources = Array.isArray(record.sources) ? record.sources : [];

    if (record.status !== 'draft' && record.status !== 'ready_for_review'
        && record.status !== 'approved_for_release' && record.status !== 'live'
        && record.status !== 'hidden') {
      structureIssues.push('unsupported publication status');
    }
    if (typeof record.title !== 'string' || record.title.length < 10 || record.title.length > 90) structureIssues.push('article title is outside the schema budget');
    if (!record.seo || typeof record.seo.title !== 'string' || record.seo.title.length < 10 || record.seo.title.length > 60) structureIssues.push('SEO title is outside the 10–60 character budget');
    if (!record.seo || typeof record.seo.description !== 'string' || record.seo.description.length < 110 || record.seo.description.length > 160) structureIssues.push('SEO description is outside the 110–160 character budget');
    if (sections.length < 3) structureIssues.push('article requires at least three substantive sections');
    if (sources.length < 2) structureIssues.push('article requires at least two named sources');
    for (const source of sources) {
      let url;
      try {
        url = new URL(source.url);
      } catch (_) {
        structureIssues.push('source URL is invalid: ' + (source.url || '(empty)'));
        continue;
      }
      sourceHosts.push(url.hostname.toLowerCase());
      if (url.protocol !== 'https:' || !APPROVED_SOURCE_HOSTS.has(url.hostname.toLowerCase())) {
        structureIssues.push('source must use HTTPS on the approved source list: ' + url.hostname);
      }
    }
    for (const related of relatedSlugs) {
      if (!slugs.has(related)) structureIssues.push('related article does not exist: ' + related);
    }
    const review = record.editorialReview || {};
    const heroExists = localImageExists(root, record.heroImage);
    const ogExists = localImageExists(root, record.seo && record.seo.ogImage);
    const heroComplete = heroExists && typeof record.heroAlt === 'string' && record.heroAlt.trim().length >= 5;
    const ogComplete = ogExists && typeof (record.seo && record.seo.ogAlt) === 'string' && record.seo.ogAlt.trim().length >= 5;
    const mediaComplete = heroComplete && ogComplete;
    const reviewComplete = isReviewComplete(record, heroExists, ogExists);
    const structuralComplete = schemaFindings.length === 0 && structureIssues.length === 0 && !queryDuplicate;

    if (structureIssues.length) errors.push(...structureIssues.map(issue => relative + ': ' + issue));
    if (review.mediaStatus === 'approved' && !mediaComplete) {
      errors.push(relative + ': mediaStatus is approved but hero/OG assets or alt text are incomplete');
    }
    if (review.mediaStatus === 'missing' && (record.heroImage || (record.seo && record.seo.ogImage))) {
      errors.push(relative + ': mediaStatus is missing although hero/OG image paths are assigned');
    }
    if (review.ownerFactApproved === true && review.factStatus !== 'approved') {
      errors.push(relative + ': owner fact approval requires factStatus: approved');
    }
    for (const field of REVIEW_FIELDS) {
      if (review[field] !== 'approved') blockers.push(field + '-pending');
    }
    if (!record.heroImage || !heroExists || !heroComplete) blockers.push('hero-image-missing-or-unreviewed');
    if (!record.seo || !record.seo.ogImage || !ogExists || !ogComplete) blockers.push('open-graph-image-missing-or-unreviewed');
    if (review.ownerFactApproved !== true) blockers.push('owner-fact-approval-pending');
    if (!validDate(review.reviewedAt)) blockers.push('review-date-pending');
    if (typeof review.reviewer !== 'string' || review.reviewer.trim().length < 2) blockers.push('named-reviewer-pending');
    if (record.status !== 'approved_for_release' && record.status !== 'live') blockers.push('publication-status-not-approved');
    if (!canonicalApproved) blockers.push('canonical-host-approval-closed');
    if (robotsBlocking) blockers.push('robots-policy-blocking-crawl');
    if (sitemapContainsNoUrls) blockers.push('sitemap-still-empty');

    if ((record.status === 'approved_for_release' || record.status === 'live') && !reviewComplete) {
      errors.push(relative + ': release status set before editorial/source/fact/media and owner approval is complete');
    }
    if (record.status === 'live' && !canonicalApproved) {
      errors.push(relative + ': live article exists while canonical-host approval is closed');
    }
    if (record.status !== 'live' && fs.existsSync(path.resolve(root, 'blogs', record.slug + '.html'))) {
      errors.push(relative + ': non-live article has a public HTML output file');
    }

    reports.push({
      slug: record.slug,
      title: record.title,
      status: record.status,
      primaryQuery: query,
      searchIntent: record.seo && record.seo.searchIntent,
      sectionCount: sections.length,
      sourceCount: sources.length,
      sourceHosts: [...new Set(sourceHosts)].sort(),
      relatedCount: relatedSlugs.length,
      editorialReview: {
        editorialStatus: review.editorialStatus || 'missing',
        sourceStatus: review.sourceStatus || 'missing',
        factStatus: review.factStatus || 'missing',
        mediaStatus: review.mediaStatus || 'missing',
        ownerFactApproved: review.ownerFactApproved === true,
        reviewedAt: review.reviewedAt || null,
        reviewer: review.reviewer || null,
      },
      contentPacketReadyForHumanReview: structuralComplete,
      mediaComplete,
      releaseEligible: (record.status === 'approved_for_release' || record.status === 'live')
        && reviewComplete && structuralComplete && canonicalApproved && !robotsBlocking
        && sitemapUrls.includes(String(site.newStaticSiteCanonicalHost || '').replace(/\/+$/, '') + '/blogs/' + record.slug + '.html'),
      blockers: [...new Set(blockers)],
    });
  }

  const contentPacketCount = reports.filter(item => item.contentPacketReadyForHumanReview).length;
  const mediaCompleteCount = reports.filter(item => item.mediaComplete).length;
  const releaseEligibleCount = reports.filter(item => item.releaseEligible).length;
  const rendererSafe = reports.every(item => item.status !== 'draft' || !publicBlogPages.includes(item.slug + '.html'));
  if (!rendererSafe) errors.push('draft-only publication guard is violated by a public blog output file');

  return {
    schemaVersion: 1,
    state: errors.length ? 'ERROR' : releaseEligibleCount === reports.length && reports.length > 0 ? 'READY_FOR_RELEASE' : 'BLOCKED',
    summary: {
      totalArticles: reports.length,
      contentPacketsReadyForHumanReview: contentPacketCount,
      mediaComplete: mediaCompleteCount,
      releaseEligible: releaseEligibleCount,
      blockedFromRelease: reports.length - releaseEligibleCount,
      hardErrors: errors.length,
      publicBlogPages: publicBlogPages.length,
    },
    siteGates: {
      canonicalHostApproved: canonicalApproved,
      robotsBlocking,
      sitemapUrlCount: sitemapUrls.length,
      sitemapEmpty: sitemapContainsNoUrls,
      publicationMode: site.canonicalPublicationMode || null,
    },
    errors,
    articles: reports,
  };
}

function printSummary(report) {
  console.log('EDITORIAL READINESS: ' + report.state);
  console.log('Articles: ' + report.summary.totalArticles
    + ' | review packets ready: ' + report.summary.contentPacketsReadyForHumanReview
    + ' | media complete: ' + report.summary.mediaComplete
    + ' | release eligible: ' + report.summary.releaseEligible);
  console.log('Site gates: canonical approved=' + report.siteGates.canonicalHostApproved
    + ', robots blocking=' + report.siteGates.robotsBlocking
    + ', sitemap URLs=' + report.siteGates.sitemapUrlCount);
  for (const article of report.articles) {
    console.log((article.releaseEligible ? 'READY ' : 'BLOCK ') + article.slug
      + ' — ' + article.blockers.join(', '));
  }
  if (report.errors.length) {
    console.error('Integrity errors:');
    for (const error of report.errors) console.error(' - ' + error);
  }
}
if (require.main === module) {
  const args = new Set(process.argv.slice(2));
  const report = auditEditorialReadiness(ROOT);
  if (args.has('--json')) console.log(JSON.stringify(report, null, 2));
  else printSummary(report);
  if (args.has('--strict-release') && report.state !== 'READY_FOR_RELEASE') process.exitCode = 2;
  else if (report.errors.length) process.exitCode = 1;
}
module.exports = { auditEditorialReadiness, isReviewComplete, localImageExists };
