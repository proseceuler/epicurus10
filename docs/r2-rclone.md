# Cloudflare R2 + rclone (Cloud Drive)

Epicure Cloud Drive talks to **Cloudflare R2** via the S3-compatible API on the server.
Local `rclone` is the recommended operator tool for bulk sync, mounts, and lifecycle ops.

## Environment variables

Set these on the server (never ship secrets to the browser):

```bash
R2_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_r2_access_key
R2_SECRET_ACCESS_KEY=your_r2_secret_key
R2_BUCKET=epicure-drive
# optional public base if you use a custom domain / r2.dev
R2_PUBLIC_URL=https://pub-xxxx.r2.dev
```

Create the R2 API token in Cloudflare Dashboard → R2 → Manage R2 API Tokens
with **Object Read & Write** on the target bucket.

## rclone remote

```bash
rclone config create epicure-r2 s3 \
  provider=Cloudflare \
  access_key_id=$R2_ACCESS_KEY_ID \
  secret_access_key=$R2_SECRET_ACCESS_KEY \
  endpoint=https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com \
  acl=private
```

Examples:

```bash
# list
rclone ls epicure-r2:epicure-drive

# sync a folder up
rclone sync ./exports epicure-r2:epicure-drive/exports --progress

# mount (optional)
rclone mount epicure-r2:epicure-drive /mnt/epicure-drive --vfs-cache-mode writes
```

See also `rclone/rclone.conf.example`.

## Object lifecycle policy

Apply rules so incomplete uploads and trash do not grow forever.
Use the JSON in `r2/lifecycle.json` via the Cloudflare API or dashboard:

| Rule | Prefix | Action |
|------|--------|--------|
| Abort incomplete multipart | * | Abort after **7 days** |
| Expire trash | `trash/` | Delete objects after **30 days** |
| Expire temp uploads | `tmp/` | Delete after **3 days** |

Cloudflare Dashboard → R2 → bucket → Settings → Object lifecycle rules,
or `wrangler r2 bucket lifecycle` if you use Wrangler.

Developer hosts the bucket; objects live in R2 under your account (not Puter).
