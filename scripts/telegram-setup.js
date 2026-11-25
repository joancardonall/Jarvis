import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { mustNotExist, writePrivate, runSafely } from './ops-config.js';

const FILE = '.env.telegram.json';
const TOKEN = /^[0-9]{6,12}:[A-Za-z0-9_-]{30,60}$/;

// Step 1: creates the private file later uploaded with `wrangler secret bulk`.
// The bot token is pasted locally by the developer, never in chat. JSON, as decided in D021.
export async function writeTelegramTemplate(path = FILE) {
  await mustNotExist(path);
  await writePrivate(path, JSON.stringify({ TELEGRAM_BOT_TOKEN: '', TELEGRAM_CHAT_ID: '' }, null, 2) + '\n');
}

// Step 2: after the developer has sent any message to the bot, asks Telegram which private chat
// wrote most recently and stores its id. Only that chat will ever receive summaries.
export async function fillChatId(path = FILE, fetchUpstream = fetch) {
  const settings = JSON.parse(await readFile(path, 'utf8'));
  if (!TOKEN.test(settings.TELEGRAM_BOT_TOKEN ?? '')) throw new Error('invalid_bot_token');
  const response = await fetchUpstream(`https://api.telegram.org/bot${settings.TELEGRAM_BOT_TOKEN}/getUpdates`,
    { signal: AbortSignal.timeout(10000) });
  const updates = response.ok ? (await response.json())?.result : null;
  if (!Array.isArray(updates)) throw new Error('telegram_unavailable');
  const chat = updates.map(update => update.message?.chat).filter(candidate => candidate?.type === 'private').at(-1);
  if (!Number.isSafeInteger(chat?.id)) throw new Error('no_private_message_found');
  await writeFile(path, JSON.stringify({ ...settings, TELEGRAM_CHAT_ID: String(chat.id) }, null, 2) + '\n', { mode: 0o600 });
  return { chatId: String(chat.id), name: typeof chat.first_name === 'string' ? chat.first_name.slice(0, 40) : '' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runSafely(async () => {
    if (process.argv.includes('--chat')) {
      const { chatId, name } = await fillChatId();
      console.log(`Chat ${chatId}${name ? ` (${name})` : ''} saved to ${FILE}. Check it is yours. No token printed.`);
      return;
    }
    await writeTelegramTemplate();
    console.log(`Created private ${FILE}. Paste the bot token locally (see docs/DEVELOPMENT.md).`);
  });
}
