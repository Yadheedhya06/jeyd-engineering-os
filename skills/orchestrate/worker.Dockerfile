FROM node:20-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates curl gnupg \
  && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
  && echo "deb [signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list \
  && apt-get update && apt-get install -y gh && rm -rf /var/lib/apt/lists/*
RUN corepack enable && npm install -g @anthropic-ai/claude-code
WORKDIR /work
# Auth at runtime: CLAUDE_CODE_OAUTH_TOKEN + GH_TOKEN env. Skills mounted read-only at /root/.claude/skills.
