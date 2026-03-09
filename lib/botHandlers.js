/**
 * Общая логика бота: команды и обработка сообщений с датами.
 * Используется и при polling (index.js), и при webhook (api/webhook.js).
 */

const { parseDeliveryDates, formatParsedResults } = require('../parser');
const { updateDeliveryDates } = require('../supabase');

const APP_VERSION = process.env.APP_VERSION || 'v186-bot';
const BUILD_SHA =
    process.env.RAILWAY_GIT_COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.SOURCE_VERSION ||
    'unknown';
const ADMIN_USER_ID = process.env.ADMIN_USER_ID ? parseInt(process.env.ADMIN_USER_ID, 10) : null;

function registerBotHandlers(bot) {
    // Команда /version
    bot.onText(/\/version/i, (msg) => {
        bot.sendMessage(
            msg.chat.id,
            `app=${APP_VERSION}\nsha=${BUILD_SHA}\nnode=${process.version}`
        );
    });

    // Команда /start
    bot.onText(/\/start/, (msg) => {
        const chatId = msg.chat.id;
        const welcomeMessage = `
🤖 <b>Бот для обновления дат доставки</b>

📝 <b>Как использовать:</b>
Просто отправьте мне текст в формате:

<i>Москва с 9.02
Тула с 9.02
Питер с 8.02
Воронеж с 12.02</i>

Или с исключениями (два формата):
<i>Москва с 12.02, кроме 13.02, 14.02
Тула с 12.02 (кроме 13.02, 14.02)</i>

Бот автоматически:
1️⃣ Распарсит данные
2️⃣ Покажет что будет обновлено
3️⃣ Обновит данные в Supabase
4️⃣ Отправит подтверждение

📋 <b>Команды:</b>
/start - показать это сообщение
/help - помощь
    `;
        bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'HTML' });
    });

    // Команда /help
    bot.onText(/\/help/, (msg) => {
        const chatId = msg.chat.id;
        const helpMessage = `
📋 <b>Формат данных:</b>

Каждая строка должна быть в формате:
<b>Город с ДД.ММ</b>

Примеры:
• Москва с 9.02
• Санкт-Петербург с 8.02
• Москва с 12.02, кроме 13.02, 14.02
• Тула с 12.02 (кроме 13.02, 14.02)

<b>Важно:</b>
• Каждый город на новой строке
• Дата в формате ДД.ММ (например: 9.02, 12.02)
• Исключения можно указывать двумя способами:
  - С запятой: "Москва с 12.02, кроме 13.02, 14.02"
  - Со скобками: "Москва с 12.02 (кроме 13.02, 14.02)"
    `;
        bot.sendMessage(chatId, helpMessage, { parse_mode: 'HTML' });
    });

    // Обработка текстовых сообщений (даты доставки)
    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const text = msg.text || msg.caption || '';

        if (text && text.startsWith('/')) return;

        if (ADMIN_USER_ID && msg.from.id !== ADMIN_USER_ID) {
            bot.sendMessage(chatId, '❌ У вас нет доступа к этому боту.');
            return;
        }

        if (!text || text.trim().length === 0) {
            bot.sendMessage(chatId, '❌ Пожалуйста, отправьте текст с датами доставки.');
            return;
        }

        try {
            bot.sendMessage(chatId, '⏳ Обрабатываю данные...');

            const parsedData = parseDeliveryDates(text);

            if (parsedData.length === 0) {
                bot.sendMessage(chatId, '❌ Не найдено ни одной записи в правильном формате.\n\nИспользуйте формат: "Город с ДД.ММ"\n\nПример: Москва с 9.02');
                return;
            }

            const preview = formatParsedResults(parsedData);
            bot.sendMessage(chatId, preview + '\n\n⏳ Обновляю данные в Supabase...');

            const results = await updateDeliveryDates(parsedData);

            let report = `✅ <b>Обновление завершено!</b>\n\n`;
            report += `📊 Всего обработано: ${results.total}\n`;
            report += `✅ Успешно: ${results.success.length}\n`;

            if (results.failed.length > 0) {
                report += `❌ Ошибок: ${results.failed.length}\n\n`;
                report += `<b>Ошибки:</b>\n`;
                results.failed.forEach(item => {
                    report += `• ${item.city}: ${item.error}\n`;
                });
            }

            if (results.success.length > 0) {
                report += `\n<b>Обновленные города:</b>\n`;
                results.success.slice(0, 15).forEach(item => {
                    let line = `• ${item.city} - ${item.date}`;
                    if (item.assembly_date && item.assembly_date !== item.date) {
                        line += `, сборки с ${item.assembly_date}`;
                    }
                    if (item.restrictions) {
                        line += ` (кроме ${item.restrictions})`;
                    }
                    line += ' (обновлен)';
                    report += line + '\n';
                });
                if (results.success.length > 15) {
                    report += `\n... и еще ${results.success.length - 15} городов`;
                }
            }

            bot.sendMessage(chatId, report, { parse_mode: 'HTML' });
        } catch (error) {
            console.error('Ошибка обработки сообщения:', error);
            bot.sendMessage(chatId, `❌ Произошла ошибка: ${error.message}\n\nПопробуйте еще раз или обратитесь к администратору.`);
        }
    });
}

module.exports = { registerBotHandlers };
