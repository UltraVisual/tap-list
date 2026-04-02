# Tap List

A configurable tap list application to display your beer selection on a screen in your tap room, home bar, or brewery!

## Features

- **Display Screen** — Grid layout showing each beer's tap number, label artwork, name, style, description, and ABV
- **Brewery Logo** — Prominent logo/name display at the top of the screen
- **Admin Panel** — Add, edit, and remove beers with image uploads
- **Draft Mode** — Prepare beers in draft so switchovers are instant when a keg blows
- **Pint Tracker** — Each beer shows remaining pints (defaults to 38 per keg)
- **Pour Screen** — Mobile-friendly PWA view for recording pours (pint, half, third) to keep counts accurate
- **Auto-refresh** — Display screen refreshes every 5 seconds to stay in sync

## Quick Start (Local Development)

```bash
npm install
npm run dev
```

The app runs on `http://localhost:3000` by default (set `PORT` env var to change).

For local development, you'll need AWS credentials configured with access to DynamoDB and S3 (or use local alternatives like DynamoDB Local).

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

- **Node.js + Express** — web server (runs on AWS Lambda)
- **DynamoDB** — fully managed NoSQL database (pay-per-request)
- **S3** — image upload storage
- **CloudFront** — CDN for HTTPS and caching
- **API Gateway** — HTTP routing to Lambda
- **EJS** — server-side templates
- **Multer** — image upload handling

## Infrastructure (AWS CDK — Serverless)

The `infra/` directory contains a CDK app that provisions a fully serverless stack:

- **Lambda** — runs the Express app via @vendia/serverless-express
- **API Gateway** — routes HTTP requests to Lambda
- **DynamoDB** — two tables (beers + settings), pay-per-request billing
- **S3** — stores uploaded images (beer labels, logo)
- **CloudFront** — CDN in front of API Gateway and S3

### Cost

This architecture falls within the **AWS Free Tier** for typical usage:

| Service | Free Tier | Typical Usage |
|---|---|---|
| Lambda | 1M requests/month | ~50k requests/month |
| DynamoDB | 25 RCU/WCU + 25GB | A few KB |
| S3 | 5GB + 20k GET + 2k PUT | < 100MB |
| API Gateway | 1M calls/month | ~50k calls/month |
| CloudFront | 1TB transfer/month | < 1GB/month |

**Estimated monthly cost: $0-2** (effectively free for a tap display)

### Deploy

```bash
cd infra
npm install
npx cdk deploy TaplistStack
```

### CI/CD Pipeline (Optional)

A self-mutating CodePipeline can be enabled so that pushing to `main` automatically deploys:

#### 1. Bootstrap CDK (if not already done)

```bash
npx cdk bootstrap aws://ACCOUNT_ID/REGION \
  --cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess
```

#### 2. Create a GitHub CodeStar Connection

1. Open the AWS Console - **Developer Tools** - **Settings** - **Connections**
2. Click **Create connection** - select **GitHub** - authorize access
3. Copy the Connection ARN

#### 3. Deploy the Pipeline Stack

```bash
cd infra
npx cdk deploy TaplistPipelineStack \
  -c connectionArn=arn:aws:codestar-connections:us-east-1:123456789012:connection/XXXX
```

### Configuration Context Values

These can be passed via `-c key=value` on the CLI or set in `infra/cdk.json`:

| Key | Default | Description |
|---|---|---|
| `connectionArn` | `""` | CodeStar Connection ARN (enables pipeline mode when set) |
| `repoOwner` | `UltraVisual` | GitHub repo owner |
| `repoName` | `tap-list` | GitHub repo name |
