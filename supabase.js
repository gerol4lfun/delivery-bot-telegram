/**
 * Модуль для работы с Supabase
 *
 * ЛОГИКА: Список городов фиксирован (см. cities.js).
 * Парсер передаёт только канонические названия — ищем по точному совпадению.
 * При каждом обновлении — ПОЛНАЯ ЗАМЕНА: старые даты перезаписываются новыми.
 */

const { createClient } = require('@supabase/supabase-js');

let supabaseClient = null;

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

    for (const item of deliveryData) {
        try {
            console.log(`💾 ${item.city}: доставка ${item.date}, сборка ${item.assembly_date || '—'}, кроме ${item.restrictions || '—'}`);

            // Парсер передал каноническое имя — ищем (ilike для устойчивости к регистру)
            const { data: rows } = await supabaseClient
                .from('delivery_dates')
                .select('id, city_name')
                .ilike('city_name', item.city)
                .limit(1);
            const row = rows?.[0];
            if (!row) {
                results.failed.push({ city: item.city, error: 'Город не найден. Выполните sql/FIX_DELIVERY_DATES_CLEANUP.sql в Supabase.' });
                continue;
            }

            const assemblyVal = (item.assembly_date && String(item.assembly_date).trim()) || null;
            const restrictionsVal = (item.restrictions && String(item.restrictions).trim()) || null;

            let error = null;
            const rpcResult = await supabaseClient.rpc('update_delivery_dates_row', {
                p_id: row.id,
                p_delivery_date: item.date,
                p_assembly_date: assemblyVal,
                p_restrictions: restrictionsVal
            });
            error = rpcResult.error;
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
                results.failed.push({ city: item.city, error: error.message });
                continue;
            }

            results.success.push({
                city: item.city,
                action: 'updated',
                date: item.date,
                assembly_date: assemblyVal,
                restrictions: restrictionsVal
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
