/**
 * Единственный источник истины — фиксированный список городов.
 * Парсер сопоставляет ввод с этим списком, бот обновляет только эти записи.
 */

const CANONICAL_CITIES = [
    'Москва', 'Тула', 'Калуга', 'Рязань', 'Тверь',
    'Санкт-Петербург', 'Великий Новгород', 'Воронеж', 'Белгород', 'Липецк',
    'Тамбов', 'Орёл', 'Курск', 'Казань', 'Ульяновск', 'Чебоксары',
    'Йошкар-Ола', 'Набережные Челны', 'Нижний Новгород', 'Владимир',
    'Краснодар', 'Ставрополь', 'Майкоп', 'Черкесск', 'Ярославль',
    'Кострома', 'Иваново', 'Вологда', 'Екатеринбург', 'Челябинск', 'Новосибирск', 'Кемерово'
];

const INPUT_TO_CANONICAL = {
    'питер': 'Санкт-Петербург',
    'петербург': 'Санкт-Петербург',
    'спб': 'Санкт-Петербург',
    'нн': 'Нижний Новгород',
    'нижний': 'Нижний Новгород',
    'челны': 'Набережные Челны',
    'набережные челны': 'Набережные Челны',
    'великий новгород': 'Великий Новгород',
    'новгород': 'Великий Новгород',
    'йошкар-ола': 'Йошкар-Ола',
    'орёл': 'Орёл'
};

function toCanonicalCity(raw) {
    if (!raw) return null;
    const trimmed = raw.trim();
    const lower = trimmed.toLowerCase();
    if (INPUT_TO_CANONICAL[lower]) return INPUT_TO_CANONICAL[lower];
    const match = CANONICAL_CITIES.find(c => c.toLowerCase() === lower);
    if (match) return match;
    const capitalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
    const matchCap = CANONICAL_CITIES.find(c => c.toLowerCase() === capitalized.toLowerCase());
    return matchCap || capitalized;
}

function isKnownCity(canonical) {
    return CANONICAL_CITIES.some(c => c.toLowerCase() === (canonical || '').toLowerCase());
}

module.exports = { CANONICAL_CITIES, toCanonicalCity, isKnownCity };
