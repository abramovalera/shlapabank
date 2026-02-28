import os


class Settings:
    app_name: str = os.getenv("APP_NAME", "ShlapaBank")
    app_env: str = os.getenv("APP_ENV", "dev")
    secret_key: str = os.getenv("SECRET_KEY", "change_me")
    algorithm: str = "HS256"
    access_token_expire_minutes: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
    database_url: str = os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg2://shlapabank:shlapabank@localhost:5432/shlapabank",
    )
    default_admin_login: str = os.getenv("DEFAULT_ADMIN_LOGIN", "admin")
    default_admin_password: str = os.getenv("DEFAULT_ADMIN_PASSWORD", "admin")
    default_admin_email: str = os.getenv("DEFAULT_ADMIN_EMAIL", "admin@shlapabank.local")
    operation_otp_code: str = os.getenv("OPERATION_OTP_CODE", "")  # Пусто = OTP только через GET /helper/otp/preview


settings = Settings()
