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
export async function sendTelegram(settings, text, fetchUpstream) {
  const body = text.length > MAX_MESSAGE ? `${text.slice(0, MAX_MESSAGE)}\n…` : text;
  try {
    const response = await fetchUpstream(`https://api.telegram.org/bot${settings.token}/sendMessage`, {
      method: 'POST', signal: AbortSignal.timeout(10000), headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: settings.chat, text: body, disable_web_page_preview: true }),
    });
    return response.ok && (await response.json())?.ok === true;
  } catch { return false; }
}

// On-demand delivery (tool or API): sends today's summary now, outside the once-a-day ledger.
export async function sendSummaryNow(env, summaryService, owner, fetchUpstream) {
  const settings = telegramSettings(env);
  if (!settings) throw new AppError(503, 'telegram_not_configured');
  const summary = await summaryService.daily(owner);
  if (!await sendTelegram(settings, summary.text, fetchUpstream)) throw new AppError(502, 'telegram_failed');
  return { sent: true, date: summary.date };
}

export function madridHour(now) {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', hourCycle: 'h23' }).format(new Date(now)));
}

// Scheduled delivery. The cron fires several times each morning (UTC has no daylight saving);
// the ledger row for (owner, day) guarantees one message at most, and a failed send is retried
// by a later firing. A day with nothing to report is recorded as skipped: no noise.
export async function runScheduledSummary(env, repository, summaryService, { fetchUpstream, now }) {
  const settings = telegramSettings(env);
  if (!settings || !UUID.test(env.DEV_OWNER_ID ?? '')) return 'not_configured';
  const hour = /^([0-9]|1[0-9]|2[0-3])$/.test(env.SUMMARY_HOUR ?? '') ? Number(env.SUMMARY_HOUR) : 7;
  if (madridHour(now) < hour) return 'too_early';
  const owner = env.DEV_OWNER_ID;
  const date = madridDate(now);
  // Claim before reading anything else: later firings of the same morning stop here.
  if (!await repository.claimSummary(owner, date, new Date(now))) return 'already_handled';
  let status = 'failed';
  try {
    const summary = await summaryService.daily(owner, { date });
    status = summary.is_empty ? 'skipped' : (await sendTelegram(settings, summary.text, fetchUpstream) ? 'sent' : 'failed');
  } finally {
    await repository.finishSummary(owner, date, status, new Date(now));
  }
  return status;
}
