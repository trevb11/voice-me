/**
 * after-pack.js — ad-hoc sign the bundle before the DMG is built.
 *
 * When no Developer ID is available, electron-builder skips signing entirely
 * and leaves the .app with no `Contents/_CodeSignature` at all. The inner
 * Mach-O is still linker-signed, so the app launches on the machine that built
 * it — but the BUNDLE's signature is inconsistent (`codesign --verify` reports
 * "code has no resources but signature indicates they must be present"), and on
 * Apple Silicon that can refuse to launch on someone else's Mac even after they
 * clear the quarantine flag.
 *
 * Ad-hoc signing (`--sign -`) makes the bundle internally consistent. It does
 * NOT get you past Gatekeeper — only Developer ID + notarisation does that, and
 * recipients still need to clear quarantine — but it is the difference between
 * "runs once you allow it" and "does not run at all".
 *
 * This is a no-op when a real identity is configured: electron-builder will
 * have signed properly, and re-signing ad-hoc would throw that away.
 */

const { execFileSync } = require('child_process');
const path = require('path');
const fs   = require('fs');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appName = `${context.packager.appInfo.productFilename}.app`;
  const appPath = path.join(context.appOutDir, appName);

  if (fs.existsSync(path.join(appPath, 'Contents', '_CodeSignature'))) {
    console.log('  • already signed with a real identity — leaving it alone');
    return;
  }

  console.log('  • no Developer ID; ad-hoc signing so the bundle is at least valid');
  execFileSync('codesign', [
    '--force',
    '--deep',                       // deprecated for real signing, fine ad-hoc
    '--sign', '-',
    '--timestamp=none',
    appPath,
  ], { stdio: 'inherit' });

  execFileSync('codesign', ['--verify', '--strict', appPath], { stdio: 'inherit' });
  console.log('  • ad-hoc signature verifies');
};
