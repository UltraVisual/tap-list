# Tap List

A configurable tap list application to display your beer selection on a screen in your tap room, home bar, or brewery.

## Features

- **Display Screen** — Grid layout showing each beer's tap number, label artwork, name, style, description, and ABV
- **Brewery Logo** — Prominent logo/name display at the top of the screen
- **Admin Panel** — Add, edit, and remove beers with image uploads
- **Draft Mode** — Prepare beers in draft so switchovers are instant when a keg blows
- **Pint Tracker** — Each beer shows remaining pints (defaults to 38 per keg)
- **Pour Screen** — Mobile-friendly view for recording pours (pint, half, third) to keep counts accurate
- **Auto-refresh** — Display screen refreshes every 30 seconds to stay in sync

## Quick Start

```bash
npm install
npm start
```

The app runs on `http://localhost:3000` by default (set `PORT` env var to change).

## Routes

| URL | Purpose |
|---|---|
| `/` | Public tap list display (put this on your screen) |
| `/admin` | Admin panel — manage beers, drafts, and settings |
| `/admin/settings` | Set tap room name and upload logo |
| `/pour` | Mobile pour tracker — tap to record pours |
| `/api/beers` | JSON API for active beers |

## How It Works

1. Go to `/admin/settings` to set your tap room name and upload a logo
2. Go to `/admin` and click **+ Add Beer** to add beers to your taps
3. Upload label artwork, set ABV, style, description, and tap number
4. Check **Save as draft** if you want to prepare a beer without showing it yet
5. Point a screen at `/` to display your tap list
6. Use `/pour` on your phone to track pours and monitor keg levels

## Tech Stack

- **Node.js + Express** — web server
- **SQLite** (via better-sqlite3) — zero-config database, stored in `data/`
- **EJS** — server-side templates
- **Multer** — image upload handling

No build step required. No external database to configure.

## Infrastructure (AWS CDK)

The `infra/` directory contains a CDK app that provisions an EC2 instance running the tap list behind Nginx, with S3 backups and an optional CI/CD pipeline.

### Direct Deploy (Local Dev)

```bash
cd infra
npm install
npx cdk deploy TaplistStack -c keyPairName=my-key
```

This creates the EC2 instance, security group, Elastic IP, backup bucket, and cron job directly from your machine.

### CI/CD Pipeline Setup

A self-mutating CodePipeline can be enabled so that pushing to `main` automatically deploys the stack. This requires a one-time setup:

#### 1. Bootstrap CDK (if not already done)

```bash
npx cdk bootstrap aws://ACCOUNT_ID/REGION \
  --cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess
```

#### 2. Create a GitHub CodeStar Connection

1. Open the AWS Console → **Developer Tools** → **Settings** → **Connections**
2. Click **Create connection** → select **GitHub** → authorize access
3. Copy the Connection ARN (e.g. `arn:aws:codestar-connections:us-east-1:123456789012:connection/...`)

#### 3. Deploy the Pipeline Stack

```bash
cd infra
npx cdk deploy TaplistPipelineStack \
  -c connectionArn=arn:aws:codestar-connections:us-east-1:123456789012:connection/XXXX
```

You can also pass `-c keyPairName=my-key` if you want SSH access to the instance.

#### 4. Commit `cdk.context.json`

After the first `cdk synth`, CDK writes a `cdk.context.json` file that caches VPC and AMI lookups. Commit this file so that CodeBuild doesn't need `ec2:Describe*` permissions at synth time:

```bash
git add infra/cdk.context.json
git commit -m "chore: add CDK context cache"
```

### After Setup

Every push to `main` triggers the pipeline:

1. **Source** — CodePipeline pulls the latest code via the CodeStar Connection
2. **Synth** — CodeBuild runs `npm ci && npx cdk synth` in the `infra/` directory
3. **Self-mutate** — If the pipeline definition changed, it updates itself first
4. **Deploy** — The TaplistStack is deployed with the latest changes

### Configuration Context Values

These can be passed via `-c key=value` on the CLI or set in `infra/cdk.json`:

| Key | Default | Description |
|---|---|---|
| `connectionArn` | `""` | CodeStar Connection ARN (enables pipeline mode when set) |
| `repoOwner` | `shanejohnson` | GitHub repo owner |
| `repoName` | `tap-list` | GitHub repo name |
| `repoUrl` | `https://github.com/shanejohnson/tap-list.git` | Repo URL cloned onto the EC2 instance |
| `keyPairName` | — | EC2 key pair name for SSH access |
