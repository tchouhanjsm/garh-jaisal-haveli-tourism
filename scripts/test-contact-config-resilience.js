#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const smoke = fs.readFileSync(path.join(root, 'scripts', 'test-browser-smoke.py'), 'utf8');
const quality = fs.readFileSync(path.join(root, 'scripts', 'check-pr-quality.sh'), 'utf8');
const runtime = fs.readFileSync(path.join(root, 'assets', 'site.js'), 'utf8');
const enquiryTest = fs.readFileSync(path.join(root, 'scripts', 'test-enquiry-flow.js'), 'utf8');
const diningRuntime = fs.readFileSync(path.join(root, 'assets', 'dining-tabs.js'), 'utf8');
const diningHtml = fs.readFileSync(path.join(root, 'dining.html'), 'utf8');
const diningTest = fs.readFileSync(path.join(root, 'scripts', 'test-dining-journey.js'), 'utf8');
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

assert.match(smoke, /def check_contact_configuration_recovery_all_routes\(browser, base_url: str\) -> None:/,
  'Contact outage and recovery must run across the complete public route set.');
assert.match(smoke, /for page_name in PAGES:/,
  'The route-wide recovery gate must derive scope from the shared public route contract.');
assert.match(smoke, /check_contact_configuration_recovery_all_routes\(browser, base_url\)/,
  'The route-wide recovery matrix must be part of the consolidated Chromium run.');
assert.match(smoke, /if config_requests <= 2:/,
  'The Directions recovery scenario must include a second consecutive temporary failure.');
assert.match(smoke, /check\(config_requests == 3,/,
  'Two explicit retries must be verified before recovery is accepted.');
assert.match(enquiryTest, /const channelIsolationCases = \[/,
  'Runtime contracts must exercise isolated malformed-channel cases.');
assert.match(enquiryTest, /opens WhatsApp to ask about availability/i,
  'Successful recovery must assert the current WhatsApp enquiry copy, not the outage fallback.');
assert.match(enquiryTest, /this is an enquiry, not a reservation/i,
  'Successful recovery must retain the non-reservation boundary.');
assert.match(enquiryTest, /no payment is taken here/i,
  'Successful recovery must retain the no-payment boundary.');
assert.match(enquiryTest, /fetchFailure\.fetchCalls\(\), 3/,
  'The unit contract must verify recovery after two failed config responses.');

console.log('PASS: contact outage recovery covers every public route, channel isolation and repeated retry failure without weakening fail-closed controls.');

assert.match(diningRuntime, /document\.addEventListener\('garh-jaisal:contact-ready'/,
  'Dining table enquiry must consume the same validated configuration event as the other public contact actions.');
assert.doesNotMatch(diningRuntime, /fetch\s*\(|site-config\.json|document\.currentScript/,
  'Dining must not initiate a duplicate or asynchronous-currentScript config request.');
assert.ok(diningHtml.indexOf('assets/dining-tabs.js') < diningHtml.indexOf('assets/site.js'),
  'The Dining event listener must load before the shared runtime dispatches contact-ready.');
assert.match(diningTest, /must not own a second configuration fetch/,
  'The Dining static contract must prevent a duplicate configuration loader from returning.');
