#!/usr/bin/env node
'use strict';

/**
 * Read-only audit of GitHub PR review evidence for the exact pull-request head.
 *
 * GitHub review records are observed from the authenticated REST API. They are
 * not editorial authorization: no owner-defined reviewer allowlist or
 * decision-return mechanism has been supplied. This tool never approves media,
 * edits content, or changes publication state.
 */
const API_ROOT = 'https://api.github.com';
const MAX_REVIEW_PAGES = 20;
const SHA_PATTERN = /^[0-9a-f]{40}$/i;
const REVIEW_STATES = new Set(['APPROVED', 'CHANGES_REQUESTED', 'COMMENTED', 'PENDING', 'DISMISSED']);

function validateInputs(options) {
  const repository = options && options.repository;
  const pullRequestNumber = Number(options && options.pullRequestNumber);
  const expectedHead = String(options && options.expectedHead || '').toLowerCase();
  const token = options && options.token;
  if (typeof repository !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error('Repository must be supplied as owner/name.');
  }
  if (!Number.isSafeInteger(pullRequestNumber) || pullRequestNumber < 1) {
    throw new Error('Pull request number must be a positive integer.');
  }
  if (!SHA_PATTERN.test(expectedHead)) {
    throw new Error('Expected pull-request head must be a 40-character commit SHA.');
  }
  if (typeof token !== 'string' || !token.trim()) {
    throw new Error('GITHUB_TOKEN is required for an authenticated review snapshot.');
  }
  if (typeof options.fetchImpl !== 'function') {
    throw new Error('A Fetch-compatible API transport is required.');
  }
  return { repository, pullRequestNumber, expectedHead, token };
}

async function getJson(fetchImpl, url, token) {
  const response = await fetchImpl(url, {
    method: 'GET',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer ' + token,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!response || response.ok !== true) {
    const status = response && Number.isInteger(response.status) ? response.status : 'unknown';
    throw new Error('GitHub API request failed (' + status + ') for ' + url.replace(API_ROOT, ''));
  }
  return response.json();
}

function normalizeReview(review, expectedHead) {
  if (!review || !Number.isSafeInteger(review.id) || review.id < 1) {
    throw new Error('GitHub returned a review without a valid numeric identifier.');
  }
  const state = typeof review.state === 'string' ? review.state.toUpperCase() : '';
  if (!REVIEW_STATES.has(state)) {
    throw new Error('GitHub returned an unsupported review state for review ' + review.id + '.');
  }
  const commitSha = review.commit_id === null || review.commit_id === undefined
    ? null : String(review.commit_id).toLowerCase();
  if (commitSha !== null && !SHA_PATTERN.test(commitSha)) {
    throw new Error('GitHub returned an invalid commit identity for review ' + review.id + '.');
  }
  const submittedAt = review.submitted_at === null || review.submitted_at === undefined
    ? null : String(review.submitted_at);
  if (submittedAt !== null && !Number.isFinite(Date.parse(submittedAt))) {
    throw new Error('GitHub returned an invalid submission timestamp for review ' + review.id + '.');
  }
  const login = review.user && typeof review.user.login === 'string'
    ? review.user.login : null;
  return {
    id: review.id,
    login,
    state,
    commitSha,
    submittedAt,
    submitted: submittedAt !== null && state !== 'PENDING',
    onExpectedHead: commitSha === expectedHead,
  };
}

async function auditEditorialReviewAuthority(options) {
  const input = validateInputs({ ...options, fetchImpl: options && options.fetchImpl || globalThis.fetch });
  const [owner, repositoryName] = input.repository.split('/');
  const repositoryPath = '/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repositoryName);
  const pullRequestUrl = API_ROOT + repositoryPath + '/pulls/' + input.pullRequestNumber;
  const pullRequest = await getJson(options.fetchImpl || globalThis.fetch, pullRequestUrl, input.token);

  if (!pullRequest || pullRequest.number !== input.pullRequestNumber ||
      !pullRequest.base || !pullRequest.base.repo ||
      pullRequest.base.repo.full_name !== input.repository ||
      !pullRequest.head || !SHA_PATTERN.test(String(pullRequest.head.sha || ''))) {
    throw new Error('GitHub pull-request metadata is incomplete or belongs to a different base repository.');
  }
  const actualHead = String(pullRequest.head.sha).toLowerCase();
  if (actualHead !== input.expectedHead) {
    throw new Error('Pull-request head changed during review audit; expected ' +
      input.expectedHead + ' but GitHub reports ' + actualHead + '.');
  }

  const reviews = [];
  for (let page = 1; page <= MAX_REVIEW_PAGES; page += 1) {
    const url = API_ROOT + repositoryPath + '/pulls/' + input.pullRequestNumber +
      '/reviews?per_page=100&page=' + page;
    const pageReviews = await getJson(options.fetchImpl || globalThis.fetch, url, input.token);
    if (!Array.isArray(pageReviews)) {
      throw new Error('GitHub review endpoint returned a non-array response.');
    }
    for (const review of pageReviews) reviews.push(normalizeReview(review, input.expectedHead));
    if (pageReviews.length < 100) break;
    if (page === MAX_REVIEW_PAGES) {
      throw new Error('GitHub review pagination exceeded the safe audit limit; evidence is incomplete.');
    }
  }

  const currentHeadReviews = reviews.filter(review => review.onExpectedHead && review.submitted);
  const currentHeadStateCounts = {};
  for (const review of currentHeadReviews) {
    currentHeadStateCounts[review.state] = (currentHeadStateCounts[review.state] || 0) + 1;
  }

  return {
    schemaVersion: 1,
    artifactType: 'editorial-github-review-evidence-audit',
    observedAt: options.observedAt || new Date().toISOString(),
    repository: input.repository,
    pullRequest: {
      number: input.pullRequestNumber,
      state: typeof pullRequest.state === 'string' ? pullRequest.state : 'unknown',
      baseBranch: pullRequest.base.ref || null,
      headRepository: pullRequest.head.repo && pullRequest.head.repo.full_name
        ? pullRequest.head.repo.full_name : null,
      expectedHead: input.expectedHead,
      observedHead: actualHead,
      exactHeadMatch: true,
    },
    reviewEvidence: {
      source: 'authenticated-github-rest-api',
      snapshotComplete: true,
      reviewCount: reviews.length,
      submittedReviewCount: reviews.filter(review => review.submitted).length,
      currentHeadReviewCount: currentHeadReviews.length,
      currentHeadStateCounts,
      reviews,
    },
    reviewerAuthorization: {
      state: 'NOT_CONFIGURED',
      policyConfigured: false,
      identityVerified: false,
      approvalAuthorized: false,
      decisionReturnMechanism: null,
      trustedReviewerCount: 0,
      reason: 'Owner-defined reviewer identities and an approved decision-return mechanism have not been supplied.',
    },
    releaseInvariants: {
      reviewEvidenceIsAuthorization: false,
      publicationEligible: false,
      approvedMediaChanged: false,
      contentRecordsChanged: false,
      publicationTriggered: false,
    },
  };
}

function parseArgs(args) {
  const parsed = { repository: null, pullRequestNumber: null, expectedHead: null };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--repo' && args[index + 1]) parsed.repository = args[++index];
    else if (argument === '--pull-request' && args[index + 1]) parsed.pullRequestNumber = args[++index];
    else if (argument === '--expected-head' && args[index + 1]) parsed.expectedHead = args[++index];
    else throw new Error('Unknown or incomplete argument: ' + argument);
  }
  if (!parsed.repository || !parsed.pullRequestNumber || !parsed.expectedHead) {
    throw new Error('Usage: node scripts/audit-editorial-review-authority.js --repo <owner/name> --pull-request <number> --expected-head <40-character-sha>');
  }
  return parsed;
}

if (require.main === module) {
  try {
    const parsed = parseArgs(process.argv.slice(2));
    auditEditorialReviewAuthority({
      ...parsed,
      token: process.env.GITHUB_TOKEN,
      fetchImpl: globalThis.fetch,
    }).then(report => {
      console.log(JSON.stringify(report, null, 2));
    }).catch(error => {
      console.error('FAIL: editorial GitHub review audit stopped safely: ' + error.message);
      process.exitCode = 1;
    });
  } catch (error) {
    console.error('FAIL: editorial GitHub review audit stopped safely: ' + error.message);
    process.exitCode = 1;
  }
}

module.exports = { auditEditorialReviewAuthority };
