#!/usr/bin/env bash
set -euo pipefail

# Smart Garden — Server Setup & Deploy
# Run from the project root on your Mac
# Usage: ./deploy-server.sh
# Usage with HTTPS: DOMAIN=smartgarden.duckdns.org ./deploy-server.sh

DOMAIN="${DOMAIN:-smartgarden.duckdns.org}"

VPS="ubuntu@18.171.135.9"
KEY="$HOME/.ssh/lightsail-eu-west-2.pem"
SSH="ssh -i $KEY $VPS"
SCP="scp -i $KEY"

echo "=== 1. Installing system dependencies ==="
$SSH << 'REMOTE'
set -euo pipefail
sudo apt-get update -qq
sudo apt-get install -y -qq python3-pip python3-venv nginx certbot python3-certbot-nginx > /dev/null

# Node.js 20 LTS for frontend build
if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - > /dev/null 2>&1
  sudo apt-get install -y -qq nodejs > /dev/null
fi
echo "Node $(node --version), npm $(npm --version), Python $(python3 --version)"
REMOTE

echo "=== 2. Creating app directories ==="
$SSH "sudo mkdir -p /opt/smart-garden/{backend,frontend} && sudo chown -R ubuntu:ubuntu /opt/smart-garden"

echo "=== 3. Uploading backend ==="
$SCP backend/main.py backend/models.py backend/alerts.py backend/database.py backend/requirements.txt $VPS:/opt/smart-garden/backend/

echo "=== 4. Uploading frontend ==="
# Build frontend locally first
echo "  Building frontend..."
# Reads VITE_ vars from frontend/.env, override API URL with HTTPS domain
(cd frontend && source <(grep '^VITE_' .env | sed 's/^/export /') && VITE_API_URL=https://$DOMAIN npx vite build)
# Upload dist
tar -czf /tmp/frontend-dist.tar.gz -C frontend/dist .
$SCP /tmp/frontend-dist.tar.gz $VPS:/tmp/
$SSH "rm -rf /opt/smart-garden/frontend/dist && mkdir -p /opt/smart-garden/frontend/dist && tar -xzf /tmp/frontend-dist.tar.gz -C /opt/smart-garden/frontend/dist"

echo "=== 5. Setting up backend ==="
$SSH << 'REMOTE'
set -euo pipefail
cd /opt/smart-garden/backend

# Create venv if missing
if [ ! -d venv ]; then
  python3 -m venv venv
fi
source venv/bin/activate
pip install -q -r requirements.txt
REMOTE

echo "=== 6. Writing backend .env ==="
# Reads secrets from local .env file — never hardcode in this script
if [ ! -f backend/.env ]; then
  echo "ERROR: backend/.env not found. Create it with SUPABASE_URL, SUPABASE_SERVICE_KEY, etc."
  exit 1
fi
$SCP backend/.env $VPS:/opt/smart-garden/backend/.env

echo "=== 7. Creating systemd service ==="
$SSH "sudo tee /etc/systemd/system/smart-garden.service > /dev/null" << 'SERVICE'
[Unit]
Description=Smart Garden FastAPI Backend
After=network.target

[Service]
User=ubuntu
WorkingDirectory=/opt/smart-garden/backend
ExecStart=/opt/smart-garden/backend/venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=5
EnvironmentFile=/opt/smart-garden/backend/.env

[Install]
WantedBy=multi-user.target
SERVICE

$SSH "sudo systemctl daemon-reload && sudo systemctl enable smart-garden && sudo systemctl restart smart-garden"

echo "=== 8. Configuring nginx ==="
$SSH "sudo tee /etc/nginx/sites-available/smart-garden > /dev/null" << NGINX
server {
    listen 80;
    server_name $DOMAIN;

    # Frontend — static files
    root /opt/smart-garden/frontend/dist;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Backend API — reverse proxy
    location /api/ {
        proxy_pass http://127.0.0.1:8000/api/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Health check
    location /health {
        proxy_pass http://127.0.0.1:8000/health;
    }
}
NGINX

$SSH << 'REMOTE'
sudo ln -sf /etc/nginx/sites-available/smart-garden /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl restart nginx
REMOTE

echo "=== 9. Setting up HTTPS with Let's Encrypt ==="
$SSH << REMOTE
set -euo pipefail
if [ ! -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
    echo "==> Obtaining SSL certificate..."
    sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "${CERT_EMAIL:-admin@$DOMAIN}" --redirect
    echo "==> SSL certificate obtained and nginx configured"
else
    echo "==> SSL certificate already exists, renewing if needed..."
    sudo certbot renew --quiet
fi

# Ensure auto-renewal timer is enabled
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
REMOTE

# ── DuckDNS dynamic DNS update ───────────────────────
if [ -n "${DUCKDNS_TOKEN:-}" ]; then
    DUCKDNS_DOMAIN="${DOMAIN%.duckdns.org}"
    $SSH << REMOTE
CRON_CMD="*/5 * * * * curl -s \"https://www.duckdns.org/update?domains=${DUCKDNS_DOMAIN}&token=${DUCKDNS_TOKEN}&ip=\" > /dev/null 2>&1"
(crontab -l 2>/dev/null | grep -v duckdns; echo "\$CRON_CMD") | crontab -
echo "==> DuckDNS cron installed (updates every 5 min)"
REMOTE
fi

echo "=== 10. Verifying ==="
sleep 2
$SSH "curl -s http://localhost:8000/health && echo '' && curl -s -o /dev/null -w 'Frontend: HTTP %{http_code}\n' http://localhost/"

echo ""
echo "=== DEPLOYED ==="
echo "Frontend: https://$DOMAIN/"
echo "Backend:  https://$DOMAIN/api/"
echo ""
echo "Next: update firmware config.h API_ENDPOINT to https://$DOMAIN"
