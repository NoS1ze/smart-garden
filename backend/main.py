from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from alerts import check_alerts
from database import supabase
from models import (
    AlertCreate,
    AlertOut,
    AlertsListResponse,
    ReadingOut,
    ReadingsCreate,
    ReadingsCreateResponse,
    ReadingsListResponse,
    SensorOut,
    SensorsListResponse,
    StatusResponse,
)

app = FastAPI(title="Smart Garden IoT API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health ───────────────────────────────────────────────


@app.get("/health")
async def health():
    return {"status": "ok"}


# ── Readings ──────────────────────────────────────────────


@app.post("/api/readings", response_model=ReadingsCreateResponse, status_code=201)
async def create_readings(body: ReadingsCreate):
    recorded_at = datetime.fromtimestamp(body.recorded_at, tz=timezone.utc).isoformat()
    sensor_id = str(body.sensor_id)

    rows = [
        {
            "sensor_id": sensor_id,
            "metric": r.metric.value,
            "value": r.value,
            "recorded_at": recorded_at,
        }
        for r in body.readings
    ]

    result = supabase.table("readings").insert(rows).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to insert readings")

    alerts_triggered = check_alerts(
        sensor_id,
        [{"metric": r.metric.value, "value": r.value} for r in body.readings],
    )

    return ReadingsCreateResponse(
        inserted=len(result.data),
        alerts_triggered=alerts_triggered,
    )


@app.get("/api/readings", response_model=ReadingsListResponse)
async def list_readings(
    sensor_id: UUID = Query(...),
    metric: Optional[str] = Query(None),
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
):
    query = (
        supabase.table("readings")
        .select("*")
        .eq("sensor_id", str(sensor_id))
        .order("recorded_at", desc=True)
    )

    if metric:
        query = query.eq("metric", metric)
    if from_date:
        query = query.gte("recorded_at", from_date)
    if to_date:
        # Make 'to' inclusive of the whole day
        query = query.lte("recorded_at", to_date + "T23:59:59Z")

    query = query.range(offset, offset + limit - 1)
    result = query.execute()
    data = result.data or []

    return ReadingsListResponse(
        data=[ReadingOut(**row) for row in data],
        count=len(data),
    )


# ── Sensors ───────────────────────────────────────────────


@app.get("/api/sensors", response_model=SensorsListResponse)
async def list_sensors():
    result = supabase.table("sensors").select("*").order("created_at", desc=True).execute()
    data = result.data or []
    return SensorsListResponse(
        data=[SensorOut(**row) for row in data],
        count=len(data),
    )


# ── Alerts ────────────────────────────────────────────────


@app.post("/api/alerts", response_model=AlertOut, status_code=201)
async def create_alert(body: AlertCreate):
    row = {
        "sensor_id": str(body.sensor_id),
        "metric": body.metric.value,
        "condition": body.condition.value,
        "threshold": body.threshold,
        "email": body.email,
        "active": True,
    }
    result = supabase.table("alerts").insert(row).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create alert")
    return AlertOut(**result.data[0])


@app.get("/api/alerts", response_model=AlertsListResponse)
async def list_alerts(
    sensor_id: Optional[UUID] = Query(None),
    active: Optional[bool] = Query(None),
):
    query = supabase.table("alerts").select("*")
    if sensor_id:
        query = query.eq("sensor_id", str(sensor_id))
    if active is not None:
        query = query.eq("active", active)
    result = query.execute()
    data = result.data or []
    return AlertsListResponse(
        data=[AlertOut(**row) for row in data],
        count=len(data),
    )


@app.delete("/api/alerts/{alert_id}", response_model=StatusResponse)
async def delete_alert(alert_id: UUID):
    result = (
        supabase.table("alerts")
        .update({"active": False})
        .eq("id", str(alert_id))
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Alert not found")
    return StatusResponse()
