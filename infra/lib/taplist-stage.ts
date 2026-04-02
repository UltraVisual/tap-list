import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { TaplistStack } from './taplist-stack';

export class TaplistStage extends cdk.Stage {
  constructor(scope: Construct, id: string, props?: cdk.StageProps) {
    super(scope, id, props);

    new TaplistStack(this, 'TaplistStack');
  }
}
