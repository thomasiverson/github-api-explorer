/**
 * CLI script to import GitHub's OpenAPI spec into the database.
 * 
 * Usage:
 *   npx tsx scripts/import-openapi.ts [version]
 * 
 * Examples:
 *   npx tsx scripts/import-openapi.ts                  # imports api.github.com (cloud)
 *   npx tsx scripts/import-openapi.ts ghes-3.12        # imports GHES 3.12
 */

import { replaceEndpoints, getEndpointCount } from '../src/lib/db';
import { importOpenApiSpec } from '../src/lib/openapi-import';

async function main() {
  const specVersion = process.argv[2] || 'api.github.com';

  console.log(`\n🔄 GitHub REST API OpenAPI Importer\n`);
  console.log(`Spec version: ${specVersion}`);
  console.log(`─────────────────────────────────────\n`);

  try {
    const result = await importOpenApiSpec(
      { replaceEndpoints },
      specVersion
    );

    const totalCount = getEndpointCount();

    console.log(`\n✅ Import complete!`);
    console.log(`   Imported: ${result.count} endpoints`);
    console.log(`   Categories: ${result.categories}`);
    console.log(`   Total in DB: ${totalCount}\n`);
  } catch (err) {
    console.error(`\n❌ Import failed:`, err);
    process.exit(1);
  }
}

main();
