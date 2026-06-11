from app.db.mongo import database

COLLECTION = "releases"


async def list_releases():
    releases = []

    cursor = database[COLLECTION].find(
        {},
        {"_id": 0},
    ).sort("created_at", -1)

    async for release in cursor:
        releases.append(release)

    return releases


async def get_release_by_id(release_id: str):
    return await database[COLLECTION].find_one(
        {"id": release_id},
        {"_id": 0},
    )


async def upsert_release(release: dict):
    await database[COLLECTION].update_one(
        {"id": release["id"]},
        {"$set": release},
        upsert=True,
    )

    return await get_release_by_id(release["id"])