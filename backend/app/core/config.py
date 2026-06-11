from pathlib import Path

from pydantic_settings import BaseSettings

ENV_FILE = Path(__file__).resolve().parent.parent.parent / ".env"


class Settings(BaseSettings):
    app_name: str = "Rocq Release Console API"

    github_token: str | None = None

    mongo_url: str = "mongodb://localhost:27017"
    mongo_db: str = "rocq_dashboard"

    redis_url: str = "redis://localhost:6379/0"

    release_deadline: str | None = None
    tracking_issue_number: int | None = None

    class Config:
        env_file = str(ENV_FILE)


settings = Settings()