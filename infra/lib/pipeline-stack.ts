import * as cdk from 'aws-cdk-lib';
import { Pipeline, PipelineType } from 'aws-cdk-lib/aws-codepipeline';
import * as iam from 'aws-cdk-lib/aws-iam';
import { CodeBuildStep, CodePipeline, CodePipelineSource, ShellStep } from 'aws-cdk-lib/pipelines';
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
      { connectionArn: props.connectionArn, triggerOnPush: true },
    );

    const pipeline = new CodePipeline(this, 'Pipeline', {
      codePipeline: new Pipeline(this, 'CodePipeline', {
        pipelineType: PipelineType.V2,
      }),
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

    const deploy = new TaplistStage(this, 'Deploy', {
      keyPairName: props.keyPairName,
      repoUrl: props.repoUrl,
      env: props.deployEnv,
    });

    pipeline.addStage(deploy, {
      post: [
        new CodeBuildStep('DeployApp', {
          envFromCfnOutputs: {
            INSTANCE_ID: deploy.instanceIdOutput,
          },
          commands: [
            // Send command to pull latest code and restart the app
            'COMMAND_ID=$(aws ssm send-command' +
            '  --instance-ids "$INSTANCE_ID"' +
            '  --document-name "AWS-RunShellScript"' +
            '  --parameters \'{"commands":["chown -R ubuntu:ubuntu /home/ubuntu/tap-list && sudo -u ubuntu bash -c \\"cd /home/ubuntu/tap-list && git pull && npm install --omit=dev && pm2 restart taplist\\""],"workingDirectory":["/home/ubuntu"],"executionTimeout":["120"]}\''+
            '  --query "Command.CommandId" --output text)',
            'echo "SSM Command ID: $COMMAND_ID"',
            // Poll for completion (up to 2 minutes)
            'for i in $(seq 1 24); do' +
            '  sleep 5;' +
            '  STATUS=$(aws ssm get-command-invocation' +
            '    --command-id "$COMMAND_ID"' +
            '    --instance-id "$INSTANCE_ID"' +
            '    --query "Status" --output text 2>/dev/null || echo "Pending");' +
            '  echo "Attempt $i: $STATUS";' +
            '  case "$STATUS" in' +
            '    Success) echo "Deploy succeeded"; exit 0;;' +
            '    Failed|TimedOut|Cancelled) echo "Deploy failed"; exit 1;;' +
            '  esac;' +
            'done',
            'echo "Timed out waiting for deploy"; exit 1',
          ],
          rolePolicyStatements: [
            new iam.PolicyStatement({
              actions: ['ssm:SendCommand'],
              resources: [
                `arn:aws:ssm:*:*:document/AWS-RunShellScript`,
                `arn:aws:ec2:*:*:instance/*`,
              ],
            }),
            new iam.PolicyStatement({
              actions: ['ssm:GetCommandInvocation'],
              resources: ['*'],
            }),
          ],
        }),
      ],
    });
  }
}
