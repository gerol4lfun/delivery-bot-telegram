/**
 * Модуль для работы с Supabase
 */

const { createClient } = require('@supabase/supabase-js');

let supabaseClient = null;

/**
 * Инициализирует клиент Supabase
 */
function initSupabase(url, serviceRoleKey) {
    if (!url || !serviceRoleKey) {
        throw new Error('Supabase URL и Service Role Key обязательны!');
    }

    supabaseClient = createClient(url, serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });

    return supabaseClient;
}

/**
 * Обновляет даты доставки в Supabase
 * @param {Array} deliveryData - Массив объектов {city, date, restrictions}
 * @returns {Promise<Object>} Результат обновления
 */
async function updateDeliveryDates(deliveryData) {
    if (!supabaseClient) {
        throw new Error('Supabase клиент не инициализирован!');
    }

    const results = {
        success: [],
        failed: [],
        total: deliveryData.length
    };

    for (const item of deliveryData) {
        try {
            console.log(`💾 Обновление: ${item.city} - ${item.date}${item.restrictions ? ' (кроме ' + item.restrictions + ')' : ''}`);
            
            // Проверяем, существует ли город
            const { data: existing, error: checkError } = await supabaseClient
                .from('delivery_dates')
                .select('id, city_name')
                .eq('city_name', item.city)
                .single();

            if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = not found
                throw checkError;
            }

            // ВАЖНО: Если restrictions не указаны, устанавливаем null (чтобы очистить старые ограничения)
            // Проверяем, что restrictions есть и не пустые (после trim)
            let restrictionsValue = null;
            if (item.restrictions !== null && item.restrictions !== undefined) {
                const trimmed = String(item.restrictions).trim();
                if (trimmed !== '') {
                    restrictionsValue = trimmed;
                }
            }
            // Если restrictions пустые или отсутствуют, устанавливаем null для очистки старых значений
            
            const updateData = {
                delivery_date: item.date,
                updated_at: new Date().toISOString(),
                restrictions: restrictionsValue  // Явно устанавливаем null если нет ограничений
            };
            
            console.log(`  📝 Данные для обновления:`, JSON.stringify(updateData));
            console.log(`  🔍 Restrictions значение:`, restrictionsValue === null ? 'NULL (будет очищено)' : restrictionsValue);

            if (existing) {
                // Обновляем существующую запись
                // ВАЖНО: Явно указываем все поля, включая restrictions = null для очистки
                const { error: updateError } = await supabaseClient
                    .from('delivery_dates')
                    .update(updateData)
                    .eq('city_name', item.city);

                if (updateError) {
                    console.error(`  ❌ Ошибка обновления для ${item.city}:`, updateError);
                    throw updateError;
                }
                
                // Проверяем результат обновления
                const { data: checkData, error: checkError } = await supabaseClient
                    .from('delivery_dates')
                    .select('restrictions')
                    .eq('city_name', item.city)
                    .single();
                
                if (!checkError && checkData) {
                    console.log(`  ✅ Обновлено: ${item.city} - restrictions = ${checkData.restrictions === null ? 'NULL (очищено)' : checkData.restrictions}`);
                }

                results.success.push({
                    city: item.city,
                    action: 'updated',
                    date: item.date
                });
            } else {
                // Создаем новую запись
                const { error: insertError } = await supabaseClient
                    .from('delivery_dates')
                    .insert({
                        city_name: item.city,
                        ...updateData
                    });

                if (insertError) {
                    throw insertError;
                }

                results.success.push({
                    city: item.city,
                    action: 'created',
                    date: item.date
                });
            }
        } catch (error) {
            results.failed.push({
                city: item.city,
                error: error.message
            });
        }
    }

    return results;
}

/**
 * Получает все даты доставки (для проверки)
 */
async function getAllDeliveryDates() {
    if (!supabaseClient) {
        throw new Error('Supabase клиент не инициализирован!');
    }

    const { data, error } = await supabaseClient
        .from('delivery_dates')
        .select('city_name, delivery_date, restrictions')
        .order('city_name');

    if (error) {
        throw error;
    }

    return data;
}

module.exports = {
    initSupabase,
    updateDeliveryDates,
    getAllDeliveryDates
};
