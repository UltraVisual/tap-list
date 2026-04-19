#!/usr/bin/env node
// Local dev server: spins up DynamoDB local, creates tables, seeds sample data, starts Express.
'use strict';

process.env.AWS_REGION = 'us-east-1';
process.env.AWS_ACCESS_KEY_ID = 'local';
process.env.AWS_SECRET_ACCESS_KEY = 'local';
process.env.DYNAMODB_ENDPOINT = 'http://localhost:8000';
process.env.BEERS_TABLE = 'TaplistBeers';
process.env.SETTINGS_TABLE = 'TaplistSettings';
process.env.S3_LOCAL_DIR = require('path').join(__dirname, '..', '.local-uploads');
process.env.NODE_ENV = 'development';

const { DynamoDBClient, CreateTableCommand } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { execSync, spawn } = require('child_process');

async function createTable(client, params) {
  try {
    await client.send(new CreateTableCommand(params));
  } catch (e) {
    if (e.name !== 'ResourceInUseException') throw e;
  }
}

function waitForDynamo(retries = 20, delayMs = 500) {
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      try {
        execSync('curl -s http://localhost:8000', { stdio: 'ignore' });
        resolve();
      } catch {
        if (n <= 0) return reject(new Error('DynamoDB Local did not start in time'));
        setTimeout(() => attempt(n - 1), delayMs);
      }
    };
    attempt(retries);
  });
}

async function main() {
  console.log('Starting DynamoDB Local via Docker...');
  // Stop any existing container from a previous run
  execSync('docker rm -f dynamodb-local 2>/dev/null || true', { stdio: 'ignore' });
  const docker = spawn('docker', [
    'run', '--rm', '--name', 'dynamodb-local',
    '-p', '8000:8000',
    'amazon/dynamodb-local',
    '-jar', 'DynamoDBLocal.jar', '-inMemory',
  ], { stdio: 'inherit' });
  docker.on('error', (e) => { console.error('Docker error:', e.message); process.exit(1); });
  process.on('exit', () => execSync('docker rm -f dynamodb-local 2>/dev/null || true', { stdio: 'ignore' }));
  process.on('SIGINT', () => process.exit(0));

  await waitForDynamo();
  console.log('DynamoDB Local running on port 8000');

  const dynamo = new DynamoDBClient({
    region: 'us-east-1',
    endpoint: 'http://localhost:8000',
    credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
  });
  const doc = DynamoDBDocumentClient.from(dynamo);

  await createTable(dynamo, {
    TableName: 'TaplistBeers',
    KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
    AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
    BillingMode: 'PAY_PER_REQUEST',
  });

  await createTable(dynamo, {
    TableName: 'TaplistSettings',
    KeySchema: [{ AttributeName: 'key', KeyType: 'HASH' }],
    AttributeDefinitions: [{ AttributeName: 'key', AttributeType: 'S' }],
    BillingMode: 'PAY_PER_REQUEST',
  });

  // Seed settings
  await doc.send(new PutCommand({ TableName: 'TaplistSettings', Item: { key: 'taproom_name', value: 'The Local Brew Co.' } }));
  await doc.send(new PutCommand({ TableName: 'TaplistSettings', Item: { key: 'theme', value: 'dark' } }));

  // Seed sample beers (only if table is empty)
  const sampleBeers = [
    { id: 'beer-dev-1', tap_number: 1, name: 'Cascade Pale Ale', style: 'American Pale Ale', brewery: 'Local Brew Co.', description: 'Citrus-forward pale ale with big Cascade hops.', abv: 5.2, pints_remaining: 28, pints_total: 38, is_draft: 0, is_active: 1, image_path: '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 'beer-dev-2', tap_number: 2, name: 'Dark Matter Stout', style: 'Imperial Stout', brewery: 'Black Label Brewing', description: 'Rich, roasted stout with notes of coffee and dark chocolate.', abv: 8.5, pints_remaining: 12, pints_total: 38, is_draft: 0, is_active: 1, image_path: '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 'beer-dev-3', tap_number: 3, name: 'Wheat Street Hefeweizen', style: 'Hefeweizen', brewery: 'River City Brewery', description: 'Unfiltered wheat beer with banana and clove aromas.', abv: 4.8, pints_remaining: 38, pints_total: 38, is_draft: 0, is_active: 1, image_path: '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 'beer-dev-4', tap_number: 4, name: 'Hazy IPA', style: 'New England IPA', brewery: 'Foggy Bottom Brewing', description: 'Juicy, hazy IPA bursting with tropical fruit notes.', abv: 6.8, pints_remaining: 3, pints_total: 38, is_draft: 0, is_active: 1, image_path: '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 'beer-dev-5', tap_number: 5, name: 'Amber Session', style: 'Amber Ale', brewery: 'Local Brew Co.', description: 'Easy-drinking amber ale with caramel malt backbone.', abv: 4.2, pints_remaining: 20, pints_total: 38, is_draft: 1, is_active: 1, image_path: '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  ];

  for (const beer of sampleBeers) {
    await doc.send(new PutCommand({ TableName: 'TaplistBeers', Item: beer }));
  }

  console.log('Tables created and seeded with sample beers.');
  console.log('');

  // Start Express
  const app = require('../src/server');
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Tap List running at http://localhost:${PORT}`);
    console.log(`Admin panel:  http://localhost:${PORT}/admin`);
    console.log(`Pour tracker: http://localhost:${PORT}/pour`);
  });
}

main().catch(e => { console.error(e); process.exit(1); });
