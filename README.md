# Telegram-бот: даты доставки

**Версия проекта (калькулятор):** v214

Бот получает список дат в ТГ → парсит → обновляет Supabase. Railway деплоит из **отдельного** репо **gerol4lfun/delivery-bot-telegram** (не из репо калькулятора).

**Инструкция для Cursor/разработчиков:** см. **docs/instructions/ПУШ_В_РЕПОЗИТОРИИ_ИНСТРУКЦИЯ.md** — там описано, какие файлы копировать в клон delivery-bot-telegram и как пушить без костылей.

## Деплой

Код редактируется **здесь** (`greenhouse-calculator/telegram-bot/`), а в GitHub пушится из **отдельного клона** репо delivery-bot-telegram:

```bash
# В клоне delivery-bot-telegram скопировать файлы из этого проекта и пушить оттуда
cp /путь/к/greenhouse-calculator/telegram-bot/{index.js,parser.js,cities.js,supabase.js,package.json} .
git add . && git commit -m "update" && git push origin main
```

## Чеклист перед первым запуском

1. **Supabase** — выполнить `sql/FIX_DELIVERY_DATES_CLEANUP.sql`
2. **Railway** — задеплоить `cities.js`, `parser.js`, `supabase.js`, `index.js`
3. **Калькулятор** — обновить `js/scripts.js` на хостинге (убран fallback на «Город доставки»)

## Формат сообщений

```
Москва с 12.05
Питер с 06.05
Воронеж с 14.05, кроме 15.05, 16.05
Казань доставки с 07.05, сборки с 08.05 (кроме 09.05, 10.05)
```

Каждый город — с новой строки. Парсер приводит к каноническим названиям (см. `cities.js`).
