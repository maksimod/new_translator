# Speech Translator Browser Extension

Расширение для браузера, которое позволяет в реальном времени переводить вашу речь с одного языка на другой. Используя Web Speech API для распознавания речи и API OpenAI для перевода.

## Возможности

- Распознавание речи в реальном времени
- Перевод на 12 различных языков
- Поддержка всех браузеров на базе Chromium (Chrome, Edge, Opera, Brave)
- Сохранение истории переводов
- Возможность копирования переводов в буфер обмена

## Установка расширения

### Установка через Chrome Web Store (рекомендуется)

(После публикации в Chrome Web Store вы сможете установить расширение оттуда)

### Ручная установка (режим разработчика)

1. Скачайте и распакуйте архив с расширением
2. Откройте страницу управления расширениями в вашем браузере:
   - Chrome: chrome://extensions/
   - Edge: edge://extensions/
   - Opera: opera://extensions/
   - Brave: brave://extensions/
3. Включите "Режим разработчика" (переключатель в правом верхнем углу)
4. Нажмите кнопку "Загрузить распакованное расширение"
5. Выберите папку с распакованным расширением

## Использование

1. После установки нажмите на иконку расширения в панели браузера
2. Введите ваш API ключ OpenAI и нажмите "Сохранить"
3. Выберите исходный язык (язык, на котором вы говорите)
4. Выберите целевой язык (язык, на который нужно перевести)
5. Говорите, и ваша речь будет автоматически переведена
6. Используйте кнопку "Copy" для копирования перевода в буфер обмена

## Получение API ключа OpenAI

Для работы расширения требуется API ключ OpenAI. Чтобы получить ключ:

1. Зарегистрируйтесь на сайте [OpenAI](https://platform.openai.com/)
2. Перейдите в раздел API Keys
3. Создайте новый API ключ
4. Скопируйте ключ и вставьте его в настройки расширения

## Поддерживаемые языки

- Английский
- Испанский
- Французский
- Немецкий
- Итальянский
- Португальский
- Русский
- Китайский
- Японский
- Корейский
- Арабский
- Хинди

## Конфиденциальность

- Ваш API ключ OpenAI хранится только в локальном хранилище вашего браузера
- Аудиоданные обрабатываются локально с помощью Web Speech API
- Для перевода текст отправляется в API OpenAI

## Устранение неполадок

- **Микрофон не работает**: Убедитесь, что вы разрешили доступ к микрофону для данного сайта
- **Перевод не работает**: Проверьте правильность API ключа OpenAI
- **Неправильное распознавание**: Попробуйте говорить более четко и медленно

## Лицензия

Это расширение распространяется под лицензией MIT. 