#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const { safeRelativePath, validateAgainstSchema, validateRecordPolicy } = require('./validate-content');

assert.equal(safeRelativePath('content/tours/example.json'), true);
assert.equal(safeRelativePath('assets/images/tours/example/hero.webp'), true);
for (const unsafe of ['', '/etc/passwd', '../outside.json', 'content/../outside.json', 'assets\\images\\hero.webp', 'content//bad.json']) {
  assert.equal(safeRelativePath(unsafe), false, 'must reject unsafe path: ' + unsafe);
}

const fixtureSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['slug', 'title', 'steps'],
  properties: {
    slug: { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' },
    title: { type: 'string', minLength: 5, maxLength: 60 },
    steps: {
      type: 'array',
      minItems: 1,
      items: { type: 'object', required: ['step'], properties: { step: { type: 'integer', minimum: 1 } } },
    },
    lastVerified: { type: ['string', 'null'], format: 'date' },
  },
};
assert.deepEqual(validateAgainstSchema(fixtureSchema, {
  slug: 'sunset-camel-safari', title: 'Sunset Camel Safari',
  steps: [{ step: 1 }], lastVerified: '2026-10-25',
}), []);
assert.ok(validateAgainstSchema(fixtureSchema, { slug: '../escape', title: 'Bad', steps: [] }).length >= 3,
  'invalid slug, title and empty steps should be rejected');

const findings = [];
validateRecordPolicy('tour', {
  slug: 'unverified-tour', status: 'live', factsConfirmed: false, lastVerified: null,
}, process.cwd(), {
  contentTypes: { tour: { outputDirectory: 'tours', outputExtension: '.html' } },
}, {
  site: { canonicalHostApproved: false, newStaticSiteCanonicalHost: 'https://example.test' },
}, findings, 'content/tours/unverified-tour.json');
assert.ok(findings.some(f => f.message.includes('factsConfirmed')), 'live tour without confirmed facts must be rejected');
assert.ok(findings.some(f => f.message.includes('lastVerified')), 'live tour without verification date must be rejected');

console.log('PASS: content contract unit tests (safe paths, schema validation, live-content approval gates).');
