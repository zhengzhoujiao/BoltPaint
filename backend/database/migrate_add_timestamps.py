"""
Migration script to add created_at and updated_at timestamps to all collections
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime
import sys
sys.path.append('.')
from app.config import settings


async def migrate_timestamps():
    """Add created_at and updated_at fields to all documents missing them"""
    try:
        print(f"[*] Connecting to MongoDB: {settings.mongodb_url}")
        client = AsyncIOMotorClient(settings.mongodb_url, serverSelectionTimeoutMS=5000)
        
        # Test connection
        await client.admin.command('ping')
        print("[+] MongoDB connected successfully")
        
        # Get database
        db = client[settings.mongodb_db_name]
        print(f"[*] Using database: {settings.mongodb_db_name}")
        
        # Migrate each collection
        collections = [
            'users',
            'templates', 
            'artworks',
            'orders',
            'tickets',
            'tags'
        ]
        
        total_updated = 0
        
        for collection_name in collections:
            print(f"\n[*] Migrating collection: {collection_name}")
            collection = db[collection_name]
            
            # Count documents missing timestamps
            missing_created = await collection.count_documents({"created_at": {"$exists": False}})
            missing_updated = await collection.count_documents({"updated_at": {"$exists": False}})
            
            print(f"   - Documents missing created_at: {missing_created}")
            print(f"   - Documents missing updated_at: {missing_updated}")
            
            if missing_created == 0 and missing_updated == 0:
                print(f"   [OK] All documents in {collection_name} have timestamps")
                continue
            
            # Add missing created_at
            if missing_created > 0:
                result = await collection.update_many(
                    {"created_at": {"$exists": False}},
                    {"$set": {"created_at": datetime.utcnow()}}
                )
                print(f"   [+] Added created_at to {result.modified_count} documents")
                total_updated += result.modified_count
            
            # Add missing updated_at
            if missing_updated > 0:
                result = await collection.update_many(
                    {"updated_at": {"$exists": False}},
                    {"$set": {"updated_at": datetime.utcnow()}}
                )
                print(f"   [+] Added updated_at to {result.modified_count} documents")
                total_updated += result.modified_count
        
        print(f"\n[+] Migration completed successfully!")
        print(f"[*] Total documents updated: {total_updated}")
        
        # Print statistics
        print("\n[*] Final statistics:")
        for collection_name in collections:
            collection = db[collection_name]
            total = await collection.count_documents({})
            with_created = await collection.count_documents({"created_at": {"$exists": True}})
            with_updated = await collection.count_documents({"updated_at": {"$exists": True}})
            print(f"   - {collection_name}: {with_created}/{total} with created_at, {with_updated}/{total} with updated_at")
        
        client.close()
        
    except Exception as e:
        print(f"[-] Migration failed: {e}")
        import traceback
        traceback.print_exc()
        print("\n[*] Please ensure:")
        print("   1. MongoDB service is running")
        print("   2. MongoDB connection URL is correct")
        print("   3. You have sufficient permissions")


if __name__ == "__main__":
    print("=" * 60)
    print("Timestamp Migration Script")
    print("=" * 60)
    asyncio.run(migrate_timestamps())
