---
name: pr-preview-media
description: |
  Turn a frontend PR's `playwright-web-e2e` CI artifact into GIFs + stills and embed them in the PR body's Preview section. Use after the web-e2e CI job goes green on a stack branch, when the task-orchestrator publish step names it, or when asked to put feature recordings into a PR.
---

# PR preview media

A reviewer reads the PR summary top to bottom and does not scroll into comments — the recordings belong in the body, in a `## Preview` section right after `## Sub-issue`, before `## What changed`. Everything runs on the host (gh, git, docker); nothing touches the devcontainer or the product code.

## 1. Fetch the artifact

Find the green run for the PR's head branch and pull the recordings:

```bash
gh run list --branch <branch> --workflow frontend.yml --json databaseId,conclusion,headSha
gh run download <run-id> -n playwright-web-e2e -D <scratch>/e2e-artifact
```

The run must be green and its `headSha` must match the PR head — stale recordings misrepresent the diff. Videos live one per spec under `test-results/<spec-dir>/video.webm`.

## 2. Convert

ffmpeg is not on the host; use the `linuxserver/ffmpeg` image. Per spec dir, one GIF and one late-frame still (two separate invocations — `-sseof` is an input option and cannot share a command with the GIF output):

```bash
docker run --rm -v "$PWD/<spec-dir>:/in" -v <scratch>/media:/out linuxserver/ffmpeg \
  -y -i /in/video.webm -vf "fps=8,scale=640:-2:flags=lanczos" /out/<spec>.gif
docker run --rm -v "$PWD/<spec-dir>:/in" -v <scratch>/media:/out linuxserver/ffmpeg \
  -y -sseof -0.3 -i /in/video.webm -frames:v 1 -vf scale=800:-2 /out/<spec>.png
```

These settings keep each file in the tens of kilobytes. Eyeball one still (Read the png) before publishing — a blank frame means the seek landed outside the recording.

## 3. Publish the media branch

Media rides an orphan branch named `pr-<n>-media`, never merged:

```bash
git worktree add --orphan -b pr-<n>-media <scratch>/media-branch
# copy media in, add a README naming the source run and "never merge"
git commit --no-verify -m "chore: preview media for PR #<n>"   # no-verify: media-only orphan, pre-commit needs a devcontainer
git push origin pr-<n>-media && git worktree remove <scratch>/media-branch
```

## 4. Embed in the PR body

Edit the body with `gh pr edit <n> --body-file` — a comment is the wrong place. The `## Preview` section carries: one `###` per feature state with its GIF, a `<details>` block with the stills, a link to the CI run's artifact for full-res `.webm`, and the cleanup note ("media served from the never-to-be-merged `pr-<n>-media` branch; delete it once this PR closes").

Image URLs MUST use the same-repo form `https://github.com/<owner>/<repo>/raw/pr-<n>-media/<file>.gif`. On a private repo `raw.githubusercontent.com` 404s for GitHub's image proxy and every image renders blank; the `github.com/…/raw/…` form is rewritten into per-viewer signed URLs and works for both visibilities.

Done when the PR body renders every image (spot-check the rendered page, not just the markdown) and the section sits between `## Sub-issue` and `## What changed`.
