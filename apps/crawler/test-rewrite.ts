import { rewriteLinks } from './src/affiliates/rewriter';
import { expandUrl } from './src/affiliates/url-expander';
import { config } from './src/config';

async function testSingleUrl(originalUrl: string): Promise<void> {
  console.log('\n' + '='.repeat(80));
  console.log('\n📎 ORIGINAL URL');
  console.log(`   ${originalUrl}`);
  console.log(`   ${originalUrl.length} characters`);

  const results = await rewriteLinks([originalUrl], config.affiliates);
  const rewrittenUrl = results[0];

  if (!rewrittenUrl) {
    console.log('\n❌ ERROR');
    console.log('   Rewriter returned undefined/null');
    return;
  }

  const expandedUrl = await expandUrl(originalUrl);

  if (expandedUrl != rewrittenUrl) {
    console.log('\n🌐 EXPANDED URL');
    console.log(`   ${expandedUrl}`);
  }

  if (rewrittenUrl !== originalUrl) {
    console.log('\n📝 DIFFERENCE:');
    console.log(`   Before:  ${originalUrl}`);
    if (expandedUrl !== originalUrl) {
      console.log(`   Expanded: ${expandedUrl}`);
    }
    console.log(`   After: ${rewrittenUrl}`);
  } else {
    console.log('\n⚠️  NO MODIFICATION');
    console.log('   Possible reasons:');
    console.log('   - Provider not configured in .env');
    console.log('   - No provider found');
    console.log('   - Provider returned null');
  }
}

async function main() {
  const urlToTest = process.argv[2];

  if (!urlToTest) {
    console.log('\n🚨 No URL provided!');
    return;
  }

  await testSingleUrl(urlToTest);
}

main().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
