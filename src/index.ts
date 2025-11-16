import * as core from '@actions/core';
import * as github from '@actions/github';

interface CoolifyDeployment {
  uuid: string;
  git_commit_sha: string;
  status: string;
  fqdn?: string;
  created_at: string;
  updated_at: string;
}

interface DeploymentInfo {
  status: string;
  url: string;
  logLink: string;
  uuid: string;
}

/**
 * Fetch deployments from Coolify API for a specific application
 */
async function fetchDeployments(
  baseUrl: string,
  apiToken: string,
  appUuid: string,
  take: number = 20
): Promise<CoolifyDeployment[]> {
  const url = `${baseUrl}/api/v1/deployments/applications/${appUuid}?take=${take}`;

  core.info(`Fetching deployments from: ${url}`);

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch deployments: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();

  // Handle both array response and object with data property
  const deployments = Array.isArray(data) ? data : (data.data || []);

  core.info(`Found ${deployments.length} deployments`);
  return deployments;
}

/**
 * Find deployment matching the given commit SHA
 */
function findDeploymentForCommit(
  deployments: CoolifyDeployment[],
  commitSha: string
): CoolifyDeployment | null {
  // Sort by created_at descending (most recent first)
  const sorted = [...deployments].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  // Find the most recent deployment matching this commit
  const match = sorted.find(d => d.git_commit_sha === commitSha);

  if (match) {
    core.info(`Found matching deployment: ${match.uuid} (status: ${match.status})`);
  } else {
    core.info(`No deployment found for commit: ${commitSha}`);
  }

  return match || null;
}

/**
 * Format deployment status with emoji
 */
function formatStatus(status: string): string {
  const statusMap: Record<string, string> = {
    'finished': '✅ Finished',
    'success': '✅ Success',
    'failed': '❌ Failed',
    'error': '❌ Error',
    'in_progress': '⏳ In Progress',
    'queued': '⏸️ Queued',
    'cancelled': '🚫 Cancelled',
  };

  return statusMap[status.toLowerCase()] || `🔵 ${status}`;
}

/**
 * Create or update PR comment with deployment info
 */
async function updatePRComment(
  octokit: ReturnType<typeof github.getOctokit>,
  info: DeploymentInfo
): Promise<void> {
  const context = github.context;

  if (!context.payload.pull_request) {
    core.warning('Not a pull request event, skipping comment');
    return;
  }

  const { owner, repo } = context.repo;
  const issueNumber = context.payload.pull_request.number;

  // Build comment body
  const lines = [
    '## 🚀 Coolify Deployment',
    '',
    `**Status:** ${formatStatus(info.status)}`,
  ];

  if (info.url) {
    lines.push(`**Preview URL:** ${info.url}`);
  }

  lines.push(`**Logs:** [View deployment logs](${info.logLink})`);
  lines.push('');
  lines.push(`<!-- coolify-bot-comment -->`);

  const body = lines.join('\n');

  // Find existing comment from this bot
  const { data: comments } = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: issueNumber,
  });

  const botComment = comments.find(
    comment => comment.body?.includes('<!-- coolify-bot-comment -->')
  );

  if (botComment) {
    core.info(`Updating existing comment: ${botComment.id}`);
    await octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: botComment.id,
      body,
    });
  } else {
    core.info('Creating new comment');
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body,
    });
  }
}

/**
 * Update GitHub deployment status
 */
async function updateGitHubDeployment(
  octokit: ReturnType<typeof github.getOctokit>,
  info: DeploymentInfo,
  commitSha: string
): Promise<void> {
  const context = github.context;
  const { owner, repo } = context.repo;

  try {
    // Create or find existing deployment
    const { data: deployments } = await octokit.rest.repos.listDeployments({
      owner,
      repo,
      sha: commitSha,
      environment: 'production',
    });

    let deploymentId: number;

    if (deployments.length > 0) {
      deploymentId = deployments[0].id;
      core.info(`Found existing GitHub deployment: ${deploymentId}`);
    } else {
      const { data: deployment } = await octokit.rest.repos.createDeployment({
        owner,
        repo,
        ref: commitSha,
        environment: 'production',
        auto_merge: false,
        required_contexts: [],
      });

      deploymentId = deployment.id;
      core.info(`Created new GitHub deployment: ${deploymentId}`);
    }

    // Map Coolify status to GitHub deployment status
    let state: 'error' | 'failure' | 'pending' | 'in_progress' | 'queued' | 'success';

    switch (info.status.toLowerCase()) {
      case 'finished':
      case 'success':
        state = 'success';
        break;
      case 'failed':
      case 'error':
        state = 'failure';
        break;
      case 'in_progress':
        state = 'in_progress';
        break;
      case 'queued':
        state = 'queued';
        break;
      default:
        state = 'pending';
    }

    // Create deployment status
    await octokit.rest.repos.createDeploymentStatus({
      owner,
      repo,
      deployment_id: deploymentId,
      state,
      log_url: info.logLink,
      environment_url: info.url || undefined,
      description: `Coolify deployment ${info.status}`,
    });

    core.info(`Updated GitHub deployment status to: ${state}`);
  } catch (error) {
    core.warning(`Failed to update GitHub deployment: ${error}`);
  }
}

/**
 * Main action logic
 */
async function run(): Promise<void> {
  try {
    // Get inputs
    const coolifyBaseUrl = core.getInput('coolify_base_url', { required: true });
    const coolifyApiToken = core.getInput('coolify_api_token', { required: true });
    const coolifyAppUuid = core.getInput('coolify_app_uuid', { required: true });
    const githubToken = core.getInput('github_token', { required: true });
    const updateDeployment = core.getBooleanInput('update_deployment', { required: false });

    // Get commit SHA from context
    const commitSha = github.context.sha;
    core.info(`Looking for deployment of commit: ${commitSha}`);

    // Fetch deployments from Coolify
    const deployments = await fetchDeployments(
      coolifyBaseUrl,
      coolifyApiToken,
      coolifyAppUuid
    );

    // Find deployment for this commit
    const deployment = findDeploymentForCommit(deployments, commitSha);

    if (!deployment) {
      core.setOutput('found', 'false');
      core.warning('No deployment found for this commit');
      return;
    }

    // Prepare deployment info
    const info: DeploymentInfo = {
      status: deployment.status,
      url: deployment.fqdn || '',
      logLink: `${coolifyBaseUrl}/deployments/${deployment.uuid}`,
      uuid: deployment.uuid,
    };

    core.setOutput('found', 'true');
    core.setOutput('status', info.status);
    core.setOutput('url', info.url);
    core.setOutput('log_link', info.logLink);
    core.setOutput('uuid', info.uuid);

    // Initialize Octokit
    const octokit = github.getOctokit(githubToken);

    // Update PR comment
    await updatePRComment(octokit, info);

    // Update GitHub deployment if enabled
    if (updateDeployment) {
      await updateGitHubDeployment(octokit, info, commitSha);
    }

    core.info('✅ Successfully updated deployment status');
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed('An unknown error occurred');
    }
  }
}

run();
