import crypto from 'crypto';

// ========== CONFIGURAÇÃO ==========
const APP_KEY = '522414';
const APP_SECRET = '0WoYxWgXgioM12EPxBEQvtspn22L4lhM';
const TRACKING_ID = 'bargah';

// ========== FUNÇÃO PARA LIMPAR URL ==========
function cleanProductUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    // Remove todos os query params, mantém só protocolo + host + pathname
    return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
  } catch {
    console.error('❌ URL inválida:', url);
    process.exit(1);
  }
}

// ========== FUNÇÃO DE ASSINATURA ==========
function generateSign(params: Record<string, string>, appSecret: string): string {
  // 1. Ordena os parâmetros por chave (alfabeticamente)
  const sortedKeys = Object.keys(params).sort();

  // 2. Concatena: app_secret + k1+v1 + k2+v2 + ... + app_secret
  let signString = appSecret;
  for (const key of sortedKeys) {
    signString += key + params[key];
  }
  signString += appSecret;

  // 3. Calcula MD5 e retorna em maiúsculas
  return crypto.createHash('md5').update(signString, 'utf8').digest('hex').toUpperCase();
}

// ========== FUNÇÃO PRINCIPAL ==========
function generateAffiliateLink(productUrl: string): string {
  const timestamp = Date.now().toString();

  // Parâmetros da requisição (sem o 'sign')
  const params: Record<string, string> = {
    app_key: APP_KEY,
    format: 'json',
    method: 'aliexpress.affiliate.link.generate',
    promotion_link_type: '0',
    ship_to_country: 'BR',
    sign_method: 'md5',
    source_values: productUrl,
    timestamp: timestamp,
    tracking_id: TRACKING_ID,
    v: '1',
  };

  // Gera a assinatura
  const sign = generateSign(params, APP_SECRET);
  params.sign = sign;

  // Monta a URL completa
  const baseUrl = 'https://api-sg.aliexpress.com/sync';
  const queryString = new URLSearchParams(params).toString();
  const fullUrl = `${baseUrl}?${queryString}`;

  return fullUrl;
}

// ========== EXECUÇÃO ==========
const rawUrl = process.argv[2] || 'https://pt.aliexpress.com/item/1005010292810671.html';

console.log('\n🔗 Gerando URL de afiliado...\n');
console.log('URL original:', rawUrl);

// Limpa a URL removendo query params
const cleanUrl = cleanProductUrl(rawUrl);
console.log('URL limpa:', cleanUrl);
console.log('Tracking ID:', TRACKING_ID);
console.log('\n' + '='.repeat(80) + '\n');

const fullUrl = generateAffiliateLink(cleanUrl);

console.log('✅ URL completa para o Postman:\n');
console.log(fullUrl);
console.log('\n' + '='.repeat(80) + '\n');
console.log('💡 Copie a URL acima e cole no Postman (método GET)\n');
