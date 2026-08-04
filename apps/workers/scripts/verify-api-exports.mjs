/**
 * Runtime check of the @forgemsg/api subpath exports that apps/workers uses.
 *
 * Four of the six edges are `await import(...)` inside a job handler. TypeScript
 * resolves those against the "types" condition, but nothing proves the "import"
 * condition actually resolves at runtime until something imports them for real —
 * and a dynamic import only runs when that job fires. This script forces all six.
 *
 * Run from apps/workers so resolution uses the workers node_modules tree:
 *   node scripts/verify-api-exports.mjs
 */
const SUBPATHS = [
  ['@forgemsg/api/services/campaigns/email-coupon-merge', 'resolveEmailCouponTags'],
  ['@forgemsg/api/services/dedicated-ips', 'pickIpForSend'],
  ['@forgemsg/api/services/push/mobile', 'sendContactMobilePush'],
  ['@forgemsg/api/services/push/get-adapter', 'getPushAdapterForOrg'],
  ['@forgemsg/api/services/rcs', null],
  ['@forgemsg/api/services/rcs/providers', null],
];

let failed = 0;

for (const [spec, expectedExport] of SUBPATHS) {
  try {
    const mod = await import(spec);
    const names = Object.keys(mod);
    if (expectedExport && !names.includes(expectedExport)) {
      console.log(`FAIL   ${spec}`);
      console.log(`       resolved, but '${expectedExport}' is not exported. Has: ${names.join(', ')}`);
      failed++;
    } else {
      console.log(`OK     ${spec}  (${names.length} exports${expectedExport ? `, '${expectedExport}' present` : ''})`);
    }
  } catch (err) {
    console.log(`FAIL   ${spec}`);
    console.log(`       ${err.code ?? err.name}: ${err.message.split('\n')[0]}`);
    failed++;
  }
}

console.log(`\n${SUBPATHS.length - failed}/${SUBPATHS.length} subpaths resolved at runtime`);
process.exit(failed ? 1 : 0);
