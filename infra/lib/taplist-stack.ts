import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

interface TaplistStackProps extends cdk.StackProps {
  keyPairName?: string;
  repoUrl: string;
}

export class TaplistStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: TaplistStackProps) {
    super(scope, id, props);

    // Use the default VPC
    const vpc = ec2.Vpc.fromLookup(this, 'DefaultVpc', { isDefault: true });

    // Security group: SSH, HTTP, HTTPS
    const sg = new ec2.SecurityGroup(this, 'TaplistSG', {
      vpc,
      description: 'Allow SSH, HTTP, and HTTPS',
      allowAllOutbound: true,
    });
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), 'SSH');
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'HTTP');
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'HTTPS');

    // S3 bucket for backups
    const bucket = new s3.Bucket(this, 'BackupBucket', {
      bucketName: `taplist-backups-${cdk.Aws.ACCOUNT_ID}`,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [
        {
          expiration: cdk.Duration.days(30),
        },
      ],
    });

    // IAM role for EC2 instance
    const role = new iam.Role(this, 'TaplistInstanceRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
    });
    bucket.grantPut(role);

    // Latest Ubuntu 24.04 LTS AMI
    const ami = ec2.MachineImage.lookup({
      name: 'ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*',
      owners: ['099720109477'], // Canonical
    });

    // User data script
    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      '#!/bin/bash',
      'set -euo pipefail',
      'exec > >(tee /var/log/taplist-setup.log) 2>&1',
      '',
      '# System updates',
      'apt-get update -y',
      'apt-get upgrade -y',
      '',
      '# Install Node.js 20',
      'curl -fsSL https://deb.nodesource.com/setup_20.x | bash -',
      'apt-get install -y nodejs build-essential',
      '',
      '# Install Nginx',
      'apt-get install -y nginx',
      '',
      '# Install pm2 globally',
      'npm install -g pm2',
      '',
      '# Install AWS CLI',
      'apt-get install -y awscli',
      '',
      `# Clone the repository`,
      `cd /home/ubuntu`,
      `git clone ${props.repoUrl} tap-list`,
      'chown -R ubuntu:ubuntu tap-list',
      '',
      '# Install dependencies',
      'cd /home/ubuntu/tap-list',
      'sudo -u ubuntu npm install --production',
      '',
      '# Start app with pm2',
      'sudo -u ubuntu pm2 start src/server.js --name taplist',
      'sudo -u ubuntu pm2 save',
      'env PATH=$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu',
      '',
      '# Configure Nginx reverse proxy',
      `cat > /etc/nginx/sites-available/taplist << 'NGINX'`,
      'server {',
      '    listen 80;',
      '    server_name _;',
      '    client_max_body_size 10M;',
      '',
      '    location / {',
      '        proxy_pass http://127.0.0.1:3000;',
      '        proxy_http_version 1.1;',
      '        proxy_set_header Upgrade $http_upgrade;',
      "        proxy_set_header Connection 'upgrade';",
      '        proxy_set_header Host $host;',
      '        proxy_set_header X-Real-IP $remote_addr;',
      '        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;',
      '        proxy_cache_bypass $http_upgrade;',
      '    }',
      '}',
      'NGINX',
      '',
      'rm -f /etc/nginx/sites-enabled/default',
      'ln -sf /etc/nginx/sites-available/taplist /etc/nginx/sites-enabled/taplist',
      'nginx -t && systemctl restart nginx',
      '',
      '# Create backup script',
      `REGION=$(ec2metadata --availability-zone | sed 's/[a-z]$//')`,
      `cat > /home/ubuntu/backup.sh << 'BACKUP'`,
      '#!/bin/bash',
      'set -euo pipefail',
      'TIMESTAMP=$(date +%Y%m%d-%H%M%S)',
      'BACKUP_FILE="/tmp/taplist-backup-$TIMESTAMP.tar.gz"',
      'tar -czf "$BACKUP_FILE" -C /home/ubuntu/tap-list data/ uploads/',
      `aws s3 cp "$BACKUP_FILE" s3://${bucket.bucketName}/backups/taplist-backup-$TIMESTAMP.tar.gz`,
      'rm -f "$BACKUP_FILE"',
      'BACKUP',
      '',
      'chmod +x /home/ubuntu/backup.sh',
      'chown ubuntu:ubuntu /home/ubuntu/backup.sh',
      '',
      '# Schedule daily backup at 3am',
      '(sudo -u ubuntu crontab -l 2>/dev/null || true; echo "0 3 * * * /home/ubuntu/backup.sh") | sudo -u ubuntu crontab -',
    );

    // EC2 instance
    const instance = new ec2.Instance(this, 'TaplistInstance', {
      vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      machineImage: ami,
      securityGroup: sg,
      role,
      userData,
      blockDevices: [
        {
          deviceName: '/dev/sda1',
          volume: ec2.BlockDeviceVolume.ebs(20, {
            volumeType: ec2.EbsDeviceVolumeType.GP3,
          }),
        },
      ],
      ...(props.keyPairName && {
        keyPair: ec2.KeyPair.fromKeyPairName(this, 'KeyPair', props.keyPairName),
      }),
    });

    // Elastic IP
    const eip = new ec2.CfnEIP(this, 'TaplistEIP', {
      domain: 'vpc',
    });
    new ec2.CfnEIPAssociation(this, 'TaplistEIPAssoc', {
      allocationId: eip.attrAllocationId,
      instanceId: instance.instanceId,
    });

    // Outputs
    new cdk.CfnOutput(this, 'PublicIP', {
      value: eip.ref,
      description: 'Elastic IP address of the tap list server',
    });

    new cdk.CfnOutput(this, 'BucketName', {
      value: bucket.bucketName,
      description: 'S3 bucket for backups',
    });

    new cdk.CfnOutput(this, 'InstanceId', {
      value: instance.instanceId,
      description: 'EC2 instance ID',
    });
  }
}
