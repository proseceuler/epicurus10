# Firebase Cloud Storage (Cloud Drive)

Epicure Cloud Drive stores files in **Firebase / Google Cloud Storage**.

## 1. Create a bucket

1. Open [Firebase Console](https://console.firebase.google.com/) → your project → **Build → Storage**.
2. Click **Get started** if Storage is not on yet.
3. Copy the bucket name. It looks like `your-project.appspot.com` or `your-project.firebasestorage.app`.

## 2. Create a service account

1. Firebase Console → Project settings → **Service accounts**.
2. Generate a new private key (JSON).
3. Keep that file private. Never commit it.

## 3. Server environment variables

Set these on Vercel (or whatever hosts the API):

```bash
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-...@your-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n....\n-----END PRIVATE KEY-----\n"
FIREBASE_STORAGE_BUCKET=your-project.appspot.com
```

You can instead paste the whole JSON key as one variable:

```bash
FIREBASE_SERVICE_ACCOUNT='{"type":"service_account","project_id":"...","private_key":"...","client_email":"..."}'
FIREBASE_STORAGE_BUCKET=your-project.appspot.com
```

If `FIREBASE_PRIVATE_KEY` is stored with `\n` escapes, that is fine — the app turns them into real newlines.

## 4. Storage rules

For this app the server uses the service account, so objects do not need to be public. Keep Storage rules locked down (deny public write). Downloads go through a short-lived signed URL from `/api/drive/signed-url`.

## 5. Moving files off Cloudflare R2

Existing R2 objects are not copied automatically. Sync them once, then drop the R2 keys.
