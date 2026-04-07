const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const path = require('path');

const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const BUCKET = process.env.UPLOADS_BUCKET;

async function uploadFile(fileBuffer, originalName, prefix) {
  const ext = path.extname(originalName);
  const key = `uploads/${prefix}/${Date.now()}${ext}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: fileBuffer,
      ContentType: getMimeType(ext),
    })
  );

  // CloudFront routes /uploads/* to this bucket, so the public URL matches the key
  return `/${key}`;
}

function getMimeType(ext) {
  const map = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
  };
  return map[ext.toLowerCase()] || 'application/octet-stream';
}

module.exports = { uploadFile };
