import * as cdk from 'aws-cdk-lib';
import { CodePipeline, CodePipelineSource, ShellStep } from 'aws-cdk-lib/pipelines';
import { Construct } from 'constructs';
import { TaplistStage } from './taplist-stage';

export interface PipelineStackProps extends cdk.StackProps {
  connectionArn: string;
  repoOwner: string;
  repoName: string;
  branch?: string;
  keyPairName?: string;
  repoUrl: string;
  deployEnv: cdk.Environment;
}

export class PipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);

    const source = CodePipelineSource.connection(
      `${props.repoOwner}/${props.repoName}`,
      props.branch ?? 'main',
      { connectionArn: props.connectionArn },
    );

    const pipeline = new CodePipeline(this, 'Pipeline', {
      pipelineName: 'TaplistPipeline',
      synth: new ShellStep('Synth', {
        input: source,
        commands: [
          'cd infra',
          'npm ci',
          'npx cdk synth -c connectionArn=$CONNECTION_ARN',
        ],
        env: {
          CONNECTION_ARN: props.connectionArn,
        },
        primaryOutputDirectory: 'infra/cdk.out',
      }),
    });

    pipeline.addStage(new TaplistStage(this, 'Deploy', {
      keyPairName: props.keyPairName,
      repoUrl: props.repoUrl,
      env: props.deployEnv,
    }));
  }
}
