# Static route and anchor integrity

The static integrity gate audits every root-level HTML page and recursively discovers HTML beneath \`tours/\` and \`blogs/\`. This protects future nested content routes as well as the current seven core pages and branded 404 page.

## Enforced checks

- Each discovered HTML page has a non-empty title and meta description, exactly one H1, unique IDs and no image missing its \`alt\` attribute.
- Local \`href\` and \`src\` references resolve to files within the repository. Root-relative URLs are resolved from the site root; relative URLs are resolved from the source page directory.
- Query strings do not hide missing files, URL-encoded paths are decoded before checking, and directory URLs resolve through a real \`index.html\` when present.
- HTML fragments are checked against the target page's IDs, including same-page fragments, nested routes, root-relative links and links with query strings.
- Repository-level checks continue to validate required assets, XML sitemap syntax and homepage Hotel JSON-LD.

The checker deliberately skips external schemes and hosts. It does not make network requests, validate third-party URLs, inspect server routing rules, or prove that the deployed host serves a particular route.

## Regression contract

Run:

\`\`\`bash
python3 scripts/test-site-integrity-contract.py
python3 scripts/check-site.py
bash scripts/check-site.sh
\`\`\`

The fixture suite creates temporary nested tour/blog routes, validates relative and root-relative references with query strings, and verifies that broken files, missing fragments and repository traversal fail closed. The full project quality runner invokes the fixture suite before the broader static and Chromium tests.

## Release boundary

This is static repository validation only. It does not mark STG-01–STG-18 complete, approve a canonical hostname, activate sitemap/robots publication, verify DNS/SSL, or authorize production deployment. Owner-operated staging and booking/contact verification remain required.
