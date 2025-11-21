# Webhook Setup Guide

## Architecture

Instead of polling every 10 seconds, we'll use Coolify webhooks to get instant updates:

1. **Webhook Receiver Service** - Receives webhooks from Coolify
2. **GitHub API** - Updates comments when webhook received
3. **Mapping Storage** - Stores deployment_uuid → GitHub comment info

## Option 1: Cloudflare Worker (Recommended - Free & Fast)

### Setup

1. Create a Cloudflare Worker
2. Configure Coolify webhook to point to your worker URL
3. Worker receives webhook → Updates GitHub comment

### Implementation

See `webhook-receiver/cloudflare-worker.ts` for the implementation.

## Option 2: GitHub repository_dispatch

1. Create webhook receiver (any hosting)
2. On webhook → Trigger GitHub `repository_dispatch` event
3. GitHub workflow handles the update

## Option 3: Serverless Function (Vercel/Netlify)

Similar to Cloudflare Worker but hosted on Vercel/Netlify.

## Coolify Webhook Configuration

In Coolify, set up webhook:
- URL: Your webhook receiver endpoint
- Events: `deployment.started`, `deployment.finished`, `deployment.failed`
- Secret: (optional) for verification

## Next Steps

1. Implement webhook receiver
2. Store deployment → GitHub mapping
3. Update GitHub comments on webhook events
4. Make polling optional/fallback

