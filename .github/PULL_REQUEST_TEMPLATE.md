<!-- One PR = one slice: a single sub-issue's diff against the stack branch below it. The bottom PR of a stack also carries the parent's overall checklist at the end. -->

## Sub-issue

<!-- Link the GitHub sub-issue this PR implements (Closes #<n>) and its parent. Name the stack position: base branch and what stacks on top. -->

## Preview

<!-- Frontend slices: GIFs/stills of every feature state, recorded by the web-e2e CI job and embedded by the pr-preview-media skill — the reviewer sees the behavior here, without leaving the summary. Use github.com/<owner>/<repo>/raw/... image URLs (private-repo safe). Backend-only slices: omit this section. -->

## What changed

<!-- The slice's own diff only — behavior added, seams touched. Layers below are context, not content. -->

## Acceptance criteria

<!-- Copy this surface's criteria from the parent issue. A checked box claims observed evidence, not intent — pair every check with the proof. Unproven criteria stay unchecked and appear under Blocked. -->

- [ ] <criterion> — <evidence: command + output, or committed screenshot path>

## Verification

<!-- verify-backend-output / verify-frontend-output verdict per scenario, with the commands a reviewer can rerun. -->

## Review

<!-- slice-review verdict (pass = zero P0/P1) and any advisory P2/P3 findings left open, with file:line. -->

## Blocked / known gaps

<!-- Each unproven or Blocked criterion with its cause and what unblocks it. "None." when the slice is fully proven. -->
