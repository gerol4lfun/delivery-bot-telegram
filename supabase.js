/**
 * Модуль для работы с Supabase
 *
 * ЛОГИКА: Список городов фиксирован (см. cities.js).
 * Парсер передаёт только канонические названия — ищем по точному совпадению.
 * При каждом обновлении — ПОЛНАЯ ЗАМЕНА: старые даты перезаписываются новыми.
 */

const { createClient } = require('@supabase/supabase-js');

let supabaseClient = null;

/**
 * Нормализация названий для надежного сопоставления:
 * - убираем невидимые/неразрывные пробелы
 * - приводим "ё" к "е"
 * - сжимаем множественные пробелы
 */
function normalizeCityKey(value) {
    if (!value) return '';
    return String(value)
        .normalize('NFKC')
        .replace(/\u00A0|\u2009|\u2006|\u2007|\u202F/g, ' ')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
        .replace(/ё/g, 'е');
}

function getCanonicalAliases(canonicalCity) {
    const aliasMap = {
        'санкт-петербург': ['питер', 'петербург', 'спб'],
        'нижний новгород': ['нн', 'нижний'],
        'набережные челны': ['челны'],
        'великий новгород': ['новгород'],
        'йошкар-ола': ['йошкар ола'],
        'орел': ['орёл']
    };

    const canonical = normalizeCityKey(canonicalCity);
    const aliases = aliasMap[canonical] || [];
    const all = new Set([canonical, ...aliases.map(normalizeCityKey)]);

    // Поддерживаем вариант "Город доставки" в базе
    Array.from(all).forEach(name => all.add(`${name} доставки`));
    return all;
}

function rowMatchesCity(rowCityName, canonicalCity) {
    const row = normalizeCityKey(rowCityName);
    const aliases = getCanonicalAliases(canonicalCity);
    return aliases.has(row);
}

function initSupabase(url, serviceRoleKey) {
    if (!url || !serviceRoleKey) {
        throw new Error('Supabase URL и Service Role Key обязательны!');
    }
    supabaseClient = createClient(url, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false }
    });
    return supabaseClient;
}

/**
 * Обновляет даты доставки. ТОЛЬКО UPDATE — никогда INSERT.
 * city_name не меняем.
 */
async function updateDeliveryDates(deliveryData) {
    if (!supabaseClient) {
        throw new Error('Supabase клиент не инициализирован!');
    }

    const results = { success: [], failed: [], total: deliveryData.length };

    // Читаем справочник городов из БД один раз, чтобы обновлять ВСЕ совпадающие строки
    const { data: allRows, error: allRowsError } = await supabaseClient
        .from('delivery_dates')
        .select('id, city_name');

    if (allRowsError) {
        throw new Error(`Не удалось загрузить список городов: ${allRowsError.message}`);
    }

    for (const item of deliveryData) {
        try {
            console.log(`💾 ${item.city}: доставка ${item.date}, сборка ${item.assembly_date || '—'}, кроме ${item.restrictions || '—'}`);

            // Важно: обновляем все строки, относящиеся к одному городу (каноническая + алиасы)
            const matchedRows = (allRows || []).filter(row => rowMatchesCity(row.city_name, item.city));
            if (matchedRows.length === 0) {
                results.failed.push({ city: item.city, error: 'Город не найден. Выполните sql/FIX_DELIVERY_DATES_CLEANUP.sql в Supabase.' });
                continue;
            }

            const assemblyVal = (item.assembly_date && String(item.assembly_date).trim()) || null;
            const restrictionsVal = (item.restrictions && String(item.restrictions).trim()) || null;

            let updateError = null;
            for (const row of matchedRows) {
                const rpcResult = await supabaseClient.rpc('update_delivery_dates_row', {
                    p_id: row.id,
                    p_delivery_date: item.date,
                    p_assembly_date: assemblyVal,
                    p_restrictions: restrictionsVal
                });
                let error = rpcResult.error;
                if (error && error.code === '42883') {
                    // RPC не существует — fallback на обычный update
                    const upd = await supabaseClient.from('delivery_dates').update({
                        delivery_date: item.date,
                        assembly_date: assemblyVal,
                        restrictions: restrictionsVal,
                        updated_at: new Date().toISOString()
                    }).eq('id', row.id);
                    error = upd.error;
                }

                if (error) {
                    updateError = error;
                    break;
                }
            }

            if (updateError) {
                results.failed.push({ city: item.city, error: updateError.message });
                continue;
            }

            results.success.push({
                city: item.city,
                action: 'updated',
                date: item.date,
                assembly_date: assemblyVal,
                restrictions: restrictionsVal,
                updated_rows: matchedRows.length
            });
        } catch (err) {
            results.failed.push({ city: item.city, error: err.message });
        }
    }

    return results;
}

async function getAllDeliveryDates() {
    if (!supabaseClient) throw new Error('Supabase клиент не инициализирован!');
    const { data, error } = await supabaseClient
        .from('delivery_dates')
        .select('city_name, delivery_date, assembly_date, restrictions')
        .order('city_name');
    if (error) throw error;
    return data;
}

module.exports = { initSupabase, updateDeliveryDates, getAllDeliveryDates };
