/**
 * Telegram бот для обновления дат доставки в Supabase
 * 
 * 📍 Проект на Railway: Telegram Bot - Delivery Dates
 * 🔗 Репозиторий: delivery-bot-telegram
 */

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { parseDeliveryDates, formatParsedResults } = require('./parser');
const { initSupabase, updateDeliveryDates } = require('./supabase');

// Версионирование для отладки
// Проект калькулятора: v205
const APP_VERSION = process.env.APP_VERSION || "v186-bot";
const BUILD_SHA =
    process.env.RAILWAY_GIT_COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    process.env.SOURCE_VERSION ||
    "unknown";

console.log(
    `[BOOT] app=${APP_VERSION} sha=${BUILD_SHA} node=${process.version} cwd=${process.cwd()} file=${__filename}`
);

// Проверка переменных окружения
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_USER_ID = process.env.ADMIN_USER_ID ? parseInt(process.env.ADMIN_USER_ID) : null;

if (!BOT_TOKEN) {
    console.error('❌ Ошибка: TELEGRAM_BOT_TOKEN не установлен!');
    process.exit(1);
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Ошибка: SUPABASE_URL или SUPABASE_SERVICE_ROLE_KEY не установлены!');
    process.exit(1);
}

// Инициализация бота
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Инициализация Supabase
try {
    initSupabase(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    console.log('✅ Supabase подключен');
} catch (error) {
    console.error('❌ Ошибка подключения к Supabase:', error.message);
    process.exit(1);
}

console.log('🤖 Бот запущен и готов к работе!');

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

// Обработка текстовых сообщений
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    // Обрабатываем как msg.text, так и msg.caption (если текст прикреплен к файлу/картинке)
    const text = msg.text || msg.caption || "";

    // Пропускаем команды
    if (text && text.startsWith('/')) {
        return;
    }

    // Проверка прав доступа (если установлен ADMIN_USER_ID)
    if (ADMIN_USER_ID && msg.from.id !== ADMIN_USER_ID) {
        bot.sendMessage(chatId, '❌ У вас нет доступа к этому боту.');
        return;
    }

    // Если это не текст, игнорируем
    if (!text || text.trim().length === 0) {
        bot.sendMessage(chatId, '❌ Пожалуйста, отправьте текст с датами доставки.');
        return;
    }

    try {
        // Парсим текст
        bot.sendMessage(chatId, '⏳ Обрабатываю данные...');

        // Логируем входящий текст для отладки
        console.log('📥 Входящий текст (первые 200 символов):', text.substring(0, 200));
        console.log('📥 Длина текста:', text.length);
        console.log('📥 Количество строк:', text.split('\n').length);
        console.log('📥 Первые 3 строки:');
        text.split('\n').slice(0, 3).forEach((line, idx) => {
            console.log(`  ${idx + 1}. "${line}" (длина: ${line.length})`);
        });

        const parsedData = parseDeliveryDates(text);
        
        // Логируем результаты парсинга
        console.log('📊 Найдено записей:', parsedData.length);
        console.log('📊 С ограничениями:', parsedData.filter(r => r.restrictions).length);
        parsedData.forEach((item, index) => {
            console.log(`  ${index + 1}. ${item.city} - ${item.date}${item.restrictions ? ' (кроме ' + item.restrictions + ')' : ''}`);
        });

        if (parsedData.length === 0) {
            bot.sendMessage(chatId, '❌ Не найдено ни одной записи в правильном формате.\n\nИспользуйте формат: "Город с ДД.ММ"\n\nПример: Москва с 9.02');
            return;
        }

        // Показываем что будет обновлено
        const preview = formatParsedResults(parsedData);
        bot.sendMessage(chatId, preview + '\n\n⏳ Обновляю данные в Supabase...');

        // Обновляем данные в Supabase
        const results = await updateDeliveryDates(parsedData);

        // Формируем отчет
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

// Обработка ошибок
bot.on('polling_error', (error) => {
    console.error('Ошибка polling:', error);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Остановка бота...');
    bot.stopPolling();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Остановка бота...');
    bot.stopPolling();
    process.exit(0);
});
