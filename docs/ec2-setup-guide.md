# EC2 Deployment Guide — Tap List

## 1. Launch an EC2 Instance

- **AMI:** Ubuntu 24.04 LTS (arm64 for t4g, x86_64 for t3)
- **Instance type:** `t4g.micro` (free tier) or `t3.micro`
- **Storage:** 20 GB gp3 (default is fine)
- **Key pair:** Create or select an existing SSH key pair
- **Security group:** Allow the following inbound rules:
  - SSH (port 22) — your IP only
  - HTTP (port 80) — 0.0.0.0/0
  - HTTPS (port 443) — 0.0.0.0/0

After launch, allocate an **Elastic IP** and associate it with the instance so the public IP doesn't change on reboot.

## 2. SSH In and Install Dependencies

```bash
ssh -i ~/.ssh/your-key.pem ubuntu@<YOUR_ELASTIC_IP>
```

```bash
# System updates
sudo apt update && sudo apt upgrade -y

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install Nginx, Git, and build tools (needed for better-sqlite3)
sudo apt install -y nginx git build-essential python3

# Install pm2 globally
sudo npm install -g pm2
```

## 3. Clone and Set Up the App

```bash
cd /home/ubuntu
git clone https://github.com/UltraVisual/tap-list.git
cd tap-list
npm install --production
```

## 4. Start with pm2

```bash
# Start the app
pm2 start src/server.js --name taplist

# Save the process list so it restarts on reboot
pm2 save
pm2 startup
# Run the command pm2 prints out (it will look like: sudo env PATH=... pm2 startup ...)
```

Verify it's running:

```bash
curl http://localhost:3000
```

## 5. Configure Nginx as a Reverse Proxy

```bash
sudo nano /etc/nginx/sites-available/taplist
```

Paste this configuration:

```nginx
server {
    listen 80;
    server_name _;

    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the site and restart Nginx:

```bash
sudo ln -s /etc/nginx/sites-available/taplist /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

The app should now be accessible at `http://<YOUR_ELASTIC_IP>`.

## 6. HTTPS with Let's Encrypt (Optional — Requires a Domain)

Point your domain's DNS A record to your Elastic IP, then:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

Certbot will auto-configure Nginx for SSL and set up auto-renewal.

## 7. Backups

The two things worth backing up are:
- `data/taplist.db` — the SQLite database
- `uploads/` — beer images and logo

**Option A: Automated snapshots**

In the EC2 console, create an Amazon Data Lifecycle Manager policy to snapshot the EBS volume on a schedule (e.g. daily, retain 7).

**Option B: Cron to S3**

```bash
# Install AWS CLI
sudo apt install -y awscli

# Create a backup script
cat << 'SCRIPT' > /home/ubuntu/backup-taplist.sh
#!/bin/bash
TIMESTAMP=$(date +%Y%m%d-%H%M)
BACKUP_DIR="/tmp/taplist-backup-$TIMESTAMP"
mkdir -p "$BACKUP_DIR"
cp /home/ubuntu/tap-list/data/taplist.db "$BACKUP_DIR/"
cp -r /home/ubuntu/tap-list/uploads "$BACKUP_DIR/"
tar czf "/tmp/taplist-backup-$TIMESTAMP.tar.gz" -C /tmp "taplist-backup-$TIMESTAMP"
aws s3 cp "/tmp/taplist-backup-$TIMESTAMP.tar.gz" s3://YOUR-BUCKET-NAME/backups/
rm -rf "$BACKUP_DIR" "/tmp/taplist-backup-$TIMESTAMP.tar.gz"
SCRIPT
chmod +x /home/ubuntu/backup-taplist.sh

# Run daily at 3am
(crontab -l 2>/dev/null; echo "0 3 * * * /home/ubuntu/backup-taplist.sh") | crontab -
```

## 8. Updating the App

```bash
cd /home/ubuntu/tap-list
git pull
npm install --production
pm2 restart taplist
```

## Quick Reference

| What | Where |
|------|-------|
| App code | `/home/ubuntu/tap-list` |
| SQLite DB | `/home/ubuntu/tap-list/data/taplist.db` |
| Uploads | `/home/ubuntu/tap-list/uploads/` |
| Nginx config | `/etc/nginx/sites-available/taplist` |
| App logs | `pm2 logs taplist` |
| Restart app | `pm2 restart taplist` |
| Restart Nginx | `sudo systemctl restart nginx` |
