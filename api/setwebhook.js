/**
 * Один раз после деплоя открой в браузере:
 * https://ТВОЙ-ПРОЕКТ.vercel.app/api/setwebhook?secret=ТВОЙ_СЕКРЕТ
 * (secret = значение переменной WEBHOOK_SECRET в Vercel)
 * Тогда Telegram начнёт слать сообщения на вебхук, и бот будет работать.
 */

const TelegramBot = require('node-telegram-bot-api');

module.exports = async function handler(req, res) {
    if (req.method !== 'GET') {
        res.status(405).send('Only GET');
        return;
    }
    const secret = req.query.secret;
    const expected = process.env.WEBHOOK_SECRET;
    if (!expected || secret !== expected) {
        res.status(403).send('Forbidden: wrong or missing secret');
        return;
    }
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
        res.status(500).send('TELEGRAM_BOT_TOKEN not set');
        return;
    }
    // Лучше использовать основной домен (WEBHOOK_BASE_URL), чтобы вебхук не привязывался к одному деплою
    const base = process.env.WEBHOOK_BASE_URL
        || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
    if (!base) {
        res.status(500).send('VERCEL_URL or WEBHOOK_BASE_URL not set');
        return;
    }
    const webhookUrl = `${base}/api/webhook`;
    const bot = new TelegramBot(token, { polling: false });
    try {
        await bot.setWebHook(webhookUrl);
        res.send(`✅ Вебхук включён: ${webhookUrl}\n\nБот теперь работает через Vercel. Можешь писать ему в Telegram.`);
    } catch (err) {
        console.error('setWebHook error:', err);
        res.status(500).send('Error: ' + err.message);
    }
};
