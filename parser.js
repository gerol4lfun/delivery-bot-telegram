/**
 * Парсер текста для извлечения городов и дат доставки
 * Город = первое слово до "доставки"/"сборки", сопоставляется с фиксированным списком
 */

const { toCanonicalCity, isKnownCity } = require('./cities');

/**
 * Нормализует дату в формате ДД.ММ (добавляет ведущие нули)
 * @param {string} dm - Дата в формате Д.ММ или ДД.ММ
 * @returns {string} Нормализованная дата ДД.ММ
 */
function normalizeDM(dm) {
    if (!dm) return dm;
    const parts = dm.split('.').map(x => x.trim());
    if (parts.length !== 2) return dm;
    const [d, m] = parts;
    if (!d || !m) return dm;
    return `${d.padStart(2, '0')}.${m.padStart(2, '0')}`; // 9.02 -> 09.02, но оставляем как есть если уже 12.02
}

/**
 * Извлекает название города — первое слово до "доставки"/"сборки"
 * "Краснодар доставки" → "Краснодар", "Майкоп доставки" → "Майкоп"
 * "Великий Новгород" → "Великий Новгород" (без изменений)
 * @param {string} city - Исходное название
 * @returns {string} Очищенное название
 */
function cleanCityName(city) {
    if (!city) return city;
    // \b не надёжен с кириллицей в JS — используем границу без \b
    const cleaned = city.split(/\s+(?:доставки|сборки)(?=\s|$)/i)[0];
    return (cleaned || city).trim();
}

/**
 * Парсит одну строку:
 * - "Город с ДД.ММ" — простая форма
 * - "Город доставки с ДД.ММ, сборки с ДД.ММ (кроме ДД.ММ, ДД.ММ)" — форма с разными датами
 * @param {string} line - Строка для парсинга
 * @returns {Object|null} Объект {city_name, delivery_date, assembly_date, restrictions} или null
 */
function parseDeliveryLine(line) {
    const raw = line;
    let s = normalizeText(raw);
    s = stripLineJunk(s);

    if (!s) return null;

    // 1) Ищем основную форму: ГОРОД + "с/со" + дата
    const head = s.match(/^(.+?)\s+(?:с|со)\s+(\d{1,2}[.]\d{1,2})\b/i);
    if (!head) {
        console.log(`  ❌ Не распознана: "${raw}" -> "${s}"`);
        return null;
    }

    const cityRaw = head[1].trim();
    const city = cleanCityName(cityRaw);
    const delivery_date = normalizeDM(head[2].trim());

    // 2) Ищем дату сборки: "сборки с ДД.ММ" или ", сборки с ДД.ММ"
    let assembly_date = null;
    const assemblyMatch = s.match(/сборки\s+(?:с|со)\s+(\d{1,2}[.]\d{1,2})\b/i);
    if (assemblyMatch) {
        assembly_date = normalizeDM(assemblyMatch[1].trim());
    }

    // 3) Ищем блок "кроме ..."
    let restrictions = null;
    const lower = s.toLowerCase();
    const idx = lower.indexOf("кроме");
    if (idx !== -1) {
        restrictions = s
            .slice(idx + "кроме".length)
            .replace(/^[\s:,-]+/, "")
            .trim();

        if (restrictions) {
            if (restrictions.toLowerCase().includes('дату доставки нет') || 
                restrictions.toLowerCase().includes('доставки нет')) {
                // Оставляем как есть для специальных случаев
            } else {
                restrictions = restrictions
                    .replace(/\s+и\s+/gi, ", ")
                    .replace(/\s+/g, " ")
                    .replace(/,+/g, ",")
                    .replace(/^,|,$/g, "")
                    .trim();
                
                restrictions = restrictions
                    .replace(/[()]+/g, '')
                    .split(',')
                    .map(s => s.trim().replace(/[()]/g, ''))
                    .filter(Boolean)
                    .map(normalizeDM)
                    .join(', ');
            }
        }
    }

    const logParts = [city, delivery_date];
    if (assembly_date) logParts.push(`сборка ${assembly_date}`);
    if (restrictions) logParts.push(`кроме ${restrictions}`);
    console.log(`  ✅ Распознано: ${logParts.join(' | ')}`);

    return { 
        city_name: city, 
        delivery_date: delivery_date, 
        assembly_date: assembly_date,
        restrictions: restrictions 
    };
}

/**
 * Нормализует текст: убирает невидимые символы, неразрывные пробелы и т.д.
 * @param {string} text - Текст для нормализации
 * @returns {string} Нормализованный текст
 */
function normalizeText(text) {
    if (!text) return text;
    
    return text
        .normalize("NFKC")                 // важное: унификация Unicode
        .replace(/\r/g, "")                // CR
        .replace(/\u2028|\u2029/g, "\n")   // Line/Paragraph separator
        .replace(/\u00A0|\u2009|\u2006|\u2007|\u202F/g, " ")
        .replace(/\uFEFF/g, "")
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .replace(/[，]/g, ",")             // "китайская запятая"
        .replace(/[–—]/g, "-")             // длинные тире
        .trim();
}

/**
 * Убирает маркеры списков и мусор из начала строки
 * @param {string} line - Строка для очистки
 * @returns {string} Очищенная строка
 */
function stripLineJunk(line) {
    return line
        .trim()
        .replace(/\|+$/, '') // убираем trailing pipe при копипасте
        .replace(/^[\s>*•·\-–—✅☑️✔️\d\)\.]+/u, "")
        .trim();
}

/**
 * Парсит текст и извлекает информацию о городах и датах доставки
 * @param {string} text - Текст для парсинга
 * @returns {Array} Массив объектов {city, date, restrictions}
 */
function parseDeliveryDates(text) {
    if (!text || typeof text !== 'string') {
        console.error('❌ parseDeliveryDates: text is not a string:', typeof text);
        return [];
    }

    // Нормализуем текст: убираем невидимые символы
    const normalizedText = normalizeText(text);
    
    // ВАЖНО: Делим ТОЛЬКО по переносам строк, НЕ по запятым!
    const lines = normalizedText
        .split(/\r?\n/)          // ✅ только переносы строк
        .map(l => l.trim())
        .filter(Boolean);        // убираем пустые строки
    
    console.log(`🔍 Парсинг: обработано ${lines.length} строк`);
    
    // Логируем строки с "кроме" для отладки
    const suspicious = lines.filter(l => /кроме/i.test(l));
    console.log(`[DEBUG] lines_with_krome=${suspicious.length}`);
    suspicious.slice(0, 20).forEach((l, i) => {
        const n = normalizeText(l);
        console.log(`  [krome ${i}] raw="${l}"`);
        console.log(`  [krome ${i}] norm="${n}"`);
    });
    
    // Логируем первые 5 строк для отладки
    console.log('🔍 Первые 5 строк:');
    lines.slice(0, 5).forEach((line, idx) => {
        console.log(`  ${idx + 1}. "${line}" (длина: ${line.length})`);
    });
    
    const results = lines
        .map((line, index) => {
            const result = parseDeliveryLine(line);
            if (!result) {
                console.log(`  ⚠️ Строка ${index + 1} не распознана: "${line.substring(0, 50)}${line.length > 50 ? '...' : ''}"`);
            }
            return result;
        })
        .filter(Boolean);        // убираем null
    
    console.log(`✅ Успешно распознано: ${results.length} из ${lines.length} строк`);
    
    return results.map(item => {
        const cleanedCity = cleanCityName(item.city_name);
        const city = toCanonicalCity(cleanedCity);
        return {
            city,
            date: item.delivery_date,
            assembly_date: item.assembly_date || null,
            restrictions: item.restrictions
        };
    }).filter(item => isKnownCity(item.city));
}

/**
 * Форматирует результаты парсинга для отображения пользователю
 */
function formatParsedResults(results) {
    if (results.length === 0) {
        return '❌ Не найдено ни одной записи в формате "Город с ДД.ММ"';
    }

    let message = `✅ Найдено записей: ${results.length}\n\n`;
    
    results.forEach((item, index) => {
        message += `${index + 1}. ${item.city} - ${item.date}`;
        if (item.assembly_date && item.assembly_date !== item.date) {
            message += `, сборка с ${item.assembly_date}`;
        }
        if (item.restrictions) {
            message += ` (кроме ${item.restrictions})`;
        }
        message += '\n';
    });

    return message;
}

module.exports = {
    parseDeliveryDates,
    formatParsedResults
};
