/**
 * Simple webhook receiver for Coolify → GitHub updates
 * 
 * This can be deployed as:
 * - Cloudflare Worker (recommended - free)
 * - Vercel Serverless Function
 * - Netlify Function
 * - Any Node.js server
 * 
 * Setup:
 * 1. Deploy this to a public URL
 * 2. Configure Coolify webhook to point to your URL
 * 3. Set GITHUB_TOKEN environment variable
 * 4. Webhook will automatically update GitHub comments
 */

import { Octokit } from '@octokit/rest';

interface CoolifyWebhookPayload {
  type: 'deployment.started' | 'deployment.finished' | 'deployment.failed';
  deployment: {
    uuid: string;
    commit: string;
    status: string;
    fqdn?: string;
    created_at: string;
    finished_at?: string;
  };
  application: {
    uuid: string;
    name: string;
  };
}

interface DeploymentInfo {
  deployment_uuid: string;
  github_deployment_id: number;
  commit_sha: string;
  is_production: boolean;
  repo: string;
  owner: string;
  issue_number?: number;
  comment_id?: number;
}

export async function handleWebhook(
  payload: CoolifyWebhookPayload,
  githubToken: string
): Promise<void> {
  const octokit = new Octokit({ auth: githubToken });
  
  // Extract deployment info from webhook
  const deploymentUuid = payload.deployment.uuid;
  
  // Find GitHub comment with this deployment UUID
  // We need to search GitHub comments for the hidden metadata
  // This is a simplified version - in production you'd want to cache this mapping
  
  // For now, we'll need the repo/owner/issue from somewhere
  // Option 1: Store in external KV/database
  // Option 2: Include in webhook payload (requires Coolify config)
  // Option 3: Search recent comments (less efficient)
  
  // TODO: Implement comment finding logic
  // This is a placeholder - you'd need to:
  // 1. Store deployment → GitHub mapping when action runs
  // 2. Lookup mapping here
  // 3. Update the comment
  
  console.log(`Received webhook for deployment ${deploymentUuid}`);
  console.log(`Status: ${payload.deployment.status}`);
}

// Example Express.js handler
export function createExpressHandler(githubToken: string) {
  return async (req: any, res: any) => {
    try {
      const payload: CoolifyWebhookPayload = req.body;
      await handleWebhook(payload, githubToken);
      res.json({ success: true });
    } catch (error) {
      console.error('Webhook error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

