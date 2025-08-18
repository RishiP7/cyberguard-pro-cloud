CyberGuard Pro — complete local setup

Terminal A — Postgres + MailHog
docker start cybermon-pg 2>/dev/null || docker run --name cybermon-pg -e POSTGRES_USER=cybermon -e POSTGRES_PASSWORD=cyberpass -e POSTGRES_DB=cyberguardpro -p 5432:5432 -d postgres:15
docker start mailhog 2>/dev/null || docker run -d --name mailhog -p 1025:1025 -p 8025:8025 mailhog/mailhog

Terminal B — API
cd app
cp .env.example .env
npm install
node src/migrate.js
npm start

Terminal C — Web
cd web-ready
npm install
npm run dev -- --port 5173

Browser
- http://localhost:5173 (web)
- http://localhost:8080 (API)
- http://localhost:8025 (MailHog inbox)
