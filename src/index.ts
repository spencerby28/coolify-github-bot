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

function formatComment(deployment: CoolifyDeployment, baseUrl: string): string {
  const logLink = `${baseUrl}/deployments/${deployment.deployment_uuid}`;
  const statusEmoji = deployment.status === 'finished' ? '✅' : 
                      deployment.status === 'failed' ? '❌' : 
                      deployment.status === 'in_progress' ? '🔄' : '⏳';
  
  const lines = [
    '🚀 **Coolify deployment**',
    '',
    `${statusEmoji} **Status:** ${deployment.status}`,
  ];

  if (deployment.fqdn) {
    lines.push(`**URL:** ${deployment.fqdn}`);
  }

  lines.push(`**Logs:** ${logLink}`);

  return lines.join('\n');
}

async function findOrCreateComment(
  octokit: ReturnType<typeof github.getOctokit>,
  body: string
): Promise<void> {
  const { repo, issue } = github.context;
  
  if (!issue?.number) {
    throw new Error('No issue number found in context');
  }

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
    core.info(`Updated existing comment ${existing.id}`);
  } else {
    await octokit.rest.issues.createComment({
      ...repo,
      issue_number: issue.number,
      body,
    });
    core.info('Created new comment');
  }
}

async function run(): Promise<void> {
  try {
    const baseUrl = core.getInput('coolify_base_url', { required: true });
    const apiToken = core.getInput('coolify_api_token', { required: true });
    const appUuid = core.getInput('coolify_app_uuid', { required: true });
    const githubToken = core.getInput('github_token') || process.env.GITHUB_TOKEN || '';
    const commitSha = github.context.sha;

    if (!githubToken) {
      throw new Error('GitHub token is required. Provide github_token input or ensure GITHUB_TOKEN is set.');
    }

    core.info(`Looking for deployment with commit SHA: ${commitSha}`);

    const deployment = await getDeploymentForCommit(
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
    
    core.setOutput('found', 'true');
    core.setOutput('status', deployment.status);
    core.setOutput('url', deployment.fqdn || '');
    core.setOutput('log_link', `${baseUrl}/deployments/${deployment.deployment_uuid}`);

    const commentBody = formatComment(deployment, baseUrl);
    const octokit = github.getOctokit(githubToken);
    
    await findOrCreateComment(octokit, commentBody);
    
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed('Unknown error occurred');
    }
  }
}

run();

