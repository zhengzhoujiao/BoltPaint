# Production deployment

This deployment joins the existing `bolt_net` Docker network. The public
Nginx gateway forwards `/boltPaint/` and `/bpManage/` to
`http://boltpaint_gateway:80`, preserving the URI and forwarding `Host`,
`X-Real-IP`, `X-Forwarded-For`, and `X-Forwarded-Proto`.

The deployed project lives at `/home/admin/BoltPaint`.

Build both frontends before uploading:

```sh
npm ci --prefix webApp
npm run build --prefix webApp
npm ci --prefix manage
npm run build --prefix manage
```

Create a private root `.env` with `MONGO_ROOT_USERNAME` and
`MONGO_ROOT_PASSWORD`, and a private `backend/.env.production` with:

```dotenv
APP_ENV=prod
MONGODB_URL=mongodb://USERNAME:PASSWORD@mongodb:27017/?authSource=admin
MONGODB_DB_NAME=bolt_painting
PASSWORD_ENCRYPTION_KEY=REPLACE_WITH_RANDOM_SECRET
INITIAL_ADMIN_USERNAME=admin
INITIAL_ADMIN_PASSWORD=REPLACE_WITH_STRONG_PASSWORD
INITIAL_TEST_USER_PASSWORD=REPLACE_WITH_DIFFERENT_STRONG_PASSWORD
CORS_ORIGINS=https://bolt-series.cn
PUBLIC_BASE_URL=https://bolt-series.cn
OBJECT_STORAGE_DIR=/data/media
SMS_ENABLED=false
```

Use URL-safe database credentials or percent-encode them in `MONGODB_URL`.
Restrict both environment files to mode `600`. Never rotate MongoDB's
environment password without updating the database user's password too.
The administrator's initial credentials are stored separately on the server
at `/root/boltpaint-admin-credentials` (mode `600`).

Start or update the deployment:

```sh
docker compose -f docker-compose.production.yml up -d --build
docker compose -f docker-compose.production.yml ps
docker compose -f docker-compose.production.yml logs --tail=100 backend
```

Validate and reload the existing public gateway after deployment, especially
if the application gateway container is recreated and receives a new IP:

```sh
docker exec bolt_nginx nginx -t
docker exec bolt_nginx nginx -s reload
```

The public gateway configuration backup is stored beside its original file
under `/home/admin/COWebsite/nginx/`. Database files persist in `data/db`;
uploaded and generated images persist in `data/media`. Neither service exposes
ports on the host. HTTP requests retain the main site's HTTPS redirect.

Configure Gemini/Evolink keys in the administration settings before generating
images. Configure SMS and Alipay in the backend environment before enabling
those features. Back up the database and media together with the encryption
key before maintenance.
