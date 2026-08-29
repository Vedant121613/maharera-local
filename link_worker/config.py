import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    DB_HOST = os.getenv("DB_HOST", "localhost")
    DB_PORT = int(os.getenv("DB_PORT", 5432))
    DB_NAME = os.getenv("DB_NAME", "maharera_db")
    DB_USER = os.getenv("DB_USER", "postgres")
    DB_PASSWORD = os.getenv("DB_PASSWORD", "postgres")
    
    PRIMARY_MAX_WORKERS = int(os.getenv("PRIMARY_MAX_WORKERS", 5))
    CONNECT_TIMEOUT = float(os.getenv("CONNECT_TIMEOUT", 6.0))
    READ_TIMEOUT = float(os.getenv("READ_TIMEOUT", 12.0))
    MAX_RETRIES = int(os.getenv("MAX_RETRIES", 5))
    RETRY_DELAY = float(os.getenv("RETRY_DELAY", 5.0))
    RECHECK_INTERVAL = int(os.getenv("RECHECK_INTERVAL", 3600))
    
    LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

    @classmethod
    def get_db_connection_string(cls) -> str:
        return f"postgresql://{cls.DB_USER}:{cls.DB_PASSWORD}@{cls.DB_HOST}:{cls.DB_PORT}/{cls.DB_NAME}"