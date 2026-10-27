# Static accessibility contract

The repository quality suite includes a dependency-free static audit for every root HTML page and every HTML page beneath \`tours/\` and \`blogs/\`. It complements (rather than replaces) the Chromium guest-journey checks.

## Contract enforced

- Exactly one \`main#main\` landmark and a named \`a.skip-link[href="#main"]\` on each public HTML page.
- Non-empty accessible names for links, buttons, summaries and non-hidden form controls. Names may come from text, image alt text, \`aria-label\`, \`aria-labelledby\`, \`title\`, or an associated \`label\`.
- Explicit valid button types.
- Valid local ID references for \`aria-controls\`, \`aria-labelledby\`, \`aria-describedby\`, \`aria-owns\` and \`label[for]\`, plus unique IDs.
- Valid boolean values for \`aria-expanded\` and \`aria-hidden\`.
- No positive \`tabindex\`; no focusable element inside \`aria-hidden="true"\` content unless a \`hidden\` or \`inert\` ancestor also removes it from interaction.
- Non-empty image alt attributes when an image is not explicitly decorative; reject common generic labels such as \`image 1\`.
- \`rel=noopener\` on links using \`target="_blank"\`.

Run locally with:

\`\`\`sh
python3 scripts/test-static-accessibility-contract.py
python3 scripts/test-static-accessibility.py
\`\`\`

The contract test uses temporary valid and deliberately invalid HTML fixtures. The live audit reads repository HTML only; it does not access staging, follow external links, submit data or alter publication settings.

## Limitations

This is a deterministic source-level guard, not a WCAG conformance certificate. It cannot measure color contrast, screen-reader announcements in a real assistive-technology stack, zoom/reflow quality, or actual browser focus order in every state. Chromium smoke tests and operator UAT remain required, including keyboard use of the six experience galleries, reduced-motion behavior, responsive rendering and live contact/booking reachability. Do not mark STG-01–STG-18 passed from this check.
