# Руководство по использованию Ollama в dasm-cli

## Текущее состояние

✅ **Что уже работает:**

- Добавлен `AuthType.USE_OLLAMA` в enum
- Реализован `OllamaContentGenerator` с поддержкой OpenAI-compatible API
- Добавлена опция "Use Ollama (Local Models)" в диалог авторизации
- Поддержка переменных окружения `OLLAMA_BASE_URL` и `OLLAMA_MODEL`
- Конфигурация модели `devstral:24b` в `defaultModelConfigs.ts`

⚠️ **Что нужно доработать:**

- Проверка доступности Ollama сервера при инициализации
- Валидация наличия модели в Ollama
- Обработка ошибок подключения к Ollama
- UI для выбора/настройки модели Ollama (опционально)

## Как использовать Ollama сейчас

### 1. Установка и запуск Ollama

```bash
# Установите Ollama (если еще не установлен)
# macOS:
brew install ollama

# Linux:
curl -fsSL https://ollama.com/install.sh | sh

# Запустите Ollama сервер
ollama serve
```

### 2. Установка модели

```bash
# Установите модель devstral:24b (или другую)
ollama pull devstral:24b

# Или другую модель, например:
ollama pull llama3.2
ollama pull qwen2.5
```

### 3. Настройка переменных окружения (опционально)

```bash
# Если Ollama запущен не на localhost:11434
export OLLAMA_BASE_URL=http://localhost:11434

# Если хотите использовать другую модель по умолчанию
export OLLAMA_MODEL=devstral:24b
```

### 4. Запуск dasm-cli

```bash
npm run start
```

### 5. Выбор метода авторизации

При запуске выберите **"Use Ollama (Local Models)"** в диалоге авторизации.

## План доработок

### Приоритет 1: Проверка доступности Ollama

**Проблема:** Если Ollama сервер не запущен, ошибка появляется только при
попытке генерации.

**Решение:** Добавить проверку при инициализации `OllamaContentGenerator`.

**Файлы для изменения:**

- `packages/core/src/core/ollamaContentGenerator.ts` - добавить метод
  `checkConnection()`
- `packages/core/src/core/contentGenerator.ts` - вызвать проверку при создании
  генератора
- `packages/cli/src/config/auth.ts` - добавить валидацию в `validateAuthMethod`

**Пример кода:**

```typescript
// В OllamaContentGenerator
async checkConnection(): Promise<boolean> {
  try {
    const response = await fetch(`${this.baseUrl}/api/tags`, {
      method: 'GET',
    });
    return response.ok;
  } catch {
    return false;
  }
}

async ensureModelAvailable(): Promise<void> {
  const response = await fetch(`${this.baseUrl}/api/tags`);
  const data = await response.json();
  const models = data.models?.map((m: any) => m.name) || [];

  if (!models.includes(this.defaultModel)) {
    throw new Error(
      `Model ${this.defaultModel} is not available. ` +
      `Available models: ${models.join(', ')}. ` +
      `Run: ollama pull ${this.defaultModel}`
    );
  }
}
```

### Приоритет 2: Улучшение обработки ошибок

**Проблема:** Ошибки Ollama API не всегда понятны пользователю.

**Решение:** Добавить понятные сообщения об ошибках.

**Файлы для изменения:**

- `packages/core/src/core/ollamaContentGenerator.ts` - улучшить обработку ошибок
  в `generateContent` и `generateContentStream`

### Приоритет 3: UI для настройки модели (опционально)

**Проблема:** Модель можно изменить только через переменные окружения.

**Решение:** Добавить диалог выбора модели или поле в настройках.

**Файлы для изменения:**

- `packages/cli/src/ui/auth/AuthDialog.tsx` - добавить поле для ввода модели
  (если нужно)
- `packages/cli/src/config/settingsSchema.ts` - добавить настройку модели Ollama

### Приоритет 4: Автоматическое определение доступных моделей

**Проблема:** Пользователь должен знать, какие модели установлены.

**Решение:** При выборе Ollama показывать список доступных моделей.

**Файлы для изменения:**

- `packages/core/src/core/ollamaContentGenerator.ts` - добавить метод
  `listAvailableModels()`
- `packages/cli/src/ui/auth/AuthDialog.tsx` - показать список моделей

## Отладка

### Проверка подключения к Ollama

```bash
# Проверьте, что Ollama запущен
curl http://localhost:11434/api/tags

# Должен вернуть список моделей
```

### Проверка доступности модели

```bash
# Список установленных моделей
ollama list

# Проверка конкретной модели
ollama show devstral:24b
```

### Логирование

Если что-то не работает, проверьте:

1. Запущен ли Ollama: `ps aux | grep ollama`
2. Доступен ли порт: `lsof -i :11434`
3. Установлена ли модель: `ollama list`

## Примеры использования

### Базовое использование

```bash
# 1. Запустите Ollama
ollama serve

# 2. Установите модель
ollama pull devstral:24b

# 3. Запустите dasm-cli
npm run start

# 4. Выберите "Use Ollama (Local Models)"
```

### Использование другой модели

```bash
# Установите другую модель
ollama pull llama3.2

# Установите переменную окружения
export OLLAMA_MODEL=llama3.2

# Запустите dasm-cli
npm run start
```

### Использование удаленного Ollama сервера

```bash
# Если Ollama запущен на другом хосте
export OLLAMA_BASE_URL=http://192.168.1.100:11434
export OLLAMA_MODEL=devstral:24b

npm run start
```

## Известные проблемы

1. **Ошибка "Content generator not initialized"** - возникает, если Ollama
   сервер недоступен при инициализации. Нужно добавить проверку подключения.

2. **Модель не найдена** - если модель не установлена, ошибка появляется только
   при генерации. Нужно добавить проверку при инициализации.

3. **Дубликат "Ollama" в списке** - исправлено, но нужно проверить, что нет
   других дубликатов.

## Следующие шаги

1. ✅ Исправить дубликат "Ollama" в AuthDialog
2. ⏳ Добавить проверку подключения к Ollama при инициализации
3. ⏳ Добавить валидацию наличия модели
4. ⏳ Улучшить обработку ошибок
5. ⏳ (Опционально) Добавить UI для выбора модели
