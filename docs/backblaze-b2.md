# Backblaze B2 (Cloud Drive)

Epicure Cloud Drive stores files in a **Backblaze B2** bucket using the S3-compatible API.

## 1. Create a bucket

1. Open [Backblaze B2](https://secure.backblaze.com/b2_buckets.htm).
2. Create a bucket (private is fine).
3. Note the region in the S3 endpoint, for example `us-west-004` from
   `https://s3.us-west-004.backblazeb2.com`.

## 2. Create an application key

1. B2 → **App Keys** → **Add a New Application Key**.
2. Allow read and write on that bucket.
3. Copy **keyID** and **applicationKey**. The application key is shown only once.

## 3. Server environment variables

Set these on Vercel (or your host):

```bash
B2_KEY_ID=your_key_id
B2_APPLICATION_KEY=your_application_key
B2_BUCKET=your-bucket-name
B2_REGION=us-west-004
```

Optional:

```bash
B2_ENDPOINT=https://s3.us-west-004.backblazeb2.com
```

If `B2_ENDPOINT` is omitted, the app uses `https://s3.${B2_REGION}.backblazeb2.com`.

## 4. Privacy

Keep the bucket private. Downloads use a short-lived signed URL from `/api/drive/signed-url`.

## 5. Moving files off Cloudflare R2

Existing R2 objects are not copied automatically. Upload again in Cloud Drive, or sync once with rclone, then remove the old R2 keys.
