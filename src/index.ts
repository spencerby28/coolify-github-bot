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
  isProduction: boolean = false
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

  return lines.join('\n');
}

async function findOrCreateComment(
  octokit: ReturnType<typeof github.getOctokit>,
  body: string
): Promise<void> {
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
    } else {
      await octokit.rest.issues.createComment({
        ...repo,
        issue_number: issue.number,
        body,
      });
      core.info('Created new PR comment');
    }
    return;
  }
  
  // For push events, comment on the commit
  // Note: We can't update commit comments, so we create a new one each time
  // GitHub will show multiple comments, but that's acceptable for status updates
  if (eventName === 'push') {
    const { sha } = github.context;
    await octokit.rest.repos.createCommitComment({
      ...repo,
      commit_sha: sha,
      body,
    });
    core.info(`Created commit comment for ${sha}`);
    return;
  }
  
  core.warning('No PR or push event detected, skipping comment');
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
      await findOrCreateComment(octokit, commentBody);
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
    
    // Post initial comment
    const initialCommentBody = formatComment(deployment, baseUrl, appUuid, isProduction);
    await findOrCreateComment(octokit, initialCommentBody);
    
    // If deployment is already complete, we're done
    const isTerminal = deployment.status === 'finished' || deployment.status === 'failed';
    if (isTerminal) {
      core.info(`Deployment already completed with status: ${deployment.status}`);
    } else {
      // Poll until completion
      core.info(`Deployment in progress. Polling every ${pollInterval}s (timeout: ${timeoutMinutes}min)...`);
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
    }
    
    // Set final outputs
    core.setOutput('found', 'true');
    core.setOutput('status', deployment.status);
    core.setOutput('url', deployment.fqdn || '');
    core.setOutput('log_link', `${baseUrl}/deployments/${deployment.deployment_uuid}`);
    
    // Final comment update (in case status changed during last poll)
    const finalCommentBody = formatComment(deployment, baseUrl, appUuid, isProduction);
    await findOrCreateComment(octokit, finalCommentBody);
    
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed('Unknown error occurred');
    }
  }
}

run();

