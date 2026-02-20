import axios from 'axios';
import { config } from './src/config';

interface Deal {
  id: number;
  text: string;
  chat: string;
  ts: string;
  links: string[];
  product: string | null;
  store: string | null;
}

interface DealsResponse {
  items: Deal[];
  nextCursor: string | null;
  hasMore: boolean;
}

interface ExtractResponse {
  text: string;
  description: string | null;
  product: string | null;
  store: string | null;
  price: number | null;
  coupons: unknown[];
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
    `${config.backend.baseUrl}/api/deals?limit=${Math.min(count, 100)}`,
  );
  return response.data.items.slice(0, count);
}

async function fetchDealsByRange(from: Date, to: Date): Promise<Deal[]> {
  const deals: Deal[] = [];
  let cursor: string | null = null;

  // Fetch all pages within the date range
  do {
    const params = new URLSearchParams({
      limit: '100',
      from: from.toISOString(),
      to: to.toISOString(),
    });
    if (cursor) params.set('cursor', cursor);

    const response = await axios.get<DealsResponse>(
      `${config.backend.baseUrl}/api/deals?${params}`,
    );

    deals.push(...response.data.items);
    cursor = response.data.hasMore ? response.data.nextCursor : null;
  } while (cursor);

  return deals;
}

async function extractDeal(deal: Deal): Promise<ExtractResponse | null> {
  try {
    const response = await axios.post<ExtractResponse>(
      `${config.extractor.baseUrl}/api/extractors/extract`,
      {
        text: deal.text,
        chat: deal.chat,
        messageId: deal.id,
        links: deal.links || [],
      },
      { timeout: 30000 },
    );
    return response.data;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(`❌ Extraction failed for deal #${deal.id}: ${msg}`);
    return null;
  }
}

async function updateDealExtracted(dealId: number, extracted: ExtractResponse): Promise<boolean> {
  try {
    await axios.patch(
      `${config.backend.baseUrl}/api/deals/${dealId}/extracted`,
      {
        text: extracted.text,
        description: extracted.description,
        product: extracted.product,
        store: extracted.store,
        price: extracted.price,
        coupons: extracted.coupons,
        product_key: extracted.productKey,
        category: extracted.category,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Secret': config.backend.secret,
        },
        timeout: 5000,
      },
    );
    return true;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(`❌ Failed to update deal #${dealId}: ${msg}`);
    return false;
  }
}

async function reprocessDeals(deals: Deal[], dryRun: boolean): Promise<void> {
  let updated = 0;
  let failed = 0;

  for (const deal of deals) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📦 Deal #${deal.id} - ${deal.product || deal.store || 'Unknown'}`);

    const extracted = await extractDeal(deal);

    if (!extracted) {
      failed++;
      continue;
    }

    console.log(`   📝 product:    ${extracted.product ?? '(null)'}`);
    console.log(`   🏪 store:      ${extracted.store ?? '(null)'}`);
    console.log(`   💰 price:      ${extracted.price != null ? `R$ ${(extracted.price / 100).toFixed(2)}` : '(null)'}`);
    console.log(`   🔑 productKey: ${extracted.productKey ?? '(null)'}`);
    console.log(`   📁 category:   ${extracted.category ?? '(null)'}`);

    if (!dryRun) {
      const success = await updateDealExtracted(deal.id, extracted);
      if (success) {
        console.log('   💾 Saved');
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
  console.log(`   Failed:  ${failed}`);
  console.log(`   Total:   ${deals.length}`);
}

interface ParsedArgs {
  mode: 'last' | 'ids' | 'range' | null;
  ids: number[] | null;
  count: number;
  from: Date | null;
  to: Date | null;
  dryRun: boolean;
  error?: string;
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  let dryRun = false;
  let mode: 'last' | 'ids' | 'range' | null = null;
  const values: string[] = [];
  let fromStr: string | null = null;
  let toStr: string | null = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dry-run' || arg === '-d') {
      dryRun = true;
    } else if (arg === '--last' || arg === '-l') {
      mode = 'last';
    } else if (arg === '--ids' || arg === '-i') {
      mode = 'ids';
    } else if (arg === '--range' || arg === '-r') {
      mode = 'range';
    } else if (arg === '--from' || arg === '-f') {
      fromStr = args[++i] ?? null;
    } else if (arg === '--to' || arg === '-t') {
      toStr = args[++i] ?? null;
    } else if (arg === '--help' || arg === '-h') {
      continue;
    } else if (!arg.startsWith('-')) {
      values.push(arg);
    }
  }

  // --range shorthand: accept --from/--to without explicit --range
  if (!mode && (fromStr || toStr)) {
    mode = 'range';
  }

  if (!mode) {
    return { mode: null, ids: null, count: 0, from: null, to: null, dryRun, error: 'missing_mode' };
  }

  const numbers = values.map(v => parseInt(v, 10)).filter(n => !isNaN(n));

  if (mode === 'last') {
    return { mode, ids: null, count: numbers[0] ?? 10, from: null, to: null, dryRun };
  }

  if (mode === 'ids') {
    if (numbers.length === 0) {
      return { mode, ids: null, count: 0, from: null, to: null, dryRun, error: 'no_ids' };
    }
    return { mode, ids: numbers, count: 0, from: null, to: null, dryRun };
  }

  if (mode === 'range') {
    const from = fromStr ? new Date(fromStr) : null;
    const to = toStr ? new Date(toStr) : new Date(); // default to now

    if (!from || isNaN(from.getTime())) {
      return { mode, ids: null, count: 0, from: null, to: null, dryRun, error: 'invalid_from' };
    }
    if (isNaN(to.getTime())) {
      return { mode, ids: null, count: 0, from: null, to: null, dryRun, error: 'invalid_to' };
    }

    return { mode, ids: null, count: 0, from, to, dryRun };
  }

  return { mode: null, ids: null, count: 10, from: null, to: null, dryRun };
}

function printUsage(): void {
  console.log(`
🔄 Reprocess Extracted - Re-run extractor and update all extracted fields

Usage:
  bun run reprocess-extracted.ts --last [N]
  bun run reprocess-extracted.ts --ids <id1> [id2] [id3] ...
  bun run reprocess-extracted.ts --from <date> [--to <date>]

Examples:
  bun run reprocess-extracted.ts --last              # Last 10 deals (default)
  bun run reprocess-extracted.ts --last 50           # Last 50 deals
  bun run reprocess-extracted.ts --ids 123 456       # Specific deal IDs
  bun run reprocess-extracted.ts --from 2026-01-10 --to 2026-01-20
  bun run reprocess-extracted.ts --from 2026-01-10   # From date until now
  bun run reprocess-extracted.ts --dry-run --from 2026-01-10 --to 2026-01-20

Options:
  --last, -l       Process last N deals (default: 10)
  --ids, -i        Process specific deal IDs
  --from, -f       Start date for range (YYYY-MM-DD or ISO datetime)
  --to, -t         End date for range (YYYY-MM-DD or ISO datetime), defaults to now
  --dry-run, -d    Preview changes without saving to database
  --help, -h       Show this help message
`);
}

async function main(): Promise<void> {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printUsage();
    return;
  }

  const { mode, ids, count, from, to, dryRun, error } = parseArgs();

  if (error === 'missing_mode') {
    console.log('❌ Please specify --last, --ids, or --from\n');
    printUsage();
    return;
  }

  if (error === 'no_ids') {
    console.log('❌ Please provide at least one deal ID with --ids\n');
    printUsage();
    return;
  }

  if (error === 'invalid_from') {
    console.log('❌ Invalid --from date. Use YYYY-MM-DD or ISO format.\n');
    printUsage();
    return;
  }

  if (error === 'invalid_to') {
    console.log('❌ Invalid --to date. Use YYYY-MM-DD or ISO format.\n');
    printUsage();
    return;
  }

  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be saved\n');
  }

  let deals: Deal[];

  if (mode === 'ids' && ids) {
    console.log(`🔄 Fetching deals by IDs: ${ids.join(', ')}\n`);
    deals = await fetchDealsByIds(ids);
  } else if (mode === 'range' && from && to) {
    console.log(`🔄 Fetching deals from ${from.toISOString()} to ${to.toISOString()}...\n`);
    deals = await fetchDealsByRange(from, to);
  } else {
    console.log(`🔄 Fetching last ${count} deals...\n`);
    deals = await fetchLastDeals(count);
  }

  if (deals.length === 0) {
    console.log('❌ No deals found');
    return;
  }

  console.log(`📦 Found ${deals.length} deal(s)`);

  await reprocessDeals(deals, dryRun);
}

main().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
