/** Cloud Drive storage. Names kept so existing /api/drive imports keep working. */
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
