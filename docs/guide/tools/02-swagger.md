# Swagger

Открыть Swagger: http://localhost:8080/docs

OpenAPI-схема: http://localhost:8080/openapi.json

В Swagger — все адреса API с полями запросов и ответов. Как устроены вход, операции, статусы и фильтры истории — на странице [Работа с API](../04-api.html), инструменты стенда — [Вспомогательные действия](03-test-api.html).

## Как авторизоваться

1. Откройте `POST /api/v1/auth/login` → **Try it out**, укажите телефон и пароль (например `+79991234567` и `FullClient1!`) → **Execute**. В ответе — `challenge_id`.
2. Откройте `GET /api/v1/test/sms`, укажите тот же телефон (`9991234567`) → **Execute**. В ответе поле `code`. Или возьмите код на странице [SMS](01-sms.html).
3. Откройте `POST /api/v1/auth/login/confirm`, укажите `challenge_id` и `code` → **Execute**. В ответе — `access_token`.
4. Нажмите **Authorize** вверху страницы, вставьте `access_token` → **Authorize**.
