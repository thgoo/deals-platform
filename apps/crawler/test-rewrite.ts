import { rewriteLinks } from './src/affiliates/rewriter';
import { config } from './src/config';

const testUrls = [
  // Amazon
  'https://amzn.to/abc123',
  'https://www.amazon.com.br/dp/B08XYZ?tag=old-20',
  // Shopee
  'https://s.shopee.com.br/xyz456',
  'https://shopee.com.br/product/123/456',
  // Mercado Livre
  'https://mercadolivre.com/sec/abc',
  'https://www.mercadolivre.com.br/p/MLB123456',
  // AliExpress
  'https://s.click.aliexpress.com/e/_abc123',
  'https://pt.aliexpress.com/item/1005010292810671.html',
  // Magalu
  'https://curt.link/AYOZB',
  'https://www.magazinevoce.com.br/magazineadrmc/console/p/sku123/',
  // Natura
  'https://natura.divulgador.link/xyz',
];

async function testSingleUrl(originalUrl: string): Promise<void> {
  console.log('\n' + '='.repeat(80));
  console.log('\n📎 URL ORIGINAL');
  console.log(`   ${originalUrl}`);
  console.log(`   ${originalUrl.length} caracteres`);

  // Call the REAL rewriter code (this is the actual production code!)
  const results = await rewriteLinks([originalUrl], config.affiliates);
  const rewrittenUrl = results[0];

  if (!rewrittenUrl) {
    console.log('\n❌ ERRO');
    console.log('   Rewriter retornou undefined/null');
    return;
  }

  // Show result
  console.log('\n📤 URL REESCRITA');
  console.log(`   ${rewrittenUrl}`);
  console.log(`   ${rewrittenUrl.length} caracteres`);

  // Summary
  if (rewrittenUrl !== originalUrl) {
    console.log('\n📝 DIFERENÇA:');
    console.log(`   Antes:  ${originalUrl}`);
    console.log(`   Depois: ${rewrittenUrl}`);
  } else {
    console.log('\n⚠️  SEM MODIFICAÇÃO');
    console.log('   Motivos possíveis:');
    console.log('   - Provider não configurado no .env');
    console.log('   - Nenhum provider encontrado');
    console.log('   - Provider retornou null');
  }
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║         Test Rewrite - Affiliate Link Rewriter            ║');
  console.log('║         (Usa código REAL de produção)                     ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  const urlToTest = process.argv[2];

  if (urlToTest) {
    // Test specific URL
    await testSingleUrl(urlToTest);
  } else {
    // Test all example URLs
    console.log('\n💡 Testando URLs de exemplo...');
    console.log('   Use: bun test-rewrite.ts "<url>" para testar URL específica\n');

    for (const url of testUrls) {
      await testSingleUrl(url);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('\n✅ Testes concluídos!\n');
  console.log('💡 Dica: Veja os logs [INFO], [WARN], [ERROR] para detalhes internos\n');
}

main().catch(error => {
  console.error('\n❌ Erro fatal:', error);
  process.exit(1);
});
