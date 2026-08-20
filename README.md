# Preview media for PR #11

Do **not** merge this branch. It exists only to host images referenced from
PR #11's `## Preview` section; delete it once that PR closes.

Source: GitHub Actions run
[32364299995](https://github.com/vitoladev/sezzle-takehome-challenge/actions/runs/32364299995)
(`frontend` workflow, branch `issue-7-ci-docs` = PR #13, commit
`2a87715`, conclusion **success**), artifact `playwright-web-e2e`.

The workflows live only at the top of the stack, so PR #11 has no CI run of
its own. That run executed the whole committed 57-scenario Playwright suite,
which includes the scenarios shown here.

Each `.gif` is one `test-results/<spec>/video.webm` resampled with ffmpeg and
slowed ~2x (`error-retry` ~3x) for legibility; each `.png` is a single frame
from the same recording. Nothing was re-recorded locally.
