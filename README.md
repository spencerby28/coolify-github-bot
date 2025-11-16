# Coolify GitHub Bot

🚀 **Vercel-style PR comments for deployments, but using your self-hosted Coolify.**

This GitHub Action automatically comments on pull requests with deployment status, preview URLs, and log links from your Coolify instance.

## What it does

- Queries the Coolify API to find deployments matching the PR's commit SHA
- Posts or updates a single comment on the PR with:
  - Deployment status (✅ finished, ❌ failed, 🔄 in_progress)
  - Preview URL (if available)
  - Link to deployment logs in Coolify
- Works entirely externally to Coolify—no webhook configuration needed

## Prerequisites

- A Coolify instance with API access enabled
- A Coolify API token (created in **Keys & Tokens → API tokens**)
- The UUID of your application in Coolify

### Finding your Application UUID

The UUID can be found in:
- The URL when viewing your application in Coolify: `/applications/{uuid}`
- Or by calling the Coolify API: `GET /api/v1/applications`

## Installation

### Step 1: Add Repository Secrets

In your GitHub repository, go to **Settings → Secrets and variables → Actions** and add:

- `COOLIFY_BASE_URL` - Your Coolify instance URL (e.g., `https://coolify.yourdomain.com`)
- `COOLIFY_API_TOKEN` - Your Coolify API token
- `COOLIFY_APP_UUID` - Your application's UUID

### Step 2: Create Workflow

Create `.github/workflows/coolify-status.yml`:

```yaml
name: Coolify Deployment Status

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  coolify-status:
    runs-on: ubuntu-latest
    permissions:
      issues: write
      pull-requests: write
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Coolify Deployment Status
        uses: spencerby28/coolify-github-bot@v1.0.0
        with:
          coolify_base_url: ${{ secrets.COOLIFY_BASE_URL }}
          coolify_api_token: ${{ secrets.COOLIFY_API_TOKEN }}
          coolify_app_uuid: ${{ secrets.COOLIFY_APP_UUID }}
          github_token: ${{ github.token }}
          # Optional: poll_interval: 10  # seconds between polls (default: 10)
          # Optional: timeout_minutes: 30  # max wait time (default: 30)
```

**Note:** Use `@v1.0.0` for a specific version, or `@main` for the latest from main branch.

The action will automatically wait for deployment completion and update the comment as status changes.

## Options

### Using with Multiple Environments

You can run the action multiple times for different environments:

```yaml
jobs:
  staging:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: spencerby28/coolify-github-bot@v1.0.0
        with:
          coolify_base_url: ${{ secrets.COOLIFY_BASE_URL }}
          coolify_api_token: ${{ secrets.COOLIFY_API_TOKEN }}
          coolify_app_uuid: ${{ secrets.COOLIFY_APP_UUID_STAGING }}

  production:
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: spencerby28/coolify-github-bot@v1.0.0
        with:
          coolify_base_url: ${{ secrets.COOLIFY_BASE_URL }}
          coolify_api_token: ${{ secrets.COOLIFY_API_TOKEN }}
          coolify_app_uuid: ${{ secrets.COOLIFY_APP_UUID_PRODUCTION }}
```

### Triggering on Push Events

To also check deployments on push to main:

```yaml
on:
  pull_request:
    types: [opened, synchronize, reopened]
  push:
    branches: [main]
```

Note: For push events, you'll need to use a different approach for comments (e.g., commit comments or deployment status API).

## How it works

1. **Trigger**: Runs on PR open, update, reopen, or push to main
2. **Initial Check**: Queries Coolify API for deployments matching the commit SHA
3. **Post Comment**: Creates initial comment with current deployment status
4. **Polling**: If deployment is in progress, polls every 10 seconds (configurable) until completion
5. **Update Comment**: Updates the comment as status changes (in_progress → finished/failed)
6. **Completion**: Action completes when deployment reaches terminal state (finished/failed) or timeout

The action will wait up to 30 minutes (configurable) for deployment completion, updating the comment as the status changes.

## Outputs

The action sets these outputs:

- `found` - `true` if a deployment was found, `false` otherwise
- `status` - Deployment status (e.g., `finished`, `failed`, `in_progress`)
- `url` - Deployed application URL (fqdn)
- `log_link` - Link to deployment logs in Coolify

Example usage:

```yaml
- name: Coolify Deployment Status
  id: coolify
  uses: yourusername/coolify-github-bot@v1
  with:
    coolify_base_url: ${{ secrets.COOLIFY_BASE_URL }}
    coolify_api_token: ${{ secrets.COOLIFY_API_TOKEN }}
    coolify_app_uuid: ${{ secrets.COOLIFY_APP_UUID }}

- name: Use deployment info
  if: steps.coolify.outputs.found == 'true'
  run: |
    echo "Status: ${{ steps.coolify.outputs.status }}"
    echo "URL: ${{ steps.coolify.outputs.url }}"
```

## Quick Start

1. Add the three secrets to your repository (see Installation above)
2. Create `.github/workflows/coolify-status.yml` with the workflow above
3. Create a PR - the action will automatically comment with deployment status!

## Development

### Building

```bash
bun install
bun run package
```

This builds the TypeScript source to `dist/index.js` using `@vercel/ncc`.

### Testing Locally

Use the included test script:

```bash
bun run test [commit-sha]
```

Or test with your current git commit:
```bash
bun run test
```

## License

MIT
