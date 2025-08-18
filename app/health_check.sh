#!/bin/zsh
set -euo pipefail
cd ~/Downloads/cyberguard-pro-cloud-latest/app
set -a; source ./.env; set +a
BASE=${BASE:-http://localhost:8080}
header(){ print -P "\n%F{cyan}==> $1%f"; }

header "1) /health"
curl -sS "$BASE/health" | jq .

header "2) Login -> TOKEN"
TOKEN=$(curl -sS -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"hello@freshprintslondon.com","password":"test123"}' | jq -r .token)
echo "TOKEN length: ${#TOKEN}"

header "3) /me"
curl -sS "$BASE/me" -H "Authorization: Bearer $TOKEN" | jq .

header "4) Set plan=pro_plus"
curl -sS -X POST "$BASE/billing/mock-activate" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"plan":"pro_plus"}' | jq .

header "5) Create API key"
APIKEY=$(curl -sS -X POST "$BASE/apikeys" -H "Authorization: Bearer $TOKEN" | jq -r .api_key)
echo "APIKEY: $APIKEY"

header "6) CORS preflight"
curl -i -sS -X OPTIONS "$BASE/email/scan" \
  -H "Origin: http://localhost:5176" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: x-api-key,content-type" | sed -n '1,20p'

header "7) Email scan"
curl -sS "$BASE/email/scan" -H "x-api-key: $APIKEY" -H "Content-Type: application/json" \
  -d '{"emails":[{"from":"Support <help@paypa1.com>","subject":"Urgent: verify your account"}]}' | jq .

header "8) EDR ingest"
curl -sS "$BASE/edr/ingest" -H "x-api-key: $APIKEY" -H "Content-Type: application/json" \
  -d '{"events":[{"host":"FINANCE-LAPTOP-7","process":"powershell.exe","cmdline":"powershell -enc SQBFAE4A...","file_ops":{"burst":1200}}]}' | jq .

header "9) DNS ingest"
curl -sS "$BASE/dns/ingest" -H "x-api-key: $APIKEY" -H "Content-Type: application/json" \
  -d '{"events":[{"qname":"evil-top-domain.top","qtype":"A","newly_registered":true,"verdict":"dns-tunnel"}]}' | jq .

header "10) Admin tenants"
curl -sS "$BASE/admin/tenants" -H "x-admin-key: $ADMIN_KEY" | jq '.tenants | length, .[0]'
