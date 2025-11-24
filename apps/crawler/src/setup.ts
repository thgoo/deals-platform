import 'dotenv/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as readline from 'readline';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';

const API_ID = parseInt(process.env.TG_API_ID || '0');
const API_HASH = process.env.TG_API_HASH || '';
const SESSION_DIR = process.env.SESSION_DIR || './sessions';
const SESSION_NAME = process.env.SESSION_NAME || 'promo_session';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt: string): Promise<string> {
  return new Promise(resolve => {
    rl.question(prompt, resolve);
  });
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     Telegram Crawler - Authentication Setup               ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  if (!API_ID || !API_HASH) {
    console.error('❌ Error: TG_API_ID and TG_API_HASH must be set in .env');
    console.error('\nCreate a .env file with:');
    console.error('  TG_API_ID=your_api_id');
    console.error('  TG_API_HASH=your_api_hash');
    rl.close();
    process.exit(1);
  }

  console.log(`✓ API_ID: ${API_ID}`);
  console.log(`✓ API_HASH: ${API_HASH.substring(0, 10)}...`);
  console.log(`✓ Session Dir: ${SESSION_DIR}\n`);

  // Create session directory
  await fs.mkdir(SESSION_DIR, { recursive: true });

  const sessionPath = path.join(SESSION_DIR, `${SESSION_NAME}.session`);
  let sessionString = '';

  try {
    sessionString = await fs.readFile(sessionPath, 'utf-8');
    console.log('✓ Existing session found. Reusing...\n');
  } catch {
    console.log('ℹ Creating new session...\n');
  }

  const session = new StringSession(sessionString);
  const client = new TelegramClient(session, API_ID, API_HASH, {
    connectionRetries: 5,
  });

  try {
    await client.start({
      phoneNumber: async () => await question('Enter phone number: '),
      password: async () => await question('Enter password: '),
      phoneCode: async () => await question('Enter code: '),
      onError: err => console.error(err),
    });

    const isAuthorized = await client.isUserAuthorized();
    if (!isAuthorized) {
      console.error('❌ Error: Unauthorized');
      rl.close();
      process.exit(1);
    }

    // Save session
    const newSessionString = client.session.save();
    if (typeof newSessionString === 'string') {
      await fs.writeFile(sessionPath, newSessionString, 'utf-8');
      console.log(`✓ Session saved to ${sessionPath}\n`);
    }

    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║     ✓ Setup Complete!                                     ║');
    console.log('║     You can now run: bun run dev                          ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    rl.close();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error);
    rl.close();
    process.exit(1);
  }
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  rl.close();
  process.exit(1);
});
