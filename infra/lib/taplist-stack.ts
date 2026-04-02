import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import { Construct } from 'constructs';
import * as path from 'path';

export class TaplistStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const appRoot = path.join(__dirname, '..', '..');

    // ---------- DynamoDB tables ----------
    const beersTable = new dynamodb.Table(this, 'BeersTable', {
      tableName: 'TaplistBeers',
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const settingsTable = new dynamodb.Table(this, 'SettingsTable', {
      tableName: 'TaplistSettings',
      partitionKey: { name: 'key', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ---------- S3 bucket for uploads ----------
    const uploadsBucket = new s3.Bucket(this, 'UploadsBucket', {
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
        },
      ],
    });

    // ---------- Lambda function ----------
    const fn = new lambda.Function(this, 'TaplistFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'src/lambda.handler',
      code: lambda.Code.fromAsset(appRoot, {
        bundling: {
          image: lambda.Runtime.NODEJS_20_X.bundlingImage,
          local: {
            tryBundle(outputDir: string): boolean {
              const { execSync } = require('child_process');
              execSync(`cp -r ${appRoot}/src ${outputDir}/src`);
              execSync(`cp -r ${appRoot}/views ${outputDir}/views`);
              execSync(`cp -r ${appRoot}/public ${outputDir}/public`);
              execSync(`cp ${appRoot}/package.json ${outputDir}/package.json`);
              execSync(`cp ${appRoot}/package-lock.json ${outputDir}/package-lock.json`);
              execSync('npm ci --omit=dev', { cwd: outputDir });
              return true;
            },
          },
        },
      }),
      memorySize: 256,
      timeout: cdk.Duration.seconds(15),
      environment: {
        BEERS_TABLE: beersTable.tableName,
        SETTINGS_TABLE: settingsTable.tableName,
        UPLOADS_BUCKET: uploadsBucket.bucketName,
        NODE_ENV: 'production',
      },
    });

    // Grant Lambda permissions
    beersTable.grantReadWriteData(fn);
    settingsTable.grantReadWriteData(fn);
    uploadsBucket.grantReadWrite(fn);

    // ---------- API Gateway ----------
    const api = new apigateway.LambdaRestApi(this, 'TaplistApi', {
      handler: fn,
      proxy: true,
      binaryMediaTypes: ['multipart/form-data', 'image/*'],
      deployOptions: {
        stageName: 'prod',
      },
    });

    // ---------- CloudFront distribution ----------
    const s3Origin = origins.S3BucketOrigin.withOriginAccessControl(uploadsBucket);

    const apiDomainName = `${api.restApiId}.execute-api.${this.region}.amazonaws.com`;
    const apiOrigin = new origins.HttpOrigin(apiDomainName, {
      originPath: '/prod',
    });

    const distribution = new cloudfront.Distribution(this, 'TaplistCDN', {
      defaultBehavior: {
        origin: apiOrigin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      },
      additionalBehaviors: {
        '/uploads/*': {
          origin: s3Origin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        },
        '/public/*': {
          origin: apiOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: new cloudfront.CachePolicy(this, 'StaticCachePolicy', {
            defaultTtl: cdk.Duration.days(7),
            maxTtl: cdk.Duration.days(30),
            minTtl: cdk.Duration.hours(1),
            enableAcceptEncodingGzip: true,
            enableAcceptEncodingBrotli: true,
          }),
        },
      },
    });

    // ---------- Outputs ----------
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'API Gateway URL',
    });

    new cdk.CfnOutput(this, 'CloudFrontUrl', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'CloudFront URL (use this to access the app)',
    });

    new cdk.CfnOutput(this, 'UploadsBucketName', {
      value: uploadsBucket.bucketName,
      description: 'S3 bucket for image uploads',
    });

    new cdk.CfnOutput(this, 'BeersTableName', {
      value: beersTable.tableName,
      description: 'DynamoDB table for beers',
    });

    new cdk.CfnOutput(this, 'SettingsTableName', {
      value: settingsTable.tableName,
      description: 'DynamoDB table for settings',
    });
  }
}
