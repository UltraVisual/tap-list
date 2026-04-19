const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  ScanCommand,
} = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
  ...(process.env.DYNAMODB_ENDPOINT ? { endpoint: process.env.DYNAMODB_ENDPOINT } : {}),
});
const docClient = DynamoDBDocumentClient.from(client);

const BEERS_TABLE = process.env.BEERS_TABLE || 'TaplistBeers';
const SETTINGS_TABLE = process.env.SETTINGS_TABLE || 'TaplistSettings';

// ---------- Settings ----------

async function getSettings() {
  const result = await docClient.send(
    new ScanCommand({ TableName: SETTINGS_TABLE })
  );
  const settings = {};
  for (const item of result.Items || []) {
    settings[item.key] = item.value;
  }
  if (!settings.taproom_name) settings.taproom_name = 'My Tap Room';
  if (!settings.logo_path) settings.logo_path = '';
  if (!settings.theme) settings.theme = 'dark';
  return settings;
}

async function putSetting(key, value) {
  await docClient.send(
    new PutCommand({
      TableName: SETTINGS_TABLE,
      Item: { key, value },
    })
  );
}

// ---------- Beers ----------

async function getAllActiveBeers() {
  const result = await docClient.send(
    new ScanCommand({
      TableName: BEERS_TABLE,
      FilterExpression: 'is_active = :active',
      ExpressionAttributeValues: { ':active': 1 },
    })
  );
  return (result.Items || []).sort((a, b) => a.tap_number - b.tap_number);
}

async function getOnTapBeers() {
  const result = await docClient.send(
    new ScanCommand({
      TableName: BEERS_TABLE,
      FilterExpression: 'is_active = :active AND is_draft = :draft',
      ExpressionAttributeValues: { ':active': 1, ':draft': 0 },
    })
  );
  return (result.Items || []).sort((a, b) => a.tap_number - b.tap_number);
}

async function getDraftBeers() {
  const result = await docClient.send(
    new ScanCommand({
      TableName: BEERS_TABLE,
      FilterExpression: 'is_active = :active AND is_draft = :draft',
      ExpressionAttributeValues: { ':active': 1, ':draft': 1 },
    })
  );
  return (result.Items || []).sort(
    (a, b) => new Date(b.updated_at) - new Date(a.updated_at)
  );
}

async function getBeerById(id) {
  const result = await docClient.send(
    new GetCommand({
      TableName: BEERS_TABLE,
      Key: { id },
    })
  );
  return result.Item || null;
}

async function createBeer(beer) {
  const id = `beer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  const item = {
    id,
    tap_number: beer.tap_number || 0,
    name: beer.name || 'Untitled',
    description: beer.description || '',
    abv: beer.abv || 0,
    style: beer.style || '',
    brewery: beer.brewery || '',
    image_path: beer.image_path || '',
    pints_remaining: beer.pints_remaining != null ? beer.pints_remaining : (beer.pints_total || 38),
    pints_total: beer.pints_total || 38,
    is_draft: beer.is_draft || 0,
    is_active: 1,
    created_at: now,
    updated_at: now,
  };
  await docClient.send(
    new PutCommand({ TableName: BEERS_TABLE, Item: item })
  );
  return item;
}

async function updateBeer(id, fields) {
  const expressions = [];
  const names = {};
  const values = {};

  for (const [key, val] of Object.entries(fields)) {
    const attrName = `#${key}`;
    const attrVal = `:${key}`;
    expressions.push(`${attrName} = ${attrVal}`);
    names[attrName] = key;
    values[attrVal] = val;
  }

  if (!fields.updated_at) {
    expressions.push('#updated_at = :updated_at');
    names['#updated_at'] = 'updated_at';
    values[':updated_at'] = new Date().toISOString();
  }

  await docClient.send(
    new UpdateCommand({
      TableName: BEERS_TABLE,
      Key: { id },
      UpdateExpression: 'SET ' + expressions.join(', '),
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    })
  );
}

module.exports = {
  getSettings,
  putSetting,
  getAllActiveBeers,
  getOnTapBeers,
  getDraftBeers,
  getBeerById,
  createBeer,
  updateBeer,
};
