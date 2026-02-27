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
    PlantCreate,
    PlantOut,
    PlantUpdate,
    PlantsListResponse,
    ReadingOut,
    ReadingsCreate,
    ReadingsCreateResponse,
    ReadingsListResponse,
    SensorAssociate,
    SensorOut,
    SensorUpdate,
    SensorsListResponse,
    SoilTypeCreate,
    SoilTypeOut,
    SoilTypeUpdate,
    SoilTypesListResponse,
    PlantTypeCreate,
    PlantTypeOut,
    PlantTypeUpdate,
    PlantTypesListResponse,
    StatusResponse,
)

app = FastAPI(title="Smart Garden IoT API", version="2.0.0")

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

    # Look up sensor by MAC address
    result = (
        supabase.table("sensors")
        .select("id")
        .eq("mac_address", body.mac)
        .limit(1)
        .execute()
    )

    if result.data:
        sensor_id = result.data[0]["id"]
    else:
        # Auto-register unknown MAC
        insert_result = (
            supabase.table("sensors")
            .insert({"mac_address": body.mac, "name": body.mac, "location": ""})
            .execute()
        )
        if not insert_result.data:
            raise HTTPException(status_code=500, detail="Failed to auto-register sensor")
        sensor_id = insert_result.data[0]["id"]

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


@app.put("/api/sensors/{sensor_id}", response_model=SensorOut)
async def update_sensor(sensor_id: UUID, body: SensorUpdate):
    updates = {}
    if body.display_name is not None:
        updates["display_name"] = body.display_name
    if body.location is not None:
        updates["location"] = body.location

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    result = (
        supabase.table("sensors")
        .update(updates)
        .eq("id", str(sensor_id))
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Sensor not found")
    return SensorOut(**result.data[0])


# ── Soil Types ────────────────────────────────────────────


@app.get("/api/soil-types", response_model=SoilTypesListResponse)
async def list_soil_types():
    result = supabase.table("soil_types").select("*").order("name").execute()
    data = result.data or []
    return SoilTypesListResponse(
        data=[SoilTypeOut(**row) for row in data],
        count=len(data),
    )


@app.post("/api/soil-types", response_model=SoilTypeOut, status_code=201)
async def create_soil_type(body: SoilTypeCreate):
    row = body.model_dump()
    result = supabase.table("soil_types").insert(row).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create soil type")
    return SoilTypeOut(**result.data[0])


@app.put("/api/soil-types/{soil_type_id}", response_model=SoilTypeOut)
async def update_soil_type(soil_type_id: UUID, body: SoilTypeUpdate):
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = (
        supabase.table("soil_types")
        .update(updates)
        .eq("id", str(soil_type_id))
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Soil type not found")
    return SoilTypeOut(**result.data[0])


@app.delete("/api/soil-types/{soil_type_id}", response_model=StatusResponse)
async def delete_soil_type(soil_type_id: UUID):
    result = (
        supabase.table("soil_types")
        .delete()
        .eq("id", str(soil_type_id))
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Soil type not found")
    return StatusResponse()


# ── Plant Types ───────────────────────────────────────────


@app.get("/api/plant-types", response_model=PlantTypesListResponse)
async def list_plant_types():
    result = supabase.table("plant_types").select("*").order("name").execute()
    data = result.data or []
    return PlantTypesListResponse(
        data=[PlantTypeOut(**row) for row in data],
        count=len(data),
    )


@app.post("/api/plant-types", response_model=PlantTypeOut, status_code=201)
async def create_plant_type(body: PlantTypeCreate):
    row = body.model_dump()
    result = supabase.table("plant_types").insert(row).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create plant type")
    return PlantTypeOut(**result.data[0])


@app.put("/api/plant-types/{plant_type_id}", response_model=PlantTypeOut)
async def update_plant_type(plant_type_id: UUID, body: PlantTypeUpdate):
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = (
        supabase.table("plant_types")
        .update(updates)
        .eq("id", str(plant_type_id))
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Plant type not found")
    return PlantTypeOut(**result.data[0])


@app.delete("/api/plant-types/{plant_type_id}", response_model=StatusResponse)
async def delete_plant_type(plant_type_id: UUID):
    result = (
        supabase.table("plant_types")
        .delete()
        .eq("id", str(plant_type_id))
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Plant type not found")
    return StatusResponse()


# ── Plants ────────────────────────────────────────────────


def _enrich_plant(plant_row: dict, sensors: list[SensorOut]) -> PlantOut:
    """Build a PlantOut with nested soil_type and plant_type if IDs are set."""
    soil_type = None
    if plant_row.get("soil_type_id"):
        st_result = (
            supabase.table("soil_types")
            .select("*")
            .eq("id", plant_row["soil_type_id"])
            .maybe_single()
            .execute()
        )
        if st_result.data:
            soil_type = SoilTypeOut(**st_result.data)

    plant_type = None
    if plant_row.get("plant_type_id"):
        pt_result = (
            supabase.table("plant_types")
            .select("*")
            .eq("id", plant_row["plant_type_id"])
            .maybe_single()
            .execute()
        )
        if pt_result.data:
            plant_type = PlantTypeOut(**pt_result.data)

    return PlantOut(**plant_row, sensors=sensors, soil_type=soil_type, plant_type=plant_type)


def _get_plant_sensors(plant_id: str) -> list[SensorOut]:
    """Fetch sensors associated with a plant via junction table."""
    assoc_result = (
        supabase.table("sensor_plant")
        .select("sensor_id")
        .eq("plant_id", plant_id)
        .execute()
    )
    sensor_ids = [row["sensor_id"] for row in (assoc_result.data or [])]
    if not sensor_ids:
        return []
    sensors_result = (
        supabase.table("sensors")
        .select("*")
        .in_("id", sensor_ids)
        .execute()
    )
    return [SensorOut(**s) for s in (sensors_result.data or [])]


@app.get("/api/plants", response_model=PlantsListResponse)
async def list_plants():
    plants_result = supabase.table("plants").select("*").order("created_at", desc=True).execute()
    plants = plants_result.data or []

    out: list[PlantOut] = []
    for plant in plants:
        sensors = _get_plant_sensors(plant["id"])
        out.append(_enrich_plant(plant, sensors))

    return PlantsListResponse(data=out, count=len(out))


@app.get("/api/plants/{plant_id}", response_model=PlantOut)
async def get_plant(plant_id: UUID):
    result = (
        supabase.table("plants")
        .select("*")
        .eq("id", str(plant_id))
        .maybe_single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Plant not found")
    sensors = _get_plant_sensors(str(plant_id))
    return _enrich_plant(result.data, sensors)


@app.post("/api/plants", response_model=PlantOut, status_code=201)
async def create_plant(body: PlantCreate):
    row = body.model_dump(exclude_none=True)
    if "planted_date" in row:
        row["planted_date"] = row["planted_date"].isoformat()
    if "soil_type_id" in row:
        row["soil_type_id"] = str(row["soil_type_id"])
    if "plant_type_id" in row:
        row["plant_type_id"] = str(row["plant_type_id"])
    result = supabase.table("plants").insert(row).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create plant")
    return _enrich_plant(result.data[0], sensors=[])


@app.put("/api/plants/{plant_id}", response_model=PlantOut)
async def update_plant(plant_id: UUID, body: PlantUpdate):
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    if "planted_date" in updates and updates["planted_date"] is not None:
        updates["planted_date"] = updates["planted_date"].isoformat()
    if "soil_type_id" in updates and updates["soil_type_id"] is not None:
        updates["soil_type_id"] = str(updates["soil_type_id"])
    if "plant_type_id" in updates and updates["plant_type_id"] is not None:
        updates["plant_type_id"] = str(updates["plant_type_id"])

    result = (
        supabase.table("plants")
        .update(updates)
        .eq("id", str(plant_id))
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Plant not found")

    sensors = _get_plant_sensors(str(plant_id))
    return _enrich_plant(result.data[0], sensors)


@app.delete("/api/plants/{plant_id}", response_model=StatusResponse)
async def delete_plant(plant_id: UUID):
    result = (
        supabase.table("plants")
        .delete()
        .eq("id", str(plant_id))
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Plant not found")
    return StatusResponse()


@app.post("/api/plants/{plant_id}/sensors", response_model=StatusResponse, status_code=201)
async def associate_sensor(plant_id: UUID, body: SensorAssociate):
    # Verify plant exists
    plant = supabase.table("plants").select("id").eq("id", str(plant_id)).limit(1).execute()
    if not plant.data:
        raise HTTPException(status_code=404, detail="Plant not found")

    # Verify sensor exists
    sensor = supabase.table("sensors").select("id").eq("id", str(body.sensor_id)).limit(1).execute()
    if not sensor.data:
        raise HTTPException(status_code=404, detail="Sensor not found")

    result = (
        supabase.table("sensor_plant")
        .insert({"sensor_id": str(body.sensor_id), "plant_id": str(plant_id)})
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to associate sensor")
    return StatusResponse()


@app.delete("/api/plants/{plant_id}/sensors/{sensor_id}", response_model=StatusResponse)
async def unassociate_sensor(plant_id: UUID, sensor_id: UUID):
    result = (
        supabase.table("sensor_plant")
        .delete()
        .eq("plant_id", str(plant_id))
        .eq("sensor_id", str(sensor_id))
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Association not found")
    return StatusResponse()


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
