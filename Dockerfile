# syntax=docker/dockerfile:1
# Dev image for the offboarding site: Debian + uv-managed Python 3.14 + Node 24 + Playwright/Chromium + Claude Code.
# Used by .devcontainer/devcontainer.json. The workspace is bind-mounted, nothing is copied in.

FROM node:24-trixie-slim AS node
FROM ghcr.io/astral-sh/uv:0.13.5 AS uv

FROM debian:trixie-slim

ARG USERNAME=vscode
ARG USER_UID=1000
ARG USER_GID=1000
ARG PYTHON_VERSION=3.14
ARG PLAYWRIGHT_VERSION=1.64.1

ENV DEBIAN_FRONTEND=noninteractive \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        git curl ca-certificates sudo less procps openssh-client \
    && rm -rf /var/lib/apt/lists/*

# --- Node.js 24 LTS + npm (copied from the official image) -------------------
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
    && node --version && npm --version

# --- uv + Python 3.14 (managed by uv, shared for all users) ------------------
COPY --from=uv /uv /uvx /usr/local/bin/
ENV UV_PYTHON_INSTALL_DIR=/opt/uv/python \
    UV_PYTHON_PREFERENCE=only-managed
RUN uv python install ${PYTHON_VERSION} \
    && ln -sf "$(uv python find ${PYTHON_VERSION})" /usr/local/bin/python3 \
    && ln -sf /usr/local/bin/python3 /usr/local/bin/python \
    && chmod -R a+rX /opt/uv \
    && python --version

# --- Playwright + Chromium (incl. OS libraries) ------------------------------
# Keep PLAYWRIGHT_VERSION in sync with "@playwright/test" in package.json.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npx -y playwright@${PLAYWRIGHT_VERSION} install --with-deps chromium \
    && chmod -R a+rX /ms-playwright \
    && rm -rf /root/.npm /var/lib/apt/lists/*

# --- Non-root user -------------------------------------------------------------
RUN groupadd --gid ${USER_GID} ${USERNAME} \
    && useradd --uid ${USER_UID} --gid ${USER_GID} -m -s /bin/bash ${USERNAME} \
    && echo "${USERNAME} ALL=(root) NOPASSWD:ALL" > /etc/sudoers.d/${USERNAME} \
    && chmod 0440 /etc/sudoers.d/${USERNAME}

USER ${USERNAME}

ENV UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/home/vscode/.venv \
    PATH="/home/vscode/.venv/bin:/home/vscode/.local/bin:${PATH}"

# --- Claude Code (native installer) ------------------------------------------
RUN curl -fsSL https://claude.ai/install.sh | bash

WORKDIR /workspace
