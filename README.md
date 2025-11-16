# Coolify Deploy Bot

> Vercel-style deployment comments for your self-hosted Coolify deployments

Post beautiful, informative deployment status comments on your GitHub pull requests, just like Vercel or Netlify - but for your self-hosted [Coolify](https://coolify.io/) deployments.

## Features

- **Automated PR Comments**: Posts deployment status, preview URLs, and log links on every PR
- **GitHub Deployment Integration**: Updates GitHub's deployment status API
- **Always Up-to-Date**: Updates the same comment on each push, keeping your PR clean
- **Status Indicators**: Clear visual status with emojis (✅ Finished, ❌ Failed, ⏳ In Progress)
- **Direct Links**: Quick access to preview URLs and Coolify deployment logs

## What it does

This GitHub Action:

1. Queries the Coolify API for deployments matching your commit SHA
2. Posts/updates a comment on your PR with:
   - Deployment status (finished, failed, in progress, etc.)
   - Preview URL (if available)
   - Link to deployment logs in Coolify
3. Optionally updates GitHub's Deployment API for integration with other tools

## Example Comment

```markdown
## 🚀 Coolify Deployment

**Status:** ✅ Finished
**Preview URL:** https://pr-123.your-app.com
**Logs:** View deployment logs
```

## Prerequisites

1. **Coolify Instance**: You need a running Coolify instance with API access
2. **API Token**: Create one in Coolify under **Keys & Tokens → API tokens**
3. **Application UUID**: Find this in your Coolify application's URL or via the API

### Finding Your Application UUID

The UUID is in your Coolify application URL:
```
https://coolify.yourdomain.com/projects/[project-uuid]/[environment-uuid]/applications/[app-uuid]
```

Or get it via API:
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://coolify.yourdomain.com/api/v1/applications
```

## Installation

### 1. Add Repository Secrets

Go to your repository **Settings → Secrets and variables → Actions** and add:

| Secret Name | Description | Example |
|-------------|-------------|---------|
| `COOLIFY_BASE_URL` | Your Coolify instance URL | `https://coolify.yourdomain.com` |
| `COOLIFY_API_TOKEN` | API token from Coolify | `sk_...` |
| `COOLIFY_APP_UUID` | Your application's UUID | `abc123...` |

### 2. Create Workflow File

Create `.github/workflows/coolify-deployment.yml` in your repository:

```yaml
name: Coolify Deployment Status

on:
  pull_request:
    types: [opened, synchronize, reopened]
  push:
    branches:
      - main

jobs:
  deployment-status:
    runs-on: ubuntu-latest
    name: Update deployment status

    steps:
      - name: Check Coolify deployment
        uses: your-username/coolify-deploy-bot@v1
        with:
          coolify_base_url: ${{ secrets.COOLIFY_BASE_URL }}
          coolify_api_token: ${{ secrets.COOLIFY_API_TOKEN }}
          coolify_app_uuid: ${{ secrets.COOLIFY_APP_UUID }}
          github_token: ${{ secrets.GITHUB_TOKEN }}
```

### 3. Push and Test

Push to a branch and open a PR - you should see a deployment comment appear!

## Configuration

### Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `coolify_base_url` | Yes | - | Coolify instance base URL |
| `coolify_api_token` | Yes | - | Coolify API token |
| `coolify_app_uuid` | Yes | - | Application UUID in Coolify |
| `github_token` | Yes | `${{ github.token }}` | GitHub token for posting comments |
| `update_deployment` | No | `true` | Update GitHub Deployment API |

### Outputs

| Output | Description |
|--------|-------------|
| `found` | Whether a deployment was found (`true`/`false`) |
| `status` | Deployment status (e.g., `finished`, `failed`) |
| `url` | Deployed application URL |
| `log_link` | Link to deployment logs |
| `uuid` | Coolify deployment UUID |

## Advanced Usage

### Multiple Environments

Deploy to staging and production with different apps:

```yaml
jobs:
  staging:
    if: github.event.pull_request
    steps:
      - uses: your-username/coolify-deploy-bot@v1
        with:
          coolify_base_url: ${{ secrets.COOLIFY_BASE_URL }}
          coolify_api_token: ${{ secrets.COOLIFY_API_TOKEN }}
          coolify_app_uuid: ${{ secrets.COOLIFY_STAGING_UUID }}
          github_token: ${{ secrets.GITHUB_TOKEN }}

  production:
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: your-username/coolify-deploy-bot@v1
        with:
          coolify_base_url: ${{ secrets.COOLIFY_BASE_URL }}
          coolify_api_token: ${{ secrets.COOLIFY_API_TOKEN }}
          coolify_app_uuid: ${{ secrets.COOLIFY_PRODUCTION_UUID }}
          github_token: ${{ secrets.GITHUB_TOKEN }}
```

### Using Outputs

```yaml
steps:
  - name: Check deployment
    id: coolify
    uses: your-username/coolify-deploy-bot@v1
    with:
      coolify_base_url: ${{ secrets.COOLIFY_BASE_URL }}
      coolify_api_token: ${{ secrets.COOLIFY_API_TOKEN }}
      coolify_app_uuid: ${{ secrets.COOLIFY_APP_UUID }}
      github_token: ${{ secrets.GITHUB_TOKEN }}

  - name: Notify Slack
    if: steps.coolify.outputs.status == 'finished'
    run: |
      curl -X POST ${{ secrets.SLACK_WEBHOOK }} \
        -d '{"text":"Deployment finished: ${{ steps.coolify.outputs.url }}"}'
```

### Skip GitHub Deployment API

If you only want PR comments without GitHub Deployments:

```yaml
- uses: your-username/coolify-deploy-bot@v1
  with:
    coolify_base_url: ${{ secrets.COOLIFY_BASE_URL }}
    coolify_api_token: ${{ secrets.COOLIFY_API_TOKEN }}
    coolify_app_uuid: ${{ secrets.COOLIFY_APP_UUID }}
    github_token: ${{ secrets.GITHUB_TOKEN }}
    update_deployment: false
```

## How It Works

1. **Trigger**: The action runs on PR events or pushes to main
2. **Query Coolify**: Fetches recent deployments via `/api/v1/deployments/applications/{uuid}`
3. **Match Commit**: Finds the deployment matching `GITHUB_SHA`
4. **Update PR**: Creates or updates a single comment with deployment info
5. **GitHub Deployment**: (Optional) Updates GitHub's Deployment API

## Coolify API Reference

This action uses the following Coolify API endpoints:

- `GET /api/v1/deployments/applications/{uuid}` - List deployments for an application
- Returns: `git_commit_sha`, `status`, `fqdn`, `created_at`, etc.

See [Coolify API Documentation](https://coolify.io/docs/api) for details.

## Development

### Building Locally

```bash
# Install dependencies
npm install

# Build the action
npm run build

# This compiles src/index.ts to dist/index.js
```

### Project Structure

```
coolify-deploy-bot/
├── src/
│   └── index.ts          # Main action logic
├── dist/
│   └── index.js          # Compiled output (committed)
├── .github/
│   └── workflows/
│       └── coolify-deployment.yml  # Example workflow
├── action.yml            # Action metadata
├── package.json
├── tsconfig.json
└── README.md
```

### Publishing a New Version

1. Make changes to `src/index.ts`
2. Run `npm run build`
3. Commit both source and `dist/` changes
4. Create a new release with a tag (e.g., `v1.0.0`)
5. Update the major version tag (e.g., `v1`)

```bash
npm run build
git add dist src
git commit -m "Release v1.0.0"
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0
git tag -fa v1 -m "Update v1 tag"
git push origin v1 --force
```

## Troubleshooting

### No deployment found

**Issue**: Comment says "No deployment found for this commit"

**Solutions**:
- Verify the commit SHA matches between GitHub and Coolify
- Check that Coolify is configured to deploy this branch
- Ensure the `coolify_app_uuid` is correct

### API authentication failed

**Issue**: Error about authentication or 401/403 responses

**Solutions**:
- Verify `COOLIFY_API_TOKEN` is correct and not expired
- Check token has permissions to read deployments
- Ensure `COOLIFY_BASE_URL` is correct (no trailing slash)

### Comment not posting

**Issue**: Action runs but no comment appears

**Solutions**:
- Check `GITHUB_TOKEN` has `write` permissions for issues
- Add to workflow file:
  ```yaml
  permissions:
    pull-requests: write
    deployments: write
  ```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Build and test (`npm run build`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Acknowledgments

- Inspired by [Vercel's GitHub integration](https://vercel.com/docs/concepts/git/vercel-for-github)
- Built for [Coolify](https://coolify.io/), the amazing self-hosted Heroku/Netlify alternative
- Uses [@actions/github](https://github.com/actions/toolkit/tree/main/packages/github) for GitHub API interactions

## Related Projects

- [Coolify](https://github.com/coollabsio/coolify) - Self-hostable Heroku/Netlify alternative
- [Coolify Documentation](https://coolify.io/docs)
- [GitHub Actions Toolkit](https://github.com/actions/toolkit)

---

Made with ❤️ for the self-hosting community
