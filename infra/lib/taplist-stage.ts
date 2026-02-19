import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { TaplistStack } from './taplist-stack';

export interface TaplistStageProps extends cdk.StageProps {
  keyPairName?: string;
  repoUrl: string;
}

export class TaplistStage extends cdk.Stage {
  public readonly instanceIdOutput: cdk.CfnOutput;

  constructor(scope: Construct, id: string, props: TaplistStageProps) {
    super(scope, id, props);

    const stack = new TaplistStack(this, 'TaplistStack', {
      keyPairName: props.keyPairName,
      repoUrl: props.repoUrl,
    });

    this.instanceIdOutput = stack.instanceIdOutput;
  }
}
