import axios from 'axios';
import { rewriteLinks } from './src/affiliates/rewriter';
import { config } from './src/config';

interface Deal {
  id: number;
  links: string[];
  store: string | null;
  product: string | null;
}

interface DealsResponse {
  items: Deal[];
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

async function updateDealLinks(dealId: number, links: string[]): Promise<boolean> {
  try {
    const headers = {
      'Content-Type': 'application/json',
      'X-Webhook-Secret': config.backend.secret,
    };

    await axios.patch(
      `${config.backend.baseUrl}/api/deals/${dealId}/links`,
      { links },
      { headers, timeout: 5000 },
    );
    return true;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(`❌ Failed to update deal #${dealId}: ${msg}`);
    return false;
  }
}

async function reprocessDeals(deals: Deal[], dryRun: boolean): Promise<void> {
  let changed = 0;
  let unchanged = 0;
  let noLinks = 0;

  for (const deal of deals) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📦 Deal #${deal.id} - ${deal.store || deal.product || 'Unknown'}`);

    if (!deal.links?.length) {
      console.log('   ⏭️  No links to reprocess');
      noLinks++;
      continue;
    }

    console.log(`   📎 ${deal.links.length} link(s)`);

    const rewritten = await rewriteLinks(deal.links, config.affiliates);

    const hasChanges = JSON.stringify(deal.links) !== JSON.stringify(rewritten);

    if (hasChanges) {
      console.log('   ✅ Links changed:');
      deal.links.forEach((original, i) => {
        const rewrittenLink = rewritten[i];
        if (original !== rewrittenLink) {
          console.log(`      Before: ${original}`);
          console.log(`      After:  ${rewrittenLink}`);
        }
      });

      if (!dryRun) {
        const updated = await updateDealLinks(deal.id, rewritten);
        if (updated) {
          console.log('   💾 Saved to database');
        }
      } else {
        console.log('   🔍 Dry run - not saving');
      }
      changed++;
    } else {
      console.log('   ⚪ No changes needed');
      unchanged++;
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 Summary:');
  console.log(`   Changed: ${changed}`);
  console.log(`   Unchanged: ${unchanged}`);
  console.log(`   No links: ${noLinks}`);
  console.log(`   Total: ${deals.length}`);
}

interface ParsedArgs {
  ids: number[] | null;
  count: number;
  dryRun: boolean;
  error?: string;
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  let dryRun = false;
  let mode: 'last' | 'ids' | null = null;
  const values: string[] = [];

  for (const arg of args) {
    if (arg === '--dry-run' || arg === '-d') {
      dryRun = true;
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
    return { ids: null, count: 0, dryRun, error: 'missing_mode' };
  }

  const numbers = values.map(v => parseInt(v, 10)).filter(n => !isNaN(n));

  if (mode === 'last') {
    const count = numbers[0] ?? 10;
    return { ids: null, count, dryRun };
  }

  if (mode === 'ids') {
    if (numbers.length === 0) {
      return { ids: null, count: 0, dryRun, error: 'no_ids' };
    }
    return { ids: numbers, count: 0, dryRun };
  }

  return { ids: null, count: 10, dryRun };
}

function printUsage(): void {
  console.log(`
🔄 Reprocess Deals - Rewrite affiliate links for existing deals

Usage:
  bun run reprocess-deals.ts --last [N]
  bun run reprocess-deals.ts --ids <id1> [id2] [id3] ...

Examples:
  bun run reprocess-deals.ts --last           # Last 10 deals (default)
  bun run reprocess-deals.ts --last 20        # Last 20 deals
  bun run reprocess-deals.ts -l 5             # Last 5 deals (short flag)
  bun run reprocess-deals.ts --ids 123 456    # Specific deal IDs
  bun run reprocess-deals.ts -i 789           # Single deal ID (short flag)
  bun run reprocess-deals.ts --dry-run --last 10  # Preview without saving

Options:
  --last, -l     Reprocess last N deals (default: 10)
  --ids, -i      Reprocess specific deal IDs
  --dry-run, -d  Preview changes without saving to database
  --help, -h     Show this help message
`);
}

async function main(): Promise<void> {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printUsage();
    return;
  }

  const { ids, count, dryRun, error } = parseArgs();

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

  await reprocessDeals(deals, dryRun);
}

main().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
