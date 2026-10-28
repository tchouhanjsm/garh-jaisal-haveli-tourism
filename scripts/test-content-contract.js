#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { safeRelativePath, validateAgainstSchema, validateRecordPolicy } = require('./validate-content');

const root = path.resolve(__dirname, '..');
const loadSchema = name => JSON.parse(fs.readFileSync(path.join(root, 'content', 'schemas', name + '.schema.json'), 'utf8'));
const schemas = {
  tour: loadSchema('tour'),
  blog: loadSchema('blog'),
  gallery: loadSchema('gallery'),
};

assert.equal(safeRelativePath('content/tours/example.json'), true);
assert.equal(safeRelativePath('assets/images/tours/example/hero.webp'), true);
for (const unsafe of ['', '/etc/passwd', '../outside.json', 'content/../outside.json', 'assets\\images\\hero.webp', 'content//bad.json']) {
  assert.equal(safeRelativePath(unsafe), false, 'must reject unsafe path: ' + unsafe);
}

const description = 'Plan your Jaisalmer visit with practical context about the heritage fort, desert experiences and the details travellers should confirm before their chosen date.';
const validTour = {
  schemaVersion: 1,
  slug: 'sunset-camel-safari',
  title: 'Sunset Camel Safari in Jaisalmer',
  seo: { title: 'Sunset Camel Safari in Jaisalmer', description },
  status: 'draft',
  summary: 'A clear introduction to a desert outing, held as a draft until operational details are confirmed.',
  timeline: [{ step: 1, title: 'Depart Jaisalmer', description: 'Begin after the hotel confirms the departure arrangement for the travel date.' }],
  included: [],
  notIncluded: [],
  factsConfirmed: false,
  lastVerified: null,
};
const mediaFixture = () => ({
  requirements: {
    hero: { required: true, minWidth: 1200, maxBytes: 204800, subject: 'A representative wide Jaisalmer Fort view' },
    socialPreview: { required: true, minWidth: 600, maxBytes: 81920, subject: 'A representative Jaisalmer heritage image for sharing' },
  },
  candidates: [], approvedAssets: [],
});
const validBlog = {
  schemaVersion: 1,
  slug: 'jaisalmer-fort-guide',
  title: 'A Practical Guide to Jaisalmer Fort',
  seo: { title: 'Jaisalmer Fort Visitor Guide', description, primaryQuery: 'Jaisalmer Fort guide', searchIntent: 'informational' },
  status: 'draft',
  media: mediaFixture(),
  lede: 'A practical guide to exploring the fort and planning arrival, with advice to verify before travel.',
  sections: [
    { id: 'arrive', heading: 'Plan your arrival', body: ['Confirm your route before travelling.'] },
    { id: 'explore', heading: 'Explore at a comfortable pace', body: ['Allow time for the lanes and heritage areas.'] },
  ],
  sources: [{ label: 'Official travel information', url: 'https://example.org/travel' }],
  lastReviewed: null,
  editorialReview: {
    editorialStatus: 'pending',
    sourceStatus: 'pending',
    factStatus: 'pending',
    mediaStatus: 'missing',
    ownerFactApproved: false,
    reviewedAt: null,
    reviewer: null,
  },
};
const validGallery = {
  schemaVersion: 1,
  category: 'hotel',
  title: 'Hotel Gallery',
  status: 'draft',
  images: [{
    src: 'assets/images/gallery/hotel/hotel-hero-01.webp',
    alt: 'Carved sandstone facade of the haveli',
    source: 'Owner-supplied property photograph',
    approved: false,
  }],
};

assert.deepEqual(validateAgainstSchema(schemas.tour, validTour), [], 'valid tour fixture should satisfy the actual schema');
assert.deepEqual(validateAgainstSchema(schemas.blog, validBlog), [], 'valid blog fixture should satisfy the actual schema');
assert.deepEqual(validateAgainstSchema(schemas.gallery, validGallery), [], 'valid gallery fixture should satisfy the actual schema');
const tourWithOgImage = {
  ...validTour,
  seo: {
    ...validTour.seo,
    ogImage: 'assets/images/tours/sunset-camel-safari/sunset-camel-safari-og-01.webp',
    ogAlt: 'Carved sandstone rooftop terrace overlooking Jaisalmer Fort at dusk',
  },
};
assert.deepEqual(validateAgainstSchema(schemas.tour, tourWithOgImage), [], 'explicit OG image and alt text should satisfy the schema');
assert.ok(validateAgainstSchema(schemas.tour, { ...tourWithOgImage, seo: { ...tourWithOgImage.seo, ogAlt: '' } }).length > 0,
  'empty OG image alt text must fail schema validation');
assert.ok(validateAgainstSchema(schemas.tour, { ...validTour, slug: '../escape' }).length > 0, 'unsafe tour slug must fail');
assert.ok(validateAgainstSchema(schemas.blog, { ...validBlog, sources: [] }).length > 0, 'blog without source references must fail');
assert.ok(validateAgainstSchema(schemas.blog, { ...validBlog, media: { ...mediaFixture(), approvedAssets: [{ path:'assets/images/blogs/example/example-hero-01.webp', role:'hero', alt:'image', approvedBy:'qa', approvedAt:'2026-10-28', rightsEvidence:'test' }] } }).length > 0,
  'generic alt text for an approved asset must fail schema validation');
assert.ok(validateAgainstSchema(schemas.blog, { ...validBlog, media: { ...mediaFixture(), candidates: [{ path:'../outside.webp', role:'hero', fit:'possible-contextual-match', rationale:'Candidate rationale is long enough for the test.', provenance:'Fixture path only, not a real provenance claim.', rightsStatus:'unverified', reviewStatus:'unreviewed' }] } }).length > 0,
  'unsafe candidate paths must fail schema validation');
assert.ok(validateAgainstSchema(schemas.gallery, {
  ...validGallery,
  images: [{ src: 'assets/images/gallery/hotel/hotel-hero-01.webp', source: 'Source', approved: false }],
}).length > 0, 'gallery image without alt text must fail');

const findings = [];
validateRecordPolicy('tour', {
  slug: 'unverified-tour', status: 'live', factsConfirmed: false, lastVerified: null,
}, root, {
  contentTypes: { tour: { outputDirectory: 'tours', outputExtension: '.html' } },
}, {
  site: { canonicalHostApproved: false, newStaticSiteCanonicalHost: 'https://example.test' },
}, findings, 'content/tours/unverified-tour.json');
assert.ok(findings.some(f => f.message.includes('factsConfirmed')), 'live tour without confirmed facts must be rejected');
assert.ok(findings.some(f => f.message.includes('lastVerified')), 'live tour without verification date must be rejected');
assert.ok(findings.some(f => f.message.includes('canonical host')), 'live content without approved canonical host must be rejected');

const missingOgAltFindings = [];
validateRecordPolicy('tour', {
  ...validTour,
  seo: {
    ...validTour.seo,
    ogImage: 'assets/images/tours/sunset-camel-safari/sunset-camel-safari-og-01.webp',
  },
}, root, {
  contentTypes: { tour: { outputDirectory: 'tours', outputExtension: '.html' } },
}, {
  site: { canonicalHostApproved: false, newStaticSiteCanonicalHost: 'https://example.test' },
}, missingOgAltFindings, 'content/tours/sunset-camel-safari.json');
assert.ok(missingOgAltFindings.some(f => f.path.endsWith('.seo.ogAlt')
  && f.message.includes('meaningful seo.ogAlt')),
'content policy must reject an explicit OG image without meaningful alt text');

const fortGuide = JSON.parse(fs.readFileSync(path.join(root, 'content/blogs/jaisalmer-fort-guide.json'), 'utf8'));
assert.deepEqual(validateAgainstSchema(schemas.blog, fortGuide), [], 'Fort guide draft must satisfy the production blog schema');
assert.equal(fortGuide.status, 'draft', 'Fort guide must remain unpublished');
assert.equal(fortGuide.lastReviewed, null, 'formal review date must remain unset');
assert.equal(fortGuide.publishedAt, null, 'article must not claim a publication date');
assert.equal(fortGuide.editorialReview.mediaStatus, fortGuide.media.candidates.length ? 'pending' : 'missing', 'article must distinguish unreviewed candidates from missing media');
assert.equal(fortGuide.media.approvedAssets.length, 0, 'existing asset files must not imply editorial approval');
assert.ok(fortGuide.media.requirements.hero.subject.length >= 8 && fortGuide.media.requirements.socialPreview.subject.length >= 8, 'media requirements must be explicit');
const blogDirectory = path.join(root, 'content', 'blogs');
const blogRecords = fs.readdirSync(blogDirectory)
  .filter(name => name.endsWith('.json'))
  .map(name => JSON.parse(fs.readFileSync(path.join(blogDirectory, name), 'utf8')));
const blogBySlug = new Map(blogRecords.map(record => [record.slug, record]));
assert.equal(blogBySlug.size, blogRecords.length, 'blog slugs must be unique');
for (const relatedSlug of fortGuide.relatedBlogs) {
  assert.ok(blogBySlug.has(relatedSlug),
    'draft must not point at a non-existent article slug: ' + relatedSlug);
}
assert.ok(fortGuide.sections.length >= 8, 'Fort guide must have substantive section coverage');
const fortGuideText = [fortGuide.title, fortGuide.lede, ...fortGuide.sections.flatMap(section => [section.heading, ...section.body])].join(' ');
const fortGuideWords = fortGuideText.split(/\s+/).filter(Boolean).length;
assert.ok(fortGuideWords >= 1200, 'Fort guide should remain substantive, not thin (' + fortGuideWords + ' words)');
assert.ok(fortGuide.sources.some(source => source.url === 'https://whc.unesco.org/en/list/247/'), 'Fort guide must cite UNESCO Hill Forts');
assert.ok(fortGuide.sources.some(source => source.url === 'https://www.tourism.rajasthan.gov.in/jaisalmer.html'), 'Fort guide must cite Rajasthan Tourism');
assert.ok(fortGuide.sources.some(source => source.url.includes('jain-temples-of-jaisalmer.html')), 'Fort guide must cite the official Jain Temples page');
assert.ok(fortGuideText.includes('UNESCO World Heritage property'), 'Fort guide must explain the heritage designation precisely');
assert.ok(/vehicles cannot enter the narrow fort lanes/i.test(fortGuideText), 'Fort guide must state the vehicle-access constraint');
assert.ok(!/300 metres|200 metres|5–6 minute walk|3–4 minute walk/i.test(fortGuideText), 'unverified legacy walking estimates must not leak into the article');
assert.ok(fortGuide.tableOfContents.every(entry => fortGuide.sections.some(section => section.id === entry.id)), 'table of contents must resolve to real sections');

console.log('PASS: content contract unit tests (actual schemas, unsafe paths, missing sources/alt text and publication gates).');
