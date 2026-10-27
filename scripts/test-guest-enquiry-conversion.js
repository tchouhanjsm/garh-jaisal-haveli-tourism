'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'content/site-config.json'), 'utf8'));
for (const file of ['experiences.html', 'experience-details.html', 'dining.html']) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  assert.match(html, /data-guest-enquiry-form/, file + ': shared form missing');
  assert.match(html, /name="experience"[^>]*required/, file + ': required interest missing');
  assert.match(html, /name="arrival" type="date" required/, file + ': required arrival date missing');
  assert.match(html, /name="departure" type="date" required/, file + ': required departure date missing');
  assert.match(html, /name="guests"[^>]*required/, file + ': required guest count missing');
  assert.match(html, /data-guest-enquiry-status aria-live="polite"/, file + ': accessible status missing');
  assert.match(html, /does not confirm a booking/i, file + ': reservation disclaimer missing');
}
assert.equal(config.verificationStatus, 'owner-authorized-source');
assert.equal(config.contact.status, 'source-authorized');
assert.match(config.contact.whatsappBaseUrl, /^https:\/\/wa\.me\/\d{8,15}$/);
const js = fs.readFileSync(path.join(root, 'assets/site.js'), 'utf8');
assert.match(js, /function configureGuestEnquiryForms\(config\)/);
assert.match(js, /departure <= arrival/);
assert.match(js, /window\.open\(target, '_blank', 'noopener,noreferrer'\)/);
assert.match(js, /temporarily unavailable because the contact channel could not be verified/);
assert.match(js, /no reservation is confirmed by this website/);
assert.match(js, /encodeURIComponent\(lines\.join\(/);
console.log('PASS: guest enquiry panel source-contract checks.');
