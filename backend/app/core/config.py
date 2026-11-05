import os


class Settings:
    app_name: str = os.getenv("APP_NAME", "ShlapaBank")
    secret_key: str = os.getenv("SECRET_KEY", "change_me")
    algorithm: str = "HS256"
    access_token_expire_minutes: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
    database_url: str = os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg2://shlapabank:shlapabank@localhost:5432/shlapabank_app",
    )


settings = Settings()
