/** @deprecated Cloud Drive now uses Firebase Storage. These names stay so existing imports keep working. */
export {
  storageConfigured as r2Configured,
  getDriveStorageConfig as getR2Config,
  listDrive as listR2,
  uploadDrive as uploadR2,
  deleteDrive as deleteR2,
  signedGetUrl,
  headDrive as headR2,
  joinKey,
  normalizePrefix,
} from '@/lib/drive-storage';
