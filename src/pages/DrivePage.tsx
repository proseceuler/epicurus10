/*
 * Temporary note for local setup.
 * The full DrivePage is at commit 1d308e3 (pre-P0 working version).
 *
 * PowerShell (from repo root):
 *   Invoke-WebRequest -UseBasicParsing `
 *     -Uri "https://raw.githubusercontent.com/proseceuler/epicurus10/1d308e332325e6a81a054b847d0df0b10220be0e/src/pages/DrivePage.tsx" `
 *     -OutFile "src\pages\DrivePage.tsx"
 *
 * Optional P0 helpers (driveKit) already on this branch:
 *   Invoke-WebRequest -UseBasicParsing `
 *     -Uri "https://raw.githubusercontent.com/proseceuler/epicurus10/drive-p0-polish/src/pages/driveKit.tsx" `
 *     -OutFile "src\pages\driveKit.tsx"
 */
export { default } from '../pages/DrivePage';
