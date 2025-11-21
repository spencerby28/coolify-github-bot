/**
 * Cloudflare Worker to receive Coolify webhooks and update GitHub comments
 * 
 * Deploy: wrangler deploy
 * 
 * Environment variables needed:
 * - GITHUB_TOKEN: GitHub personal access token with repo permissions
 * - WEBHOOK_SECRET: (optional) Secret to verify webhook authenticity
 */

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

interface DeploymentMapping {
  deployment_uuid: string;
  github_repo: string;
  github_owner: string;
  comment_id?: number;
  issue_number?: number;
  commit_sha: string;
  is_production: boolean;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      const payload: CoolifyWebhookPayload = await request.json();
      
      // Verify webhook secret if configured
      if (env.WEBHOOK_SECRET) {
        const signature = request.headers.get('X-Coolify-Signature');
        // Add signature verification logic here
      }

      // Get deployment mapping from KV store
      const mappingKey = `deployment:${payload.deployment.uuid}`;
      const mappingJson = await env.DEPLOYMENT_MAPPINGS.get(mappingKey);
      
      if (!mappingJson) {
        console.log(`No mapping found for deployment ${payload.deployment.uuid}`);
        return new Response('No mapping found', { status: 404 });
      }

      const mapping: DeploymentMapping = JSON.parse(mappingJson);

      // Update GitHub comment
      await updateGitHubComment(payload, mapping, env.GITHUB_TOKEN);

      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      console.error('Webhook error:', error);
      return new Response(
        JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  },
};

async function updateGitHubComment(
  payload: CoolifyWebhookPayload,
  mapping: DeploymentMapping,
  githubToken: string
): Promise<void> {
  const [owner, repo] = mapping.github_repo.split('/');
  const octokit = new (await import('@octokit/rest')).Octokit({ auth: githubToken });

  const commentBody = formatComment(payload.deployment, mapping);

  if (mapping.issue_number && mapping.comment_id) {
    // Update existing PR comment
    await octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: mapping.comment_id,
      body: commentBody,
    });
  } else if (mapping.issue_number) {
    // Create new PR comment
    const { data: comment } = await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: mapping.issue_number,
      body: commentBody,
    });
    
    // Store comment_id for future updates
    // (Would need to update KV store here)
  } else {
    // Create commit comment for push events
    await octokit.rest.repos.createCommitComment({
      owner,
      repo,
      commit_sha: mapping.commit_sha,
      body: commentBody,
    });
  }
}

function formatComment(deployment: any, mapping: DeploymentMapping): string {
  const baseUrl = process.env.COOLIFY_BASE_URL || 'https://coolify.sb28.xyz';
  const logLink = `${baseUrl}/deployments/${deployment.uuid}`;
  const deploymentPageLink = `${baseUrl}/deployments/${deployment.uuid}`;
  
  const statusEmoji = deployment.status === 'finished' ? '✅' : 
                      deployment.status === 'failed' ? '❌' : 
                      deployment.status === 'in_progress' ? '🔄' : '⏳';
  
  const lines = [
    '🚀 **Coolify deployment**',
    '',
    `${statusEmoji} **Status:** ${deployment.status}`,
  ];

  if (deployment.status === 'finished' && deployment.fqdn) {
    const urlLabel = mapping.is_production ? '🌐 **Production URL**' : '🔗 **Preview URL**';
    lines.push('');
    lines.push(`${urlLabel}: [${deployment.fqdn}](${deployment.fqdn})`);
  }

  lines.push('');
  lines.push(`📋 [View Build Logs](${logLink})`);

  if (deployment.status === 'failed') {
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('### 🔄 Retry Deployment');
    lines.push('');
    lines.push(`[🔄 Retry Deployment](${deploymentPageLink}) | [📋 View Logs](${logLink})`);
  }

  return lines.join('\n');
}

interface Env {
  GITHUB_TOKEN: string;
  WEBHOOK_SECRET?: string;
  DEPLOYMENT_MAPPINGS: KVNamespace;
  COOLIFY_BASE_URL?: string;
}

