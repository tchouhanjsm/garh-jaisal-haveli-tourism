#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const smoke = fs.readFileSync(path.join(root, 'scripts', 'test-browser-smoke.py'), 'utf8');
const quality = fs.readFileSync(path.join(root, 'scripts', 'check-pr-quality.sh'), 'utf8');
const runtime = fs.readFileSync(path.join(root, 'assets', 'site.js'), 'utf8');
const arrival = fs.readFileSync(path.join(root, 'assets', 'js', 'arrival-enhancements.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets', 'site.css'), 'utf8');

assert.match(smoke, /def check_contact_configuration_failure_recovery\(browser, base_url: str\)/,
  'The Chromium suite must exercise temporary central-config failure and recovery.');
assert.match(smoke, /route\.fulfill\(\s*status=503/,
  'The resilience scenario must simulate an HTTP 503, not only an absent response.');
assert.match(smoke, /data-contact-config-retry/,
  'The Chromium scenario must expose the in-page retry control after the temporary failure.');
assert.match(smoke, /retry_button\.click\(\)/,
  'Recovery must happen through explicit user activation, not a full-page reload.');
assert.match(runtime, /data-contact-config-retry/,
  'The runtime must expose a retry action when central config loading fails.');
assert.match(runtime, /contactRetryButton\.addEventListener\('click'/,
  'Retry activation must be handled by the shared runtime.');
assert.match(runtime, /await configureContactChannels\(\)/,
  'Retry must re-run the same centralized configuration loader.');
assert.match(css, /\.contact-status-banner__retry[\s\S]*?min-height:\s*44px/,
  'The in-page retry control must have a usable touch target.');
assert.match(smoke, /Contact-config recovery: exact approved map source must be restored but remain dormant/,
  'Recovery must restore the exact approved map destination without activating an iframe request.');
assert.match(smoke, /check_contact_configuration_failure_recovery\(browser, base_url\)/,
  'The recovery scenario must run in the consolidated Chromium suite.');
assert.ok(quality.includes('node scripts/test-contact-config-resilience.js'),
  'The static resilience contract must run in the quality gate.');
assert.match(runtime, /catch \(_\) \{[\s\S]*?contactStatus\.hidden = false/,
  'The shared runtime must expose an accessible fallback when the config request fails.');
assert.match(runtime, /arrivalPlanningForms\.forEach\(form => \{[\s\S]*?form\.hidden = true/,
  'Arrival enquiry must fail closed when configuration cannot be loaded.');
assert.match(arrival, /if \(!hotelMapEmbedUrl\) \{[\s\S]*?iframe\.removeAttribute\('data-map-src'\)/,
  'The map iframe must remain dormant and unconfigured on invalid/missing destinations.');

console.log('PASS: central contact-config failure/retry acceptance is wired into real Chromium and the required quality gate.');
