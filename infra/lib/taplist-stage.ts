import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { TaplistStack } from './taplist-stack';

export interface TaplistStageProps extends cdk.StageProps {
  keyPairName?: string;
  repoUrl: string;
}

export class TaplistStage extends cdk.Stage {
  constructor(scope: Construct, id: string, props: TaplistStageProps) {
    super(scope, id, props);

    new TaplistStack(this, 'TaplistStack', {
      keyPairName: props.keyPairName,
      repoUrl: props.repoUrl,
    });
  }
}
