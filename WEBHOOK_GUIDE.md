# Webhook Setup Guide

## Why Webhooks?

Instead of polling every 10 seconds, webhooks give you **instant updates** when deployments complete. Much better UX!

## Architecture

```
Coolify → Webhook Receiver → GitHub API → Updated Comment
```

## Option 1: Simple Webhook Receiver (Recommended)

### Step 1: Deploy Webhook Receiver

Deploy `webhook-receiver/index.ts` to:
- **Cloudflare Worker** (free, fast, recommended)
- **Vercel Serverless Function**
- **Netlify Function**
- Any Node.js server

### Step 2: Configure Coolify Webhook

In Coolify:
1. Go to your application settings
2. Add webhook URL: `https://your-webhook-receiver.workers.dev/webhook`
3. Select events: `deployment.finished`, `deployment.failed`
4. (Optional) Add webhook secret for verification

### Step 3: Update GitHub Action

Set `use_webhooks: true` in your workflow:

```yaml
- name: Coolify Deployment Status
  uses: spencerby28/coolify-github-bot@v1.0.0
  with:
    coolify_base_url: ${{ secrets.COOLIFY_BASE_URL }}
    coolify_api_token: ${{ secrets.COOLIFY_API_TOKEN }}
    coolify_app_uuid: ${{ secrets.COOLIFY_APP_UUID }}
    github_token: ${{ github.token }}
    use_webhooks: 'true'  # Enable webhook mode (no polling!)
```

## Option 2: Keep Polling (Current Default)

If you don't want to set up webhooks, polling still works:
- Set `use_webhooks: false` or omit it
- Action will poll every 10 seconds until completion

## Implementation Status

⚠️ **Webhook receiver is a work in progress**

Current status:
- ✅ Action supports webhook mode (exits early, doesn't poll)
- ✅ Stores deployment metadata in comments
- 🚧 Webhook receiver needs deployment mapping storage
- 🚧 Comment lookup/finding logic needed

## Next Steps

1. Choose webhook receiver hosting (Cloudflare Worker recommended)
2. Implement deployment → GitHub mapping storage (KV store, database, etc.)
3. Complete webhook receiver implementation
4. Deploy and configure Coolify webhook

## Benefits

- ⚡ **Instant updates** - No 10 second delay
- 💰 **Cost efficient** - No constant polling
- 🎯 **Better UX** - Comments update immediately when deployment completes

