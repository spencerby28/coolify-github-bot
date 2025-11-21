# Webhook Support (No More Polling!)

## Current Status: Webhook-Ready Architecture

The action now supports **webhook mode** to eliminate polling! Here's what's implemented:

### ✅ What's Done

1. **Webhook Mode Support** - Action can exit early and let webhooks handle updates
2. **Deployment Metadata Storage** - Stores deployment info in GitHub comments for webhook receiver
3. **GitHub Deployments API** - Creates GitHub deployments for better integration
4. **Webhook Receiver Template** - Starter code for webhook receiver service

### 🚧 What's Needed

1. **Deploy Webhook Receiver** - Host the webhook receiver service
2. **Configure Coolify Webhook** - Point Coolify to your webhook URL
3. **Complete Mapping Storage** - Store deployment → GitHub comment mapping

## Quick Start

### Option 1: Use Polling (Current Default)

Works out of the box - no setup needed:

```yaml
- uses: spencerby28/coolify-github-bot@v1.0.0
  with:
    # ... your config
    # Polling is default (every 10s)
```

### Option 2: Enable Webhook Mode

1. Deploy webhook receiver (see `webhook-receiver/` folder)
2. Configure Coolify webhook URL
3. Set `use_webhooks: 'true'` in workflow

```yaml
- uses: spencerby28/coolify-github-bot@v1.0.0
  with:
    # ... your config
    use_webhooks: 'true'  # No polling!
```

## Architecture

```
┌─────────────┐      ┌──────────────────┐      ┌─────────────┐
│   Coolify   │─────▶│ Webhook Receiver │─────▶│   GitHub    │
│  (deploys)  │      │   (updates API)  │      │  (comments) │
└─────────────┘      └──────────────────┘      └─────────────┘
```

## Benefits

- ⚡ **Instant updates** - No 10 second polling delay
- 💰 **Cost efficient** - No constant API calls
- 🎯 **Better UX** - Comments update immediately

## Next Steps

See `WEBHOOK_GUIDE.md` for detailed setup instructions.

