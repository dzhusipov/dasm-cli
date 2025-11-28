# Миграция Gemini CLI → Local Model CLI (devstral:24b)

## Цель проекта

Переделать форк gemini-cli для работы исключительно с локальными моделями через
Ollama, с фокусом на модель devstral:24b.

## Текущее состояние (Baseline)

### Архитектура

- **Форк от**: google-gemini/gemini-cli
- **Структура**: Монорепозиторий (npm workspaces)
- **Пакеты**:
  - `packages/cli` - CLI интерфейс (React/Ink)
  - `packages/core` - Бэкенд логика, API клиенты, инструменты
  - `packages/test-utils` - Тестовые утилиты
  - `packages/vscode-ide-companion` - VS Code расширение
  - `packages/a2a-server` - Agent-to-Agent сервер

### Текущие зависимости от внешних API

1. **@google/genai** (v1.30.0) - основной API клиент
2. **google-auth-library** - OAuth аутентификация
3. **Code Assist API** - cloudcode-pa.googleapis.com
4. **Telemetry** - Отправка данных в Google Cloud

### Типы аутентификации (требуют удаления)

- `LOGIN_WITH_GOOGLE` - OAuth через Code Assist
- `USE_GEMINI` - API ключ Gemini
- `USE_VERTEX_AI` - Google Cloud Vertex AI

### Критические файлы для модификации

#### API Layer

- `/packages/core/src/core/contentGenerator.ts` - фабрика генераторов контента
- `/packages/core/src/core/baseLlmClient.ts` - базовые LLM вызовы
- `/packages/core/src/core/client.ts` - главный клиент GeminiClient
- `/packages/core/src/core/geminiChat.ts` - управление сессиями чата

#### Конфигурация

- `/packages/core/src/config/config.ts` - главный класс конфигурации
- `/packages/core/src/config/defaultModelConfigs.ts` - конфигурации моделей
- `/packages/core/src/config/models.ts` - константы имен моделей
- `/packages/cli/src/config/settings.ts` - управление настройками
- `/schemas/settings.schema.json` - JSON схема настроек

#### Аутентификация (для удаления)

- `/packages/core/src/code_assist/oauth2.ts`
- `/packages/core/src/code_assist/server.ts`

#### Телеметрия (для отключения)

- `/packages/core/src/telemetry/*`

## План миграции

### Фаза 1: Подготовка и анализ ✅

- [x] Изучение структуры проекта
- [x] Анализ зависимостей
- [x] Создание плана миграции
- [x] Создание ветки для работы

### Фаза 2: Реализация Ollama интеграции

#### Шаг 2.1: Создание OllamaContentGenerator

**Файл**: `/packages/core/src/core/ollamaContentGenerator.ts`

**Задачи**:

- Реализовать интерфейс `ContentGenerator`
- Использовать Ollama OpenAI-compatible API
  (http://localhost:11434/v1/chat/completions)
- Поддержка стриминга
- Конвертация Ollama ответов в формат Gemini
- Обработка function calling (если поддерживается devstral)

**Тестирование**: `npm run build` после создания файла

#### Шаг 2.2: Обновление фабрики ContentGenerator

**Файл**: `/packages/core/src/core/contentGenerator.ts`

**Изменения**:

- Добавить `AuthType.USE_OLLAMA`
- Добавить создание OllamaContentGenerator
- Сделать Ollama вариантом по умолчанию

**Тестирование**: `npm run build`

#### Шаг 2.3: Конфигурация модели devstral:24b

**Файлы**:

- `/packages/core/src/config/models.ts` - добавить константу DEVSTRAL_24B
- `/packages/core/src/config/defaultModelConfigs.ts` - конфигурация модели

**Параметры devstral:24b**:

```typescript
{
  modelName: 'devstral:24b',
  maxInputTokens: 32768,
  maxOutputTokens: 8192,
  supportsTools: true,
  supportsStreaming: true,
  temperature: 0.7,
  topP: 0.9
}
```

**Тестирование**: `npm run build`

### Фаза 3: Обновление аутентификации

#### Шаг 3.1: Упрощение системы аутентификации

**Файл**: `/packages/cli/src/config/settings.ts`

**Изменения**:

- Удалить проверки на GEMINI_API_KEY, GOOGLE_API_KEY
- Добавить OLLAMA_BASE_URL (по умолчанию: http://localhost:11434)
- Упростить validateSettings()

**Тестирование**: `npm run build`

#### Шаг 3.2: Обновление схемы настроек

**Файл**: `/schemas/settings.schema.json`

**Изменения**:

- Удалить опции для Gemini/Vertex AI
- Добавить ollamaBaseUrl
- Обновить authType enum

**Тестирование**: `npm run build`

### Фаза 4: Очистка от внешних зависимостей

#### Шаг 4.1: Удаление Code Assist

**Действия**:

- Удалить `/packages/core/src/code_assist/` (вся директория)
- Удалить импорты Code Assist из client.ts

**Тестирование**: `npm run build`

#### Шаг 4.2: Отключение телеметрии

**Файл**: `/packages/core/src/telemetry/index.ts`

**Изменения**:

- Закомментировать экспорт в Google Cloud
- Оставить базовую структуру для локального логирования (опционально)

**Тестирование**: `npm run build`

#### Шаг 4.3: Обновление зависимостей

**Файл**: `/package.json`

**Удалить**:

- `@google/genai`
- `google-auth-library`
- Другие Google Cloud зависимости

**Добавить** (опционально):

- `ollama` npm пакет (если есть) или использовать нативный fetch

**Тестирование**:

```bash
npm install
npm run build
```

### Фаза 5: Обновление клиентской логики

#### Шаг 5.1: Модификация GeminiClient

**Файл**: `/packages/core/src/core/client.ts`

**Изменения**:

- Убрать зависимость от Google-специфичных классов
- Обновить инициализацию для использования OllamaContentGenerator
- Переименовать класс (опционально): GeminiClient → LocalModelClient

**Тестирование**: `npm run build`

#### Шаг 5.2: Обновление BaseLlmClient

**Файл**: `/packages/core/src/core/baseLlmClient.ts`

**Изменения**:

- Адаптировать для Ollama API
- Обновить методы generateJson(), generateEmbedding() если нужно

**Тестирование**: `npm run build`

### Фаза 6: Тестирование и валидация

#### Шаг 6.1: Обновление unit тестов

**Файлы**: `*.test.ts` в packages/core/src/core/

**Действия**:

- Обновить моки для Ollama API
- Создать фейковые ответы для devstral:24b
- Запустить тесты: `npm run test`

#### Шаг 6.2: Обновление интеграционных тестов

**Директория**: `/integration-tests/`

**Действия**:

- Создать .responses файлы для devstral:24b
- Обновить test-helper.ts для Ollama
- Запустить: `npm run test:integration:sandbox:none`

#### Шаг 6.3: Финальная сборка

**Действия**:

```bash
npm run build
npm run bundle
npm run test
npm run test:ci
```

### Фаза 7: Документация и очистка

#### Шаг 7.1: Обновление README

**Файл**: `/README.md`

**Изменения**:

- Обновить описание проекта
- Изменить инструкции по установке
- Добавить требования (Ollama должен быть установлен)
- Обновить примеры использования

#### Шаг 7.2: Очистка конфигурации

**Действия**:

- Удалить неиспользуемые файлы конфигурации
- Упростить settings schema
- Обновить примеры в docs/

#### Шаг 7.3: Обновление package.json

**Файл**: `/package.json`

**Изменения**:

- Изменить имя пакета: gemini-cli → local-model-cli (или dasm-cli)
- Обновить description
- Обновить repository URL
- Обновить author

## Технические детали

### Ollama API интеграция

**Endpoint**: `http://localhost:11434/v1/chat/completions`

**Формат запроса** (OpenAI-compatible):

```json
{
  "model": "devstral:24b",
  "messages": [
    {"role": "system", "content": "..."},
    {"role": "user", "content": "..."}
  ],
  "stream": true,
  "tools": [...],
  "temperature": 0.7
}
```

**Формат ответа**:

```json
{
  "id": "chatcmpl-...",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "devstral:24b",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "..."
      },
      "finish_reason": "stop"
    }
  ]
}
```

### Конвертация форматов

**Gemini → Ollama**:

- `generationConfig` → `temperature`, `top_p`, `max_tokens`
- `tools` → OpenAI function calling format
- `systemInstruction` → `messages[0]` с ролью "system"

**Ollama → Gemini**:

- `choices[0].message` → `candidates[0].content`
- `finish_reason` → `finishReason`
- Stream chunks аналогичны

### Environment Variables

```bash
# Новые переменные
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=devstral:24b

# Удаляемые переменные
GEMINI_API_KEY (удалить)
GOOGLE_API_KEY (удалить)
GOOGLE_CLOUD_PROJECT (удалить)
```

### Настройки по умолчанию

**Файл**: `~/.gemini/settings.json` (переименовать в
~/.local-model/settings.json?)

```json
{
  "authType": "USE_OLLAMA",
  "ollamaBaseUrl": "http://localhost:11434",
  "defaultModel": "devstral:24b",
  "autoAccept": [],
  "telemetryEnabled": false
}
```

## Риски и митигация

### Риск 1: Function Calling в devstral

**Проблема**: Неясно, поддерживает ли devstral:24b function calling в полном
объеме

**Митигация**:

- Проверить документацию Ollama для devstral
- Тестировать на простых примерах
- Fallback: использовать prompt-based tool calling

### Риск 2: Streaming

**Проблема**: Формат streaming может отличаться

**Митигация**:

- Тщательное тестирование streaming responses
- Добавить обработку ошибок
- Логирование для отладки

### Риск 3: Тесты завязаны на Gemini

**Проблема**: Многие тесты используют моки Gemini API

**Митигация**:

- Постепенное обновление тестов
- Создание новых фикстур для Ollama
- Сохранение старых тестов временно для сравнения

### Риск 4: Build process

**Проблема**: Зависимости могут сломать сборку

**Митигация**:

- Тестировать build после каждого шага
- Коммитить рабочие версии
- Использовать `npm run build` как smoke test

## Контрольные точки (Checkpoints)

После каждой фазы проверяем:

- ✅ `npm run build` проходит успешно
- ✅ Нет TypeScript ошибок
- ✅ Unit тесты работают (или обновлены)
- ✅ Код закоммичен в ветку

## Timeline (примерный)

1. **Фаза 1**: Подготовка - DONE
2. **Фаза 2**: Ollama интеграция - 3-4 итерации
3. **Фаза 3**: Аутентификация - 2 итерации
4. **Фаза 4**: Очистка зависимостей - 3 итерации
5. **Фаза 5**: Клиентская логика - 2 итерации
6. **Фаза 6**: Тестирование - 3 итерации
7. **Фаза 7**: Документация - 1-2 итерации

**Итого**: ~14-17 итераций с проверкой билда на каждой

## Следующие шаги

1. Создать ветку `feature/local-model-migration`
2. Запустить начальный build для baseline
3. Начать с Фазы 2, Шаг 2.1 (OllamaContentGenerator)
4. Регулярно коммитить и проверять build

## Заметки

- Все изменения делаем инкрементально
- После каждого шага: build + commit
- Сохраняем структуру инструментов (tools) - они универсальны
- UI слой (CLI/Ink) не трогаем - он независим от провайдера
- Логику конфигурации минимально изменяем, только опции
