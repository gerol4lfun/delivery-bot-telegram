/**
 * Парсер текста для извлечения городов и дат доставки
 */

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
 * Парсит одну строку: "Город с ДД.ММ[, кроме ДД.ММ, ДД.ММ]"
 * Двухшаговый разбор без якоря $ для устойчивости к "Telegram-магии"
 * @param {string} line - Строка для парсинга
 * @returns {Object|null} Объект {city_name, delivery_date, restrictions} или null
 */
function parseDeliveryLine(line) {
    const raw = line;
    let s = normalizeText(raw);
    s = stripLineJunk(s);

    if (!s) return null;

    // 1) сначала достаём: ГОРОД + стартовую дату (без привязки к концу строки)
    const head = s.match(/^(.+?)\s+(?:с|со)\s+(\d{1,2}[.]\d{1,2})\b/i);
    if (!head) {
        console.log(`  ❌ Не распознана: "${raw}" -> "${s}"`);
        return null;
    }

    const city = head[1].trim();
    const startDate = head[2].trim();
    const delivery_date = normalizeDM(startDate);

    // 2) затем отдельно ищем блок "кроме ..."
    let restrictions = null;
    const lower = s.toLowerCase();
    const idx = lower.indexOf("кроме");
    if (idx !== -1) {
        restrictions = s
            .slice(idx + "кроме".length)
            .replace(/^[\s:,-]+/, "")
            .trim();

        // нормализуем список дат: "13.02, 14.02" / "13.02 и 14.02"
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
                
                // Разбиваем на даты и нормализуем каждую
                restrictions = restrictions
                    .split(',')
                    .map(s => s.trim())
                    .filter(Boolean)
                    .map(normalizeDM)
                    .join(', '); // ✅ "13.02, 14.02"
            }
        }
        
        console.log(`  ✅ Найдено с ограничениями: ${city} - ${delivery_date}, кроме ${restrictions}`);
    } else {
        console.log(`  ✅ Найдено без ограничений: ${city} - ${delivery_date}`);
    }

    return { 
        city_name: city, 
        delivery_date: delivery_date, 
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
        // убираем маркеры списков в начале: "•", "-", "—", "1)", "1.", "*", "✅" и т.п.
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
    
    // Преобразуем в формат, который ожидает остальной код
    return results.map(item => {
        const normalizedCity = normalizeCityName(item.city_name);
        return {
            city: normalizedCity,
            originalCity: item.city_name,
            date: item.delivery_date,
            restrictions: item.restrictions
        };
    });
}

/**
 * Нормализует название города (приводит к стандартному виду)
 */
function normalizeCityName(city) {
    const cityMap = {
        'питер': 'Санкт-Петербург',
        'петербург': 'Санкт-Петербург',
        'спб': 'Санкт-Петербург',
        'нн': 'Нижний Новгород',
        'нижний': 'Нижний Новгород',
        'челны': 'Набережные Челны',
        'набережные челны': 'Набережные Челны',
        'йошкар-ола': 'Йошкар-Ола',
        'орёл': 'Орёл',
        'орёл': 'Орёл'
    };

    const lowerCity = city.toLowerCase().trim();
    
    // Проверяем точное совпадение
    if (cityMap[lowerCity]) {
        return cityMap[lowerCity];
    }

    // Проверяем частичное совпадение
    for (const [key, value] of Object.entries(cityMap)) {
        if (lowerCity.includes(key) || key.includes(lowerCity)) {
            return value;
        }
    }

    // Если не найдено, возвращаем с заглавной буквы
    return city.charAt(0).toUpperCase() + city.slice(1).toLowerCase();
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
        if (item.restrictions) {
            message += ` (кроме ${item.restrictions})`;
        }
        message += '\n';
    });

    return message;
}

module.exports = {
    parseDeliveryDates,
    normalizeCityName,
    formatParsedResults
};
