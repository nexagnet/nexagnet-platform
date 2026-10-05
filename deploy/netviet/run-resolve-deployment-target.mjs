/**
 * CLI wrapper the deploy workflow runs. Keeps the workflow YAML down to one `node` line, so the
 * logic above it is testable and the step is not a place where new rules quietly accumulate.
 *
 * Reads: REQUESTED_TENANT, REQUESTED_ENVIRONMENT, and optionally WORKFLOW_ENGINE /
 * OBSERVABILITY_STACK (`on`/`off`) plus DEPLOYMENT_REGISTRY_PATH and GITHUB_OUTPUT.
 */

import { appendFileSync, readFileSync } from 'node:fs';

import {
  DeploymentResolutionError,
  resolveDeploymentTarget,
  toStepOutputs,
} from './resolve-deployment-target.mjs';

const registryPath = process.env.DEPLOYMENT_REGISTRY_PATH ?? '.github/deployment-targets.json';

try {
  const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
  const plan = resolveDeploymentTarget(
    registry,
    { tenant: process.env.REQUESTED_TENANT, environment: process.env.REQUESTED_ENVIRONMENT },
    {
      workflowEngine: process.env.WORKFLOW_ENGINE === 'on',
      observability: process.env.OBSERVABILITY_STACK === 'on',
    },
  );

  const outputs = toStepOutputs(plan);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `${Object.entries(outputs)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n')}\n`,
      'utf8',
    );
  }

  // Printed so the run log carries the contract a reviewer has to check. NAMES ONLY — this is the
  // deployment control plane, and it never handles a secret value.
  console.log(`Deployment profile: ${plan.profileId} (gate=${plan.gate})`);
  console.log(`Provider: ${plan.provider}`);
  console.log(`Exact-main CI required: ${plan.requiresExactMainCi ? 'YES' : 'no'}`);
  if (plan.provider === 'northflank') {
    // Ten bi mat GCP Secret Manager khong ap dung cho Northflank (bi mat nam trong secret group cua
    // chinh project), nen khong in ra de khoi lam nguoi doc tuong chung can duoc tao tren GCP.
    console.log(
      `Stack: ${plan.stackSlug} on Northflank project ${plan.northflankProjectId} (runtime=${plan.runtimeEnvironment})`,
    );
    console.log(
      `Services: api=${plan.northflankApiServiceId} web=${plan.northflankWebServiceId}`,
    );
  } else {
    console.log(`Stack: ${plan.stackSlug} on ${plan.vmName} (runtime=${plan.runtimeEnvironment})`);
    console.log(`Required secret names (${plan.secretContract.secretNames.length}):`);
    for (const name of plan.secretContract.secretNames) console.log(`  - ${name}`);
  }
} catch (error) {
  if (error instanceof DeploymentResolutionError) {
    for (const reason of error.reasons) console.error(reason);
    process.exit(error.exitCode);
  }
  console.error(`Deployment registry could not be read: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(64);
}
