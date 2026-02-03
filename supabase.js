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
            // Проверяем, существует ли город
            const { data: existing, error: checkError } = await supabaseClient
                .from('delivery_dates')
                .select('id, city_name')
                .eq('city_name', item.city)
                .single();

            if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = not found
                throw checkError;
            }

            const updateData = {
                delivery_date: item.date,
                updated_at: new Date().toISOString()
            };

            if (item.restrictions !== null) {
                updateData.restrictions = item.restrictions;
            }

            if (existing) {
                // Обновляем существующую запись
                const { error: updateError } = await supabaseClient
                    .from('delivery_dates')
                    .update(updateData)
                    .eq('city_name', item.city);

                if (updateError) {
                    throw updateError;
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
