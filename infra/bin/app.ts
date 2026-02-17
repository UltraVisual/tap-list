#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { TaplistStack } from '../lib/taplist-stack';
import { PipelineStack } from '../lib/pipeline-stack';

const app = new cdk.App();

const keyPairName = app.node.tryGetContext('keyPairName');
const repoUrl = app.node.tryGetContext('repoUrl') ?? 'https://github.com/ultravisual/tap-list.git';
const connectionArn = app.node.tryGetContext('connectionArn') ?? process.env.CONNECTION_ARN ?? '';

const env: cdk.Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

if (connectionArn) {
  // Pipeline mode: deploy via CodePipeline (self-mutating)
  const repoOwner = app.node.tryGetContext('repoOwner') ?? 'ultravisual';
  const repoName = app.node.tryGetContext('repoName') ?? 'tap-list';
  const branch = app.node.tryGetContext('branch') ?? 'main';

  new PipelineStack(app, 'TaplistPipelineStack', {
    connectionArn,
    repoOwner,
    repoName,
    branch,
    keyPairName,
    repoUrl,
    deployEnv: env,
    env,
  });
} else {
  // Direct deploy mode: cdk deploy for local development
  new TaplistStack(app, 'TaplistStack', {
    keyPairName,
    repoUrl,
    env,
  });
}
