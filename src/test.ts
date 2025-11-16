import { readFileSync } from 'fs';
import { join } from 'path';

// Load .env file
function loadEnv() {
  try {
    const envContent = readFileSync(join(process.cwd(), '.env'), 'utf-8');
    const env: Record<string, string> = {};
    
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        env[key.trim()] = valueParts.join('=').trim();
      }
    }
    
    return env;
  } catch (error) {
    console.error('Error loading .env file:', error);
    process.exit(1);
  }
}

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
  
  console.log(`🔍 Fetching deployments from: ${url}`);
  console.log(`   Looking for commit: ${commitSha}`);
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Coolify API error: ${response.status} ${response.statusText}\n${errorText}`);
  }

  const jsonData = await response.json() as { deployments?: CoolifyDeployment[]; count?: number };
  
  // Coolify API returns { deployments: [...], count: number }
  const deployments: CoolifyDeployment[] = jsonData.deployments || [];
  
  console.log(`📦 Found ${deployments.length} total deployments`);
  
  // Filter deployments by commit SHA and get the most recent one
  const matching = deployments
    .filter(d => d.commit === commitSha)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  if (matching.length === 0) {
    console.log(`❌ No deployments found for commit ${commitSha}`);
    console.log(`\nAvailable commits (last 5):`);
    deployments.slice(0, 5).forEach(d => {
      console.log(`   - ${d.commit.substring(0, 7)} (${d.status}) - ${d.created_at}`);
    });
    return null;
  }

  return matching[0];
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

async function main() {
  console.log('🧪 Testing Coolify GitHub Bot\n');
  
  const env = loadEnv();
  
  const baseUrl = env.COOLIFY_BASE_URL;
  const apiToken = env.COOLIFY_API_TOKEN;
  const appUuid = env.COOLIFY_APP_UUID;
  
  if (!baseUrl || !apiToken || !appUuid) {
    console.error('❌ Missing required environment variables:');
    console.error('   COOLIFY_BASE_URL:', baseUrl ? '✓' : '✗');
    console.error('   COOLIFY_API_TOKEN:', apiToken ? '✓' : '✗');
    console.error('   COOLIFY_APP_UUID:', appUuid ? '✓' : '✗');
    process.exit(1);
  }
  
  // Get current commit SHA (or use a test one)
  const commitSha = process.argv[2] || getCurrentCommitSha();
  
  if (!commitSha) {
    console.error('❌ No commit SHA provided. Usage: bun test [commit-sha]');
    console.error('   Or run from a git repository to auto-detect commit SHA');
    process.exit(1);
  }
  
  console.log(`📝 Testing with commit SHA: ${commitSha}\n`);
  
  try {
    const deployment = await getDeploymentForCommit(
      baseUrl,
      apiToken,
      appUuid,
      commitSha
    );
    
    if (!deployment) {
      console.log('\n✅ Test completed - No deployment found (this is OK if commit hasn\'t been deployed yet)');
      return;
    }
    
    console.log(`\n✅ Found deployment!`);
    console.log(`   UUID: ${deployment.deployment_uuid}`);
    console.log(`   Status: ${deployment.status}`);
    console.log(`   FQDN: ${deployment.fqdn || 'N/A'}`);
    console.log(`   Created: ${deployment.created_at}`);
    
    const comment = formatComment(deployment, baseUrl);
    console.log(`\n📝 Generated comment:`);
    console.log('─'.repeat(50));
    console.log(comment);
    console.log('─'.repeat(50));
    
    console.log('\n✅ Test completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

function getCurrentCommitSha(): string | null {
  try {
    const { execSync } = require('child_process');
    return execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return null;
  }
}

main();

