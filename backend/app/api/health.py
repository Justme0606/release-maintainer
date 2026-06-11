from fastapi import APIRouter

from app.db.mongo import ping_mongo
from app.db.redis import ping_redis

router = APIRouter()

@router.get("/health")
async def health_check():
    await ping_mongo()
    await ping_redis()

    return {
        "status": "ok",
        "mongodb": "ok",
        "redis": "ok",
    }