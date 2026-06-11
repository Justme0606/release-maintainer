from redis.asyncio import Redis

from app.core.config import settings

redis_client = Redis.from_url(
    settings.redis_url,
    decode_responses=True,
)


async def ping_redis() -> bool:
    await redis_client.ping()
    return True