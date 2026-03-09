/**
 * Telegram бот для обновления дат доставки в Supabase
 * Запуск с polling (например локально или на Railway).
 * Для бесплатного хостинга используй Vercel — см. ИНСТРУКЦИЯ_VERCEL.md
 */

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { initSupabase } = require('./supabase');
const { registerBotHandlers } = require('./lib/botHandlers');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!BOT_TOKEN) {
    console.error('❌ Ошибка: TELEGRAM_BOT_TOKEN не установлен!');
    process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Ошибка: SUPABASE_URL или SUPABASE_SERVICE_ROLE_KEY не установлены!');
    process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

try {
    initSupabase(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    console.log('✅ Supabase подключен');
} catch (error) {
    console.error('❌ Ошибка подключения к Supabase:', error.message);
    process.exit(1);
}

registerBotHandlers(bot);
console.log('🤖 Бот запущен (polling). Готов к работе!');

bot.on('polling_error', (err) => console.error('Ошибка polling:', err));

process.on('SIGINT', () => { bot.stopPolling(); process.exit(0); });
process.on('SIGTERM', () => { bot.stopPolling(); process.exit(0); });
