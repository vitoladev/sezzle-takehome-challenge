# Development environment for sezzle-take-home-challenge.
# One image, batteries included — customize here, then `down.sh && up.sh` to rebuild.
FROM mcr.microsoft.com/devcontainers/base:ubuntu-24.04

ARG GO_VERSION=1.26.5

# Node 22 (NodeSource) + pnpm via corepack
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && corepack enable \
    && rm -rf /var/lib/apt/lists/*

# Go toolchain
RUN ARCH="$(dpkg --print-architecture)" \
    && curl -fsSL "https://go.dev/dl/go${GO_VERSION}.linux-${ARCH}.tar.gz" \
       | tar -C /usr/local -xz
ENV PATH=/usr/local/go/bin:/usr/local/bin:$PATH

# Playwright Chromium + system deps for e2e tests and browser verification.
# Keep PLAYWRIGHT_VERSION in sync with @playwright/test in the root
# package.json — a mismatch makes playwright re-download browsers at runtime.
ARG PLAYWRIGHT_VERSION=1.62.1
ENV PLAYWRIGHT_BROWSERS_PATH=/usr/local/ms-playwright
RUN npx -y playwright@${PLAYWRIGHT_VERSION} install --with-deps chromium \
    && chmod -R a+rX /usr/local/ms-playwright \
    && rm -rf /var/lib/apt/lists/*

# Go dev tools, installed system-wide so they survive user/home changes.
# air: hot reload for the API server (`pnpm --filter api dev`).
RUN GOBIN=/usr/local/bin GOPATH=/tmp/build-gopath GOCACHE=/tmp/build-gocache \
       go install github.com/air-verse/air@latest \
    && rm -rf /tmp/build-gopath /tmp/build-gocache
