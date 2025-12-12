import axios from 'axios';
import { config } from './src/config';

interface Deal {
  id: number;
  text: string;
  links: string[];
  product: string | null;
  productKey: string | null;
  category: string | null;
}

interface DealsResponse {
  items: Deal[];
}

interface ExtractResponse {
  productKey: string | null;
  category: string | null;
}

async function fetchDealsByIds(ids: number[]): Promise<Deal[]> {
  const deals: Deal[] = [];

  for (const id of ids) {
    try {
      const response = await axios.get<Deal>(
        `${config.backend.baseUrl}/api/deals/${id}`,
      );
      deals.push(response.data);
    } catch {
      console.log(`⚠️  Deal #${id} not found`);
    }
  }

  return deals;
}

async function fetchLastDeals(count: number): Promise<Deal[]> {
  const response = await axios.get<DealsResponse>(
    `${config.backend.baseUrl}/api/deals?limit=${count}`,
  );
  return response.data.items;
}

async function extractProductKey(deal: Deal): Promise<ExtractResponse | null> {
  try {
    const response = await axios.post<ExtractResponse>(
      `${config.extractor.baseUrl}/api/extractors/extract`,
      {
        text: deal.text,
        chat: 'backfill',
        messageId: deal.id,
        links: deal.links || [],
      },
      { timeout: 30000 },
    );
    return {
      productKey: response.data.productKey,
      category: response.data.category,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(`❌ Extraction failed for deal #${deal.id}: ${msg}`);
    return null;
  }
}

async function updateDealProductKey(
  dealId: number,
  productKey: string | null,
  category: string | null,
): Promise<boolean> {
  try {
    const headers = {
      'Content-Type': 'application/json',
      'X-Webhook-Secret': config.backend.secret,
    };

    await axios.patch(
      `${config.backend.baseUrl}/api/deals/${dealId}/product-key`,
      { product_key: productKey, category },
      { headers, timeout: 5000 },
    );
    return true;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(`❌ Failed to update deal #${dealId}: ${msg}`);
    return false;
  }
}

async function backfillDeals(deals: Deal[], dryRun: boolean, skipExisting: boolean): Promise<void> {
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  let noProductKey = 0;

  for (const deal of deals) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📦 Deal #${deal.id} - ${deal.product || 'Unknown'}`);

    if (skipExisting && deal.productKey) {
      console.log(`   ⏭️  Already has productKey: ${deal.productKey}`);
      skipped++;
      continue;
    }

    const extracted = await extractProductKey(deal);

    if (!extracted) {
      failed++;
      continue;
    }

    if (!extracted.productKey) {
      console.log('   ⚪ No productKey generated (product not comparable)');
      noProductKey++;
      continue;
    }

    console.log(`   🔑 productKey: ${extracted.productKey}`);
    console.log(`   📁 category: ${extracted.category}`);

    if (!dryRun) {
      const success = await updateDealProductKey(deal.id, extracted.productKey, extracted.category);
      if (success) {
        console.log('   💾 Saved to database');
        updated++;
      } else {
        failed++;
      }
    } else {
      console.log('   🔍 Dry run - not saving');
      updated++;
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 Summary:');
  console.log(`   Updated: ${updated}`);
  console.log(`   Skipped (existing): ${skipped}`);
  console.log(`   No productKey: ${noProductKey}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Total: ${deals.length}`);
}

interface ParsedArgs {
  ids: number[] | null;
  count: number;
  dryRun: boolean;
  skipExisting: boolean;
  error?: string;
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  let dryRun = false;
  let skipExisting = true;
  let mode: 'last' | 'ids' | null = null;
  const values: string[] = [];

  for (const arg of args) {
    if (arg === '--dry-run' || arg === '-d') {
      dryRun = true;
    } else if (arg === '--force' || arg === '-f') {
      skipExisting = false;
    } else if (arg === '--last' || arg === '-l') {
      mode = 'last';
    } else if (arg === '--ids' || arg === '-i') {
      mode = 'ids';
    } else if (arg === '--help' || arg === '-h') {
      continue;
    } else if (!arg.startsWith('-')) {
      values.push(arg);
    }
  }

  if (!mode) {
    return { ids: null, count: 0, dryRun, skipExisting, error: 'missing_mode' };
  }

  const numbers = values.map(v => parseInt(v, 10)).filter(n => !isNaN(n));

  if (mode === 'last') {
    const count = numbers[0] ?? 10;
    return { ids: null, count, dryRun, skipExisting };
  }

  if (mode === 'ids') {
    if (numbers.length === 0) {
      return { ids: null, count: 0, dryRun, skipExisting, error: 'no_ids' };
    }
    return { ids: numbers, count: 0, dryRun, skipExisting };
  }

  return { ids: null, count: 10, dryRun, skipExisting };
}

function printUsage(): void {
  console.log(`
🔑 Backfill Product Keys - Generate productKey for existing deals

Usage:
  bun run backfill-product-keys.ts --last [N]
  bun run backfill-product-keys.ts --ids <id1> [id2] [id3] ...

Examples:
  bun run backfill-product-keys.ts --last           # Last 10 deals (default)
  bun run backfill-product-keys.ts --last 50        # Last 50 deals
  bun run backfill-product-keys.ts -l 5             # Last 5 deals (short flag)
  bun run backfill-product-keys.ts --ids 123 456    # Specific deal IDs
  bun run backfill-product-keys.ts -i 789           # Single deal ID (short flag)
  bun run backfill-product-keys.ts --dry-run --last 10  # Preview without saving
  bun run backfill-product-keys.ts --force --last 10    # Re-process even if productKey exists

Options:
  --last, -l     Process last N deals (default: 10)
  --ids, -i      Process specific deal IDs
  --dry-run, -d  Preview changes without saving to database
  --force, -f    Re-process deals even if they already have a productKey
  --help, -h     Show this help message
`);
}

async function main(): Promise<void> {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printUsage();
    return;
  }

  const { ids, count, dryRun, skipExisting, error } = parseArgs();

  if (error === 'missing_mode') {
    console.log('❌ Please specify --last or --ids\n');
    printUsage();
    return;
  }

  if (error === 'no_ids') {
    console.log('❌ Please provide at least one deal ID with --ids\n');
    printUsage();
    return;
  }

  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be saved\n');
  }

  if (!skipExisting) {
    console.log('⚠️  FORCE MODE - Will re-process deals with existing productKey\n');
  }

  let deals: Deal[];

  if (ids) {
    console.log(`🔄 Fetching deals by IDs: ${ids.join(', ')}\n`);
    deals = await fetchDealsByIds(ids);
  } else {
    console.log(`🔄 Fetching last ${count} deals...\n`);
    deals = await fetchLastDeals(count);
  }

  if (deals.length === 0) {
    console.log('❌ No deals found');
    return;
  }

  console.log(`📦 Found ${deals.length} deal(s)`);

  await backfillDeals(deals, dryRun, skipExisting);
}

main().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
