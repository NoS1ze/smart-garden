from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from alerts import check_alerts
from auth import optional_user
from database import supabase
from models import (
    AlertCreate,
    AlertOut,
    AlertsListResponse,
    BoardTypeCreate,
    BoardTypeOut,
    BoardTypeUpdate,
    BoardTypesListResponse,
    PlantCreate,
    PlantOut,
    PlantUpdate,
    PlantsListResponse,
    ReadingOut,
    ReadingsCreate,
    ReadingsCreateResponse,
    ReadingsListResponse,
    RoomCreate,
    RoomOut,
    RoomUpdate,
    RoomsListResponse,
    SensorAssociate,
    SensorOut,
    SensorUpdate,
    SensorsListResponse,
    SoilTypeCreate,
    SoilTypeOut,
    SoilTypeUpdate,
    SoilTypesListResponse,
    PlantSpeciesCreate,
    PlantSpeciesOut,
    PlantSpeciesUpdate,
    PlantSpeciesListResponse,
    WateringEventCreate,
    WateringEventOut,
    WateringEventsListResponse,
    WateringScheduleCreate,
    WateringScheduleUpdate,
    WateringScheduleOut,
    WateringSchedulesListResponse,
    TrendPoint,
    TrendResponse,
    NotificationChannelCreate,
    NotificationChannelUpdate,
    StatusResponse,
)

app = FastAPI(title="Smart Garden IoT API", version="2.0.0")

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _update_watering_schedules(plant_id: str) -> None:
    """After a watering event, update enabled schedules for this plant."""
    schedules = (
        supabase.table("watering_schedules")
        .select("*")
        .eq("plant_id", plant_id)
        .eq("enabled", True)
        .execute()
    )
    now = datetime.utcnow()
    for sched in (schedules.data or []):
        supabase.table("watering_schedules").update({
            "last_watered_at": now.isoformat(),
            "next_due_at": (now + timedelta(days=sched["interval_days"])).isoformat(),
        }).eq("id", sched["id"]).execute()


# ── Health ───────────────────────────────────────────────


@app.get("/health")
async def health():
    return {"status": "ok"}


# ── Readings ──────────────────────────────────────────────


@limiter.limit("60/minute")
@app.post("/api/readings", response_model=ReadingsCreateResponse, status_code=201)
async def create_readings(request: Request, body: ReadingsCreate):
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
        insert_data = {"mac_address": body.mac, "name": body.mac, "location": ""}
        if body.adc_bits is not None and body.adc_bits in (10, 12):
            insert_data["adc_bits"] = body.adc_bits
        insert_result = (
            supabase.table("sensors")
            .insert(insert_data)
            .execute()
        )
        if not insert_result.data:
            raise HTTPException(status_code=500, detail="Failed to auto-register sensor")
        sensor_id = insert_result.data[0]["id"]

    # Update sensor's adc_bits if provided
    sensor_updates: dict = {}
    if body.adc_bits is not None and body.adc_bits in (10, 12):
        sensor_updates["adc_bits"] = body.adc_bits

    # Link sensor to board type if slug provided
    if body.board_type:
        bt_result = (
            supabase.table("board_types")
            .select("id")
            .eq("slug", body.board_type)
            .limit(1)
            .execute()
        )
        if bt_result.data:
            sensor_updates["board_type_id"] = bt_result.data[0]["id"]

    sensor_updates["last_seen_at"] = datetime.utcnow().isoformat()
    if sensor_updates:
        supabase.table("sensors").update(sensor_updates).eq("id", sensor_id).execute()

    # Look up plant(s) associated with this sensor for plant_id stamping
    plant_assocs = (
        supabase.table("sensor_plant")
        .select("plant_id")
        .eq("sensor_id", sensor_id)
        .execute()
    )
    plant_id = plant_assocs.data[0]["plant_id"] if plant_assocs.data else None

    # Check previous soil_moisture for watering detection BEFORE inserting
    soil_reading = next((r for r in body.readings if r.metric.value == "soil_moisture"), None)
    prev_soil_raw = None
    if soil_reading:
        prev_result = (
            supabase.table("readings")
            .select("value")
            .eq("sensor_id", sensor_id)
            .eq("metric", "soil_moisture")
            .order("recorded_at", desc=True)
            .limit(1)
            .execute()
        )
        if prev_result.data:
            prev_soil_raw = prev_result.data[0]["value"]

    rows = [
        {
            "sensor_id": sensor_id,
            "metric": r.metric.value,
            "value": r.value,
            "recorded_at": recorded_at,
            **({"plant_id": plant_id} if plant_id else {}),
        }
        for r in body.readings
    ]

    result = supabase.table("readings").insert(rows).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to insert readings")

    # Watering detection: raw drops significantly = moisture increased = watered
    if soil_reading and prev_soil_raw is not None:
        adc_range = 400 if (body.adc_bits or 10) == 10 else 2600
        raw_drop = prev_soil_raw - soil_reading.value
        if raw_drop > adc_range * 0.2:  # >20% of ADC range
            for assoc in (plant_assocs.data or []):
                supabase.table("watering_events").insert({
                    "plant_id": assoc["plant_id"],
                    "sensor_id": sensor_id,
                    "detected_at": recorded_at,
                    "moisture_before": prev_soil_raw,
                    "moisture_after": soil_reading.value,
                    "source": "auto",
                }).execute()
                _update_watering_schedules(assoc["plant_id"])

    alerts_triggered = check_alerts(
        sensor_id,
        [{"metric": r.metric.value, "value": r.value} for r in body.readings],
    )

    return ReadingsCreateResponse(
        inserted=len(result.data),
        alerts_triggered=alerts_triggered,
    )


@limiter.limit("30/minute")
@app.get("/api/readings", response_model=ReadingsListResponse)
async def list_readings(
    request: Request,
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


@limiter.limit("30/minute")
@app.get("/api/readings/trends", response_model=TrendResponse)
async def get_reading_trends(
    request: Request,
    sensor_id: UUID = Query(...),
    metric: str = Query(...),
    period: str = Query("7d"),  # 7d, 30d, 90d
):
    """Get daily aggregated trends for a sensor+metric over a period."""
    days = {"7d": 7, "30d": 30, "90d": 90}.get(period, 7)

    now = datetime.utcnow()
    from_date = (now - timedelta(days=days)).isoformat()
    prev_from_date = (now - timedelta(days=days * 2)).isoformat()

    # Fetch all readings for current period
    res = supabase.table("readings").select("value,recorded_at").eq(
        "sensor_id", str(sensor_id)
    ).eq("metric", metric).gte("recorded_at", from_date).order("recorded_at").execute()

    readings = res.data or []

    if not readings:
        return TrendResponse(
            metric=metric, period=period, current_avg=0,
            trend="stable", points=[]
        )

    # Group by day
    daily: dict[str, list[float]] = defaultdict(list)
    for r in readings:
        day = r["recorded_at"][:10]  # "2026-03-01"
        daily[day].append(r["value"])

    points = []
    all_values = []
    for day in sorted(daily.keys()):
        vals = daily[day]
        all_values.extend(vals)
        points.append(TrendPoint(
            day=day,
            avg=round(sum(vals) / len(vals), 2),
            min=round(min(vals), 2),
            max=round(max(vals), 2),
        ))

    current_avg = round(sum(all_values) / len(all_values), 2) if all_values else 0

    # Previous period for comparison
    prev_res = supabase.table("readings").select("value").eq(
        "sensor_id", str(sensor_id)
    ).eq("metric", metric).gte("recorded_at", prev_from_date).lt("recorded_at", from_date).execute()

    prev_values = [r["value"] for r in (prev_res.data or [])]
    previous_avg = round(sum(prev_values) / len(prev_values), 2) if prev_values else None

    # Determine trend
    if previous_avg is None:
        trend = "stable"
        change_pct = None
    else:
        diff = current_avg - previous_avg
        if previous_avg != 0:
            change_pct = round((diff / abs(previous_avg)) * 100, 1)
        else:
            change_pct = 0.0
        if abs(change_pct) < 3:
            trend = "stable"
        elif diff > 0:
            trend = "up"
        else:
            trend = "down"

    return TrendResponse(
        metric=metric,
        period=period,
        current_avg=current_avg,
        previous_avg=previous_avg,
        trend=trend,
        change_pct=change_pct,
        points=points,
    )


# ── Sensors ───────────────────────────────────────────────


def _enrich_sensor(row: dict, board_types_map: dict | None = None) -> SensorOut:
    """Build SensorOut with nested board_type if board_type_id is set."""
    board_type = None
    bt_id = row.get("board_type_id")
    if bt_id:
        if board_types_map and bt_id in board_types_map:
            board_type = BoardTypeOut(**board_types_map[bt_id])
        else:
            bt_result = (
                supabase.table("board_types")
                .select("*")
                .eq("id", bt_id)
                .maybe_single()
                .execute()
            )
            if bt_result.data:
                board_type = BoardTypeOut(**bt_result.data)
    return SensorOut(**row, board_type=board_type)


@limiter.limit("60/minute")
@app.get("/api/sensors", response_model=SensorsListResponse)
async def list_sensors(request: Request):
    result = supabase.table("sensors").select("*").order("created_at", desc=True).execute()
    data = result.data or []

    # Pre-fetch all board types for efficient join
    bt_result = supabase.table("board_types").select("*").execute()
    bt_map = {bt["id"]: bt for bt in (bt_result.data or [])}

    return SensorsListResponse(
        data=[_enrich_sensor(row, bt_map) for row in data],
        count=len(data),
    )


@limiter.limit("20/minute")
@app.put("/api/sensors/{sensor_id}", response_model=SensorOut)
async def update_sensor(request: Request, sensor_id: UUID, body: SensorUpdate):
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    if "board_type_id" in updates and updates["board_type_id"] is not None:
        updates["board_type_id"] = str(updates["board_type_id"])

    result = (
        supabase.table("sensors")
        .update(updates)
        .eq("id", str(sensor_id))
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Sensor not found")
    return _enrich_sensor(result.data[0])


@limiter.limit("20/minute")
@app.delete("/api/sensors/{sensor_id}", response_model=StatusResponse)
async def delete_sensor(request: Request, sensor_id: UUID):
    result = (
        supabase.table("sensors")
        .delete()
        .eq("id", str(sensor_id))
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Sensor not found")
    return StatusResponse()


# ── Soil Types ────────────────────────────────────────────


@limiter.limit("60/minute")
@app.get("/api/soil-types", response_model=SoilTypesListResponse)
async def list_soil_types(request: Request):
    result = supabase.table("soil_types").select("*").order("name").execute()
    data = result.data or []
    return SoilTypesListResponse(
        data=[SoilTypeOut(**row) for row in data],
        count=len(data),
    )


@limiter.limit("20/minute")
@app.post("/api/soil-types", response_model=SoilTypeOut, status_code=201)
async def create_soil_type(request: Request, body: SoilTypeCreate):
    row = body.model_dump()
    result = supabase.table("soil_types").insert(row).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create soil type")
    return SoilTypeOut(**result.data[0])


@limiter.limit("20/minute")
@app.put("/api/soil-types/{soil_type_id}", response_model=SoilTypeOut)
async def update_soil_type(request: Request, soil_type_id: UUID, body: SoilTypeUpdate):
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


@limiter.limit("20/minute")
@app.delete("/api/soil-types/{soil_type_id}", response_model=StatusResponse)
async def delete_soil_type(request: Request, soil_type_id: UUID):
    result = (
        supabase.table("soil_types")
        .delete()
        .eq("id", str(soil_type_id))
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Soil type not found")
    return StatusResponse()


# ── Board Types ──────────────────────────────────────────


@limiter.limit("60/minute")
@app.get("/api/board-types", response_model=BoardTypesListResponse)
async def list_board_types(request: Request):
    result = supabase.table("board_types").select("*").order("name").execute()
    data = result.data or []
    return BoardTypesListResponse(
        data=[BoardTypeOut(**row) for row in data],
        count=len(data),
    )


@limiter.limit("20/minute")
@app.post("/api/board-types", response_model=BoardTypeOut, status_code=201)
async def create_board_type(request: Request, body: BoardTypeCreate):
    row = body.model_dump()
    result = supabase.table("board_types").insert(row).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create board type")
    return BoardTypeOut(**result.data[0])


@limiter.limit("20/minute")
@app.put("/api/board-types/{board_type_id}", response_model=BoardTypeOut)
async def update_board_type(request: Request, board_type_id: UUID, body: BoardTypeUpdate):
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = (
        supabase.table("board_types")
        .update(updates)
        .eq("id", str(board_type_id))
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Board type not found")
    return BoardTypeOut(**result.data[0])


@limiter.limit("20/minute")
@app.delete("/api/board-types/{board_type_id}", response_model=StatusResponse)
async def delete_board_type(request: Request, board_type_id: UUID):
    result = (
        supabase.table("board_types")
        .delete()
        .eq("id", str(board_type_id))
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Board type not found")
    return StatusResponse()


# ── Plant Species ───────────────────────────────────────────


@limiter.limit("60/minute")
@app.get("/api/plant-species", response_model=PlantSpeciesListResponse)
async def list_plant_species(request: Request):
    result = supabase.table("plant_species").select("*").order("name").execute()
    data = result.data or []
    return PlantSpeciesListResponse(
        data=[PlantSpeciesOut(**row) for row in data],
        count=len(data),
    )


@limiter.limit("20/minute")
@app.post("/api/plant-species", response_model=PlantSpeciesOut, status_code=201)
async def create_plant_species(request: Request, body: PlantSpeciesCreate):
    row = body.model_dump()
    result = supabase.table("plant_species").insert(row).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create plant species")
    return PlantSpeciesOut(**result.data[0])


@limiter.limit("20/minute")
@app.put("/api/plant-species/{plant_species_id}", response_model=PlantSpeciesOut)
async def update_plant_species(request: Request, plant_species_id: UUID, body: PlantSpeciesUpdate):
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = (
        supabase.table("plant_species")
        .update(updates)
        .eq("id", str(plant_species_id))
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Plant species not found")
    return PlantSpeciesOut(**result.data[0])


@limiter.limit("20/minute")
@app.delete("/api/plant-species/{plant_species_id}", response_model=StatusResponse)
async def delete_plant_species(request: Request, plant_species_id: UUID):
    result = (
        supabase.table("plant_species")
        .delete()
        .eq("id", str(plant_species_id))
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Plant species not found")
    return StatusResponse()


# ── Rooms ─────────────────────────────────────────────────


@limiter.limit("60/minute")
@app.get("/api/rooms", response_model=RoomsListResponse)
async def list_rooms(request: Request):
    result = supabase.table("rooms").select("*").order("name").execute()
    data = result.data or []
    return RoomsListResponse(
        data=[RoomOut(**row) for row in data],
        count=len(data),
    )


@limiter.limit("20/minute")
@app.post("/api/rooms", response_model=RoomOut, status_code=201)
async def create_room(request: Request, body: RoomCreate):
    row = body.model_dump()
    result = supabase.table("rooms").insert(row).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create room")
    return RoomOut(**result.data[0])


@limiter.limit("20/minute")
@app.put("/api/rooms/{room_id}", response_model=RoomOut)
async def update_room(request: Request, room_id: UUID, body: RoomUpdate):
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = (
        supabase.table("rooms")
        .update(updates)
        .eq("id", str(room_id))
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Room not found")
    return RoomOut(**result.data[0])


@limiter.limit("20/minute")
@app.delete("/api/rooms/{room_id}", response_model=StatusResponse)
async def delete_room(request: Request, room_id: UUID):
    result = (
        supabase.table("rooms")
        .delete()
        .eq("id", str(room_id))
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Room not found")
    return StatusResponse()


@limiter.limit("60/minute")
@app.get("/api/rooms/{room_id}/plants", response_model=PlantsListResponse)
async def list_room_plants(request: Request, room_id: UUID):
    # Verify room exists
    room = supabase.table("rooms").select("id").eq("id", str(room_id)).limit(1).execute()
    if not room.data:
        raise HTTPException(status_code=404, detail="Room not found")

    plants_result = (
        supabase.table("plants")
        .select("*")
        .eq("room_id", str(room_id))
        .order("created_at", desc=True)
        .execute()
    )
    plants = plants_result.data or []

    out: list[PlantOut] = []
    for plant in plants:
        sensors = _get_plant_sensors(plant["id"])
        out.append(_enrich_plant(plant, sensors))

    return PlantsListResponse(data=out, count=len(out))


# ── Plants ────────────────────────────────────────────────


def _enrich_plant(plant_row: dict, sensors: list[SensorOut]) -> PlantOut:
    """Build a PlantOut with nested soil_type and plant_species if IDs are set."""
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

    plant_species = None
    if plant_row.get("plant_species_id"):
        ps_result = (
            supabase.table("plant_species")
            .select("*")
            .eq("id", plant_row["plant_species_id"])
            .maybe_single()
            .execute()
        )
        if ps_result.data:
            plant_species = PlantSpeciesOut(**ps_result.data)

    room = None
    if plant_row.get("room_id"):
        room_result = (
            supabase.table("rooms")
            .select("*")
            .eq("id", plant_row["room_id"])
            .maybe_single()
            .execute()
        )
        if room_result.data:
            room = RoomOut(**room_result.data)

    return PlantOut(**plant_row, sensors=sensors, soil_type=soil_type, plant_species=plant_species, room=room)


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


@limiter.limit("60/minute")
@app.get("/api/plants", response_model=PlantsListResponse)
async def list_plants(request: Request):
    plants_result = supabase.table("plants").select("*").order("created_at", desc=True).execute()
    plants = plants_result.data or []

    out: list[PlantOut] = []
    for plant in plants:
        sensors = _get_plant_sensors(plant["id"])
        out.append(_enrich_plant(plant, sensors))

    return PlantsListResponse(data=out, count=len(out))


@limiter.limit("60/minute")
@app.get("/api/plants/{plant_id}", response_model=PlantOut)
async def get_plant(request: Request, plant_id: UUID):
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


@limiter.limit("20/minute")
@app.post("/api/plants", response_model=PlantOut, status_code=201)
async def create_plant(request: Request, body: PlantCreate, user: Optional[dict] = Depends(optional_user)):
    row = body.model_dump(exclude_none=True)
    if "planted_date" in row:
        row["planted_date"] = row["planted_date"].isoformat()
    if "soil_type_id" in row:
        row["soil_type_id"] = str(row["soil_type_id"])
    if "plant_species_id" in row:
        row["plant_species_id"] = str(row["plant_species_id"])
    if "room_id" in row:
        row["room_id"] = str(row["room_id"])
    if "reference_plant_id" in row:
        row["reference_plant_id"] = str(row["reference_plant_id"])
    if user:
        row["user_id"] = user["id"]
    result = supabase.table("plants").insert(row).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create plant")
    return _enrich_plant(result.data[0], sensors=[])


@limiter.limit("20/minute")
@app.put("/api/plants/{plant_id}", response_model=PlantOut)
async def update_plant(request: Request, plant_id: UUID, body: PlantUpdate):
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    if "planted_date" in updates and updates["planted_date"] is not None:
        updates["planted_date"] = updates["planted_date"].isoformat()
    if "soil_type_id" in updates and updates["soil_type_id"] is not None:
        updates["soil_type_id"] = str(updates["soil_type_id"])
    if "plant_species_id" in updates and updates["plant_species_id"] is not None:
        updates["plant_species_id"] = str(updates["plant_species_id"])
    if "room_id" in updates and updates["room_id"] is not None:
        updates["room_id"] = str(updates["room_id"])
    if "reference_plant_id" in updates and updates["reference_plant_id"] is not None:
        updates["reference_plant_id"] = str(updates["reference_plant_id"])

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


@limiter.limit("20/minute")
@app.delete("/api/plants/{plant_id}", response_model=StatusResponse)
async def delete_plant(request: Request, plant_id: UUID):
    result = (
        supabase.table("plants")
        .delete()
        .eq("id", str(plant_id))
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Plant not found")
    return StatusResponse()


@limiter.limit("20/minute")
@app.post("/api/plants/{plant_id}/sensors", response_model=StatusResponse, status_code=201)
async def associate_sensor(request: Request, plant_id: UUID, body: SensorAssociate):
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


@limiter.limit("20/minute")
@app.delete("/api/plants/{plant_id}/sensors/{sensor_id}", response_model=StatusResponse)
async def unassociate_sensor(request: Request, plant_id: UUID, sensor_id: UUID):
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


@limiter.limit("20/minute")
@app.post("/api/alerts", response_model=AlertOut, status_code=201)
async def create_alert(request: Request, body: AlertCreate, user: Optional[dict] = Depends(optional_user)):
    row = {
        "sensor_id": str(body.sensor_id),
        "metric": body.metric.value,
        "condition": body.condition.value,
        "threshold": body.threshold,
        "email": body.email,
        "active": True,
        **({"user_id": user["id"]} if user else {}),
    }
    result = supabase.table("alerts").insert(row).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create alert")
    return AlertOut(**result.data[0])


@limiter.limit("60/minute")
@app.get("/api/alerts", response_model=AlertsListResponse)
async def list_alerts(
    request: Request,
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


# ── Watering Events ──────────────────────────────────────


@limiter.limit("60/minute")
@app.get("/api/plants/{plant_id}/watering-events", response_model=WateringEventsListResponse)
async def list_watering_events(request: Request, plant_id: UUID, limit: int = Query(50, ge=1, le=500)):
    result = (
        supabase.table("watering_events")
        .select("*")
        .eq("plant_id", str(plant_id))
        .order("detected_at", desc=True)
        .limit(limit)
        .execute()
    )
    data = result.data or []
    return WateringEventsListResponse(
        data=[WateringEventOut(**row) for row in data],
        count=len(data),
    )


@limiter.limit("20/minute")
@app.post("/api/plants/{plant_id}/watering-events", response_model=WateringEventOut, status_code=201)
async def create_watering_event(request: Request, plant_id: UUID, body: WateringEventCreate):
    row = {
        "plant_id": str(plant_id),
        "detected_at": (body.detected_at or datetime.now(timezone.utc)).isoformat(),
        "source": "manual",
    }
    result = supabase.table("watering_events").insert(row).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create watering event")

    # Update watering schedules for this plant
    _update_watering_schedules(str(plant_id))

    return WateringEventOut(**result.data[0])


@limiter.limit("20/minute")
@app.delete("/api/watering-events/{event_id}", response_model=StatusResponse)
async def delete_watering_event(request: Request, event_id: UUID):
    result = (
        supabase.table("watering_events")
        .delete()
        .eq("id", str(event_id))
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Watering event not found")
    return StatusResponse()


# ── Watering Schedules ─────────────────────────────────


@limiter.limit("60/minute")
@app.get("/api/plants/{plant_id}/watering-schedule")
async def get_watering_schedule(request: Request, plant_id: UUID):
    res = supabase.table("watering_schedules").select("*").eq("plant_id", str(plant_id)).execute()
    return {"data": res.data, "count": len(res.data)}


@limiter.limit("20/minute")
@app.post("/api/plants/{plant_id}/watering-schedule", status_code=201)
async def create_watering_schedule(request: Request, plant_id: UUID, body: WateringScheduleCreate):
    now = datetime.utcnow()
    row = {
        "plant_id": str(plant_id),
        "interval_days": body.interval_days,
        "notes": body.notes,
        "next_due_at": (now + timedelta(days=body.interval_days)).isoformat(),
    }
    res = supabase.table("watering_schedules").insert(row).execute()
    return res.data[0]


@limiter.limit("20/minute")
@app.put("/api/watering-schedules/{schedule_id}")
async def update_watering_schedule(request: Request, schedule_id: UUID, body: WateringScheduleUpdate):
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(400, "No fields to update")
    res = supabase.table("watering_schedules").update(updates).eq("id", str(schedule_id)).execute()
    if not res.data:
        raise HTTPException(404, "Schedule not found")
    return res.data[0]


@limiter.limit("20/minute")
@app.delete("/api/watering-schedules/{schedule_id}")
async def delete_watering_schedule(request: Request, schedule_id: UUID):
    supabase.table("watering_schedules").delete().eq("id", str(schedule_id)).execute()
    return {"status": "ok"}


# ── Notification Channels ─────────────────────────────


@app.get("/api/notification-channels")
@limiter.limit("60/minute")
async def list_notification_channels(request: Request):
    res = supabase.table("notification_channels").select("*").order("created_at").execute()
    return {"data": res.data, "count": len(res.data)}


@app.post("/api/notification-channels", status_code=201)
@limiter.limit("20/minute")
async def create_notification_channel(body: NotificationChannelCreate, request: Request):
    row = {
        "channel_type": body.channel_type,
        "config": body.config,
        "enabled": body.enabled,
    }
    res = supabase.table("notification_channels").insert(row).execute()
    return res.data[0]


@app.put("/api/notification-channels/{channel_id}")
@limiter.limit("20/minute")
async def update_notification_channel(channel_id: UUID, body: NotificationChannelUpdate, request: Request):
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(400, "No fields to update")
    res = supabase.table("notification_channels").update(updates).eq("id", str(channel_id)).execute()
    if not res.data:
        raise HTTPException(404, "Channel not found")
    return res.data[0]


@app.delete("/api/notification-channels/{channel_id}")
@limiter.limit("20/minute")
async def delete_notification_channel(channel_id: UUID, request: Request):
    supabase.table("notification_channels").delete().eq("id", str(channel_id)).execute()
    return {"status": "ok"}


@app.post("/api/notification-channels/{channel_id}/test")
@limiter.limit("10/minute")
async def test_notification_channel(channel_id: UUID, request: Request):
    res = supabase.table("notification_channels").select("*").eq("id", str(channel_id)).execute()
    if not res.data:
        raise HTTPException(404, "Channel not found")
    ch = res.data[0]
    from notifiers import send_notification
    success = await send_notification(
        ch["channel_type"], ch["config"],
        "Smart Garden Test",
        "This is a test notification from your Smart Garden system.",
    )
    if not success:
        raise HTTPException(500, "Notification delivery failed")
    return {"status": "ok"}


@limiter.limit("20/minute")
@app.delete("/api/alerts/{alert_id}", response_model=StatusResponse)
async def delete_alert(request: Request, alert_id: UUID):
    result = (
        supabase.table("alerts")
        .update({"active": False})
        .eq("id", str(alert_id))
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Alert not found")
    return StatusResponse()
