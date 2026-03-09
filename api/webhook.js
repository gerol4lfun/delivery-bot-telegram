/**
 * Vercel serverless: сюда Telegram присылает обновления (вебхук).
 * Не нужен сервер 24/7 — запрос приходит только когда ты пишешь боту.
 */

const TelegramBot = require('node-telegram-bot-api');
const { initSupabase } = require('../supabase');
const { registerBotHandlers } = require('../lib/botHandlers');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Бот и Supabase инициализируются один раз за холодный старт
let bot = null;

function getBot() {
    if (bot) return bot;
    if (!BOT_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error('Не заданы TELEGRAM_BOT_TOKEN, SUPABASE_URL или SUPABASE_SERVICE_ROLE_KEY');
    }
    initSupabase(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    bot = new TelegramBot(BOT_TOKEN, { polling: false });
    registerBotHandlers(bot);
    return bot;
}

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        res.status(405).send('Only POST');
        return;
    }
    try {
        let update = req.body;
        if (!update) {
            res.status(400).send('No body');
            return;
        }
        if (typeof update === 'string') {
            try {
                update = JSON.parse(update);
            } catch (_) {
                res.status(400).send('Invalid JSON');
                return;
            }
        }
        getBot().processUpdate(update);
        // Даём время асинхронным ответам бота уйти до завершения функции (Vercel serverless)
        await new Promise((r) => setTimeout(r, 4000));
        res.status(200).end();
    } catch (err) {
        console.error('Webhook error:', err);
        res.status(500).send(err.message || 'Error');
    }
};
