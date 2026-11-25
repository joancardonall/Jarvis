import { AppError } from './errors.js';
import { madridDate, TIME_ZONE } from './validation.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_MESSAGE = 3900; // Telegram accepts 4096 characters; keep a margin.

// Telegram is optional. Without both values nothing is ever sent (fails closed).
export function telegramSettings(env) {
  if (!/^[0-9]{6,12}:[A-Za-z0-9_-]{30,60}$/.test(env.TELEGRAM_BOT_TOKEN ?? '') ||
      !/^-?[0-9]{1,20}$/.test(env.TELEGRAM_CHAT_ID ?? '')) return null;
  return { token: env.TELEGRAM_BOT_TOKEN, chat: env.TELEGRAM_CHAT_ID };
}

// Sends plain text (no Markdown/HTML parsing, so stored text can never inject formatting or links
// with hidden targets). The bot token is part of the URL required by Telegram: never log it.
// Returns 'sent', 'rejected' (Telegram answered with an error: certainly not delivered) or
// 'unknown' (no usable answer, for example a timeout: the message may or may not have arrived).
export async function sendTelegram(settings, text, fetchUpstream) {
  // Cut by whole characters so an emoji is never split in half.
  const characters = Array.from(text);
  const body = characters.length > MAX_MESSAGE ? `${characters.slice(0, MAX_MESSAGE).join('')}\n…` : text;
  let response;
  try {
    response = await fetchUpstream(`https://api.telegram.org/bot${settings.token}/sendMessage`, {
      method: 'POST', signal: AbortSignal.timeout(10000), headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: settings.chat, text: body, disable_web_page_preview: true }),
    });
  } catch { return 'unknown'; }
  if (!response.ok) return 'rejected';
  try { return (await response.json())?.ok === true ? 'sent' : 'rejected'; }
  catch { return 'unknown'; }
}

// On-demand delivery (tool or API): sends today's summary now, outside the once-a-day ledger.
export async function sendSummaryNow(env, summaryService, owner, fetchUpstream) {
  const settings = telegramSettings(env);
  if (!settings) throw new AppError(503, 'telegram_not_configured');
  const summary = await summaryService.daily(owner);
  if (await sendTelegram(settings, summary.text, fetchUpstream) !== 'sent') throw new AppError(502, 'telegram_failed');
  return { sent: true, date: summary.date };
}

export function madridHour(now) {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', hourCycle: 'h23' }).format(new Date(now)));
}

// Scheduled delivery. The cron fires at 05:30-08:30 UTC (UTC has no daylight saving), that is
// 06:30-09:30 in Madrid in winter and 07:30-10:30 in summer. SUMMARY_HOUR may be 6, 7 or 8 so that
// several firings always remain for retries; any other value means 7.
// The ledger row for (owner, day) guarantees one message at most. Only a send that Telegram
// explicitly rejected is retried by a later firing; when the outcome is unknown nothing is resent,
// because a missing summary is preferred to a duplicate. A day with nothing to report is skipped.
export async function runScheduledSummary(env, repository, summaryService, { fetchUpstream, now }) {
  const settings = telegramSettings(env);
  if (!settings || !UUID.test(env.DEV_OWNER_ID ?? '')) return 'not_configured';
  const hour = /^[678]$/.test(env.SUMMARY_HOUR ?? '') ? Number(env.SUMMARY_HOUR) : 7;
  if (madridHour(now) < hour) return 'too_early';
  const owner = env.DEV_OWNER_ID;
  const date = madridDate(now);
  // Claim before reading anything else: later firings of the same morning stop here.
  if (!await repository.claimSummary(owner, date, new Date(now))) return 'already_handled';
  let status = 'failed'; // nothing was sent yet if building the summary throws: safe to retry
  try {
    const summary = await summaryService.daily(owner, { date });
    const outcome = summary.is_empty ? 'skipped' : await sendTelegram(settings, summary.text, fetchUpstream);
    status = outcome === 'rejected' ? 'failed' : outcome;
  } finally {
    await repository.finishSummary(owner, date, status, new Date(now));
  }
  return status;
}
