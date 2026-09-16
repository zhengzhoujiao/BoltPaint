from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import os
from app.config import settings
from app.services.storage import resolve_storage_file
from app.database import connect_to_mongo, close_mongo_connection, db
from app.routers import users, templates, artworks, generate, tickets, orders, tags, tasks, dashboard, uploads, settings as settings_router, pricing, recharge_packages, activation_codes, expansion, image_models

app = FastAPI(
    title="BoltPaint API",
    description="AI Image Generation Application Backend API",
    version="1.0.0",
    debug=not settings.is_production,
)

# Add global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    import traceback
    error_detail = ''.join(traceback.format_exception(type(exc), exc, exc.__traceback__))
    print(f"\n{'='*60}")
    print(f"[GLOBAL ERROR] Unhandled exception:")
    print(error_detail)
    print(f"{'='*60}\n")
    return {"detail": f"Internal server error: {str(exc)}"}

# Standard CORS configuration is handled by CORSMiddleware below

# CORS Configuration
# Development environment: explicitly list all allowed origins
print(f"[CORS] Raw config value: {settings.cors_origins}")

# CORS Configuration
# Use configuration from settings (defaults to "*" in development)
cors_origins = settings.cors_origins_list

print(f"[CORS] Allowed origins: {cors_origins}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True if "*" not in cors_origins else False, # Allow credentials only if not using wildcard
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=3600,
)

# Register routers
app.include_router(dashboard.router)
app.include_router(users.router)
app.include_router(templates.router)
app.include_router(artworks.router)
app.include_router(generate.router)
app.include_router(tickets.router)
app.include_router(orders.router)
app.include_router(tags.router)
app.include_router(tasks.router)
app.include_router(uploads.router)
app.include_router(settings_router.router)
app.include_router(pricing.router)
app.include_router(image_models.router)
app.include_router(recharge_packages.router)
app.include_router(activation_codes.router)
app.include_router(expansion.router)

# 确保存储目录存在
async def ensure_storage_dirs():
    dirs = [
        settings.uploads_dir,
        settings.generated_dir,
        settings.custom_dir,
    ]
    for d in dirs:
        try:
            if not os.path.exists(d):
                os.makedirs(d, exist_ok=True)
                print(f"[OK] Created directory: {d}")
        except Exception as e:
            print(f"[WARN] Failed to create directory {d}: {e}")


@app.get("/static/{file_path:path}")
async def serve_static_uploads(file_path: str):
    path = resolve_storage_file("uploads", file_path)
    if not path:
        raise HTTPException(status_code=404)
    return FileResponse(path)


@app.get("/generated/{file_path:path}")
async def serve_generated(file_path: str):
    path = resolve_storage_file("generated", file_path)
    if not path:
        raise HTTPException(status_code=404)
    return FileResponse(path)


@app.get("/custom/{file_path:path}")
async def serve_custom(file_path: str):
    path = resolve_storage_file("custom", file_path)
    if not path:
        raise HTTPException(status_code=404)
    return FileResponse(path)


@app.on_event("startup")
async def startup_event():
    """Connect to database on application startup"""
    try:
        # 确保所有可能的目录存在
        await ensure_storage_dirs()
        # 连接数据库
        await connect_to_mongo()
        # Initialize default data (only when MongoDB connection succeeds)
        if db.client is not None:
            try:
                from database.init_db import init_database
                await init_database()
                print("[OK] Data initialization completed")
            except Exception as e:
                print(f"[WARN] Error during data initialization: {e}")
                print("[WARN] Please check MongoDB connection and database permissions")
                import traceback
                traceback.print_exc()
        else:
            print("[WARN] MongoDB not connected, skipping data initialization")
            print("[TIP] Please start MongoDB service and restart backend")
    except Exception as e:
        print(f"[WARN] Error during startup: {e}")
        print("[WARN] Service will continue running, but some features may be unavailable")
        import traceback
        traceback.print_exc()


@app.on_event("shutdown")
async def shutdown_event():
    """Disconnect database on application shutdown"""
    await close_mongo_connection()


@app.get("/")
async def root():
    """Root path"""
    return {
        "message": "BoltPaint API",
        "version": "1.0.0",
        "docs": "/docs"
    }


@app.get("/health")
async def health_check():
    """Health check"""
    return {"status": "healthy"}
