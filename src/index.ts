import * as core from '@actions/core';
import * as github from '@actions/github';

interface CoolifyDeployment {
  deployment_uuid: string;
  commit: string;
  status: string;
  fqdn?: string;
  created_at: string;
  finished_at?: string;
}


async function getDeploymentForCommit(
  baseUrl: string,
  apiToken: string,
  appUuid: string,
  commitSha: string
): Promise<CoolifyDeployment | null> {
  const url = `${baseUrl}/api/v1/deployments/applications/${appUuid}?take=20`;
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Coolify API error: ${response.status} ${response.statusText}`);
  }

  const jsonData = await response.json() as { deployments?: CoolifyDeployment[]; count?: number };
  
  // Coolify API returns { deployments: [...], count: number }
  const deployments: CoolifyDeployment[] = jsonData.deployments || [];
  
  // Filter deployments by commit SHA and get the most recent one
  const matching = deployments
    .filter(d => d.commit === commitSha)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return matching.length > 0 ? matching[0] : null;
}

function formatComment(
  deployment: CoolifyDeployment, 
  baseUrl: string, 
  appUuid: string,
  isProduction: boolean = false,
  deploymentInfo?: { 
    deployment_uuid: string; 
    github_deployment_id: number; 
    commit_sha: string; 
    is_production: boolean;
    repo: string;
    owner: string;
    issue_number?: number;
  }
): string {
  const logLink = `${baseUrl}/deployments/${deployment.deployment_uuid}`;
  // Construct deployment page URL - users can retry from there
  const deploymentPageLink = `${baseUrl}/deployments/${deployment.deployment_uuid}`;
  
  const statusEmoji = deployment.status === 'finished' ? '✅' : 
                      deployment.status === 'failed' ? '❌' : 
                      deployment.status === 'in_progress' ? '🔄' : '⏳';
  
  const lines = [
    '🚀 **Coolify deployment**',
    '',
    `${statusEmoji} **Status:** ${deployment.status}`,
  ];

  // Show URL prominently on success
  if (deployment.status === 'finished' && deployment.fqdn) {
    const urlLabel = isProduction ? '🌐 **Production URL**' : '🔗 **Preview URL**';
    lines.push('');
    lines.push(`${urlLabel}: [${deployment.fqdn}](${deployment.fqdn})`);
  } else if (deployment.fqdn) {
    // Show URL for in-progress or other states
    lines.push(`**URL:** ${deployment.fqdn}`);
  }

  lines.push('');
  lines.push(`📋 [View Build Logs](${logLink})`);

  // Add retry button on failure
  if (deployment.status === 'failed') {
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('### 🔄 Retry Deployment');
    lines.push('');
    lines.push(`[🔄 Retry Deployment](${deploymentPageLink}) | [📋 View Logs](${logLink})`);
    lines.push('');
    lines.push('_Click "Retry Deployment" to redeploy this commit in Coolify._');
  }

  // Add timestamp
  if (deployment.finished_at) {
    const finishedDate = new Date(deployment.finished_at);
    lines.push('');
    lines.push(`<sub>Last updated: ${finishedDate.toLocaleString()}</sub>`);
  } else {
    const createdDate = new Date(deployment.created_at);
    lines.push('');
    lines.push(`<sub>Last updated: ${createdDate.toLocaleString()}</sub>`);
  }

  // Add hidden metadata for webhook receiver (if provided)
  if (deploymentInfo) {
    lines.push('');
    lines.push(`<!-- coolify-webhook:${JSON.stringify(deploymentInfo)} -->`);
  }

  return lines.join('\n');
}

async function updateDeploymentStatus(
  octokit: ReturnType<typeof github.getOctokit>,
  deploymentId: number,
  state: 'success' | 'failure' | 'in_progress' | 'queued',
  deployment: CoolifyDeployment,
  baseUrl: string
): Promise<void> {
  const { repo } = github.context;
  const logUrl = `${baseUrl}/deployments/${deployment.deployment_uuid}`;
  
  await octokit.rest.repos.createDeploymentStatus({
    ...repo,
    deployment_id: deploymentId,
    state,
    log_url: logUrl,
    description: `Coolify deployment ${deployment.status}`,
    environment_url: deployment.fqdn,
  });
}

async function findOrCreateComment(
  octokit: ReturnType<typeof github.getOctokit>,
  body: string
): Promise<{ id: number } | null> {
  const { repo, issue, eventName } = github.context;
  
  // For pull requests, comment on the PR
  if (issue?.number) {
    const { data: comments } = await octokit.rest.issues.listComments({
      ...repo,
      issue_number: issue.number,
    });

    const existing = comments.find(
      c => c.user?.type === 'Bot' && c.body?.startsWith('🚀 **Coolify deployment**')
    );

    if (existing) {
      await octokit.rest.issues.updateComment({
        ...repo,
        comment_id: existing.id,
        body,
      });
      core.info(`Updated existing PR comment ${existing.id}`);
      return { id: existing.id };
    } else {
      const { data: comment } = await octokit.rest.issues.createComment({
        ...repo,
        issue_number: issue.number,
        body,
      });
      core.info('Created new PR comment');
      return { id: comment.id };
    }
  }
  
  // For push events, comment on the commit
  // Note: We can't update commit comments, so we create a new one each time
  // GitHub will show multiple comments, but that's acceptable for status updates
  if (eventName === 'push') {
    const { sha } = github.context;
    const { data: comment } = await octokit.rest.repos.createCommitComment({
      ...repo,
      commit_sha: sha,
      body,
    });
    core.info(`Created commit comment for ${sha}`);
    return { id: comment.id };
  }
  
  core.warning('No PR or push event detected, skipping comment');
  return null;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function pollUntilComplete(
  baseUrl: string,
  apiToken: string,
  appUuid: string,
  commitSha: string,
  deploymentUuid: string,
  octokit: ReturnType<typeof github.getOctokit>,
  isProduction: boolean,
  pollIntervalSeconds: number = 10,
  timeoutMinutes: number = 30
): Promise<CoolifyDeployment> {
  const timeoutMs = timeoutMinutes * 60 * 1000;
  const pollIntervalMs = pollIntervalSeconds * 1000;
  const startTime = Date.now();
  let lastStatus = '';
  
  while (true) {
    const deployment = await getDeploymentForCommit(baseUrl, apiToken, appUuid, commitSha);
    
    if (!deployment || deployment.deployment_uuid !== deploymentUuid) {
      throw new Error('Deployment not found or changed during polling');
    }
    
    const status = deployment.status;
    const isTerminal = status === 'finished' || status === 'failed';
    
    // Update comment if status changed
    // For push events, this will create a new comment each time (can't update commit comments)
    if (status !== lastStatus) {
      core.info(`Deployment status changed: ${lastStatus || 'initial'} → ${status}`);
      const commentBody = formatComment(deployment, baseUrl, appUuid, isProduction);
      await findOrCreateComment(octokit, commentBody).catch(() => null);
      lastStatus = status;
    }
    
    // Check if deployment is complete
    if (isTerminal) {
      core.info(`Deployment completed with status: ${status}`);
      return deployment;
    }
    
    // Check timeout
    const elapsed = Date.now() - startTime;
    if (elapsed >= timeoutMs) {
      core.warning(`Timeout reached (${timeoutMinutes} minutes). Deployment still in progress.`);
      return deployment;
    }
    
    // Wait before next poll
    core.info(`Deployment still in progress (${status}). Waiting ${pollIntervalSeconds}s before next check...`);
    await sleep(pollIntervalMs);
  }
}

async function run(): Promise<void> {
  try {
    const baseUrl = core.getInput('coolify_base_url', { required: true });
    const apiToken = core.getInput('coolify_api_token', { required: true });
    const appUuid = core.getInput('coolify_app_uuid', { required: true });
    const pollInterval = parseInt(core.getInput('poll_interval') || '10', 10);
    const timeoutMinutes = parseInt(core.getInput('timeout_minutes') || '30', 10);
    
    // Get GitHub token from input, env var, or use empty string (will use default from @actions/github)
    const githubTokenInput = core.getInput('github_token');
    const githubTokenEnv = process.env.GITHUB_TOKEN;
    const githubToken = githubTokenInput || githubTokenEnv || '';
    
    const commitSha = github.context.sha;

    if (!githubToken) {
      core.warning('GitHub token not provided. This may cause issues posting comments.');
      core.warning('Please ensure GITHUB_TOKEN is available or pass github_token input.');
    }

    core.info(`Looking for deployment with commit SHA: ${commitSha}`);

    // Always pass a token - use provided one or fallback to env var (should always be available in GitHub Actions)
    const tokenToUse = githubToken || process.env.GITHUB_TOKEN || '';
    if (!tokenToUse) {
      throw new Error('GitHub token is required. Please ensure GITHUB_TOKEN is available in your workflow.');
    }
    const octokit = github.getOctokit(tokenToUse);

    // Initial check for deployment
    let deployment = await getDeploymentForCommit(
      baseUrl,
      apiToken,
      appUuid,
      commitSha
    );

    if (!deployment) {
      core.info('No deployment found for this commit');
      core.setOutput('found', 'false');
      return;
    }

    core.info(`Found deployment: ${deployment.deployment_uuid} with status: ${deployment.status}`);
    
    // Determine if this is a production deployment (push to main) or preview (PR)
    const { ref, eventName } = github.context;
    const isProduction = eventName === 'push' && (ref === 'refs/heads/main' || ref === 'refs/heads/master');
    
    // Create GitHub Deployment for webhook support (optional - may fail if deployment already exists)
    const environment = isProduction ? 'production' : 'preview';
    let githubDeploymentId: number | null = null;
    
    try {
      const deploymentResponse = await octokit.rest.repos.createDeployment({
        ...github.context.repo,
        ref: commitSha,
        environment,
        description: `Coolify deployment: ${deployment.deployment_uuid}`,
        auto_merge: false,
        required_contexts: [],
      });
      
      // Check if response is a deployment object (not an error)
      if ('id' in deploymentResponse.data) {
        githubDeploymentId = deploymentResponse.data.id;
      }
    } catch (error) {
      core.warning('Could not create GitHub deployment (may already exist)');
    }

    // Store deployment mapping in comment for webhook receiver
    const deploymentInfo = {
      deployment_uuid: deployment.deployment_uuid,
      github_deployment_id: githubDeploymentId || 0,
      commit_sha: commitSha,
      is_production: isProduction,
      repo: github.context.repo.repo,
      owner: github.context.repo.owner,
      issue_number: github.context.issue?.number,
    };

    // Post initial comment with deployment info
    const initialCommentBody = formatComment(deployment, baseUrl, appUuid, isProduction, deploymentInfo);
    const comment = await findOrCreateComment(octokit, initialCommentBody);
    
    // Update deployment status (if deployment was created)
    if (githubDeploymentId) {
      await updateDeploymentStatus(
        octokit,
        githubDeploymentId,
        deployment.status === 'finished' ? 'success' : 
        deployment.status === 'failed' ? 'failure' : 'in_progress',
        deployment,
        baseUrl
      ).catch(err => core.warning(`Failed to update deployment status: ${err}`));
    }

    // Check if we should use webhooks (no polling) or fallback to polling
    const useWebhooks = core.getInput('use_webhooks') === 'true';
    
    // If deployment is already complete, we're done
    const isTerminal = deployment.status === 'finished' || deployment.status === 'failed';
    if (isTerminal) {
      core.info(`Deployment already completed with status: ${deployment.status}`);
    } else if (useWebhooks) {
      // Webhook mode: Just wait briefly and exit - webhook will update comment
      core.info('Webhook mode enabled. Waiting for webhook to update status...');
      core.info(`Webhook URL: Set this in Coolify: ${core.getInput('webhook_url') || 'Not configured'}`);
      core.info('Deployment registered. Webhook will update status when complete.');
      // Exit early - webhook will handle updates
    } else {
      // Polling mode (fallback)
      core.info(`Polling mode: Checking every ${pollInterval}s (timeout: ${timeoutMinutes}min)...`);
      deployment = await pollUntilComplete(
        baseUrl,
        apiToken,
        appUuid,
        commitSha,
        deployment.deployment_uuid,
        octokit,
        isProduction,
        pollInterval,
        timeoutMinutes
      );
      
      // Update final status (if deployment was created)
      if (githubDeploymentId) {
        await updateDeploymentStatus(
          octokit,
          githubDeploymentId,
          deployment.status === 'finished' ? 'success' : 'failure',
          deployment,
          baseUrl
        ).catch(err => core.warning(`Failed to update deployment status: ${err}`));
      }
    }
    
    // Set final outputs
    core.setOutput('found', 'true');
    core.setOutput('status', deployment.status);
    core.setOutput('url', deployment.fqdn || '');
    core.setOutput('log_link', `${baseUrl}/deployments/${deployment.deployment_uuid}`);
    
    // Final comment update (in case status changed during last poll)
    const finalCommentBody = formatComment(deployment, baseUrl, appUuid, isProduction, deploymentInfo);
    await findOrCreateComment(octokit, finalCommentBody).catch(() => null);
    
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed('Unknown error occurred');
    }
  }
}

run();

