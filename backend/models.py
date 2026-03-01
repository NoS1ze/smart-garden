from __future__ import annotations

import enum
from datetime import date, datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class MetricName(str, enum.Enum):
    temperature = "temperature"
    humidity = "humidity"
    soil_moisture = "soil_moisture"
    light_lux = "light_lux"
    co2_ppm = "co2_ppm"
    pressure_hpa = "pressure_hpa"
    tvoc_ppb = "tvoc_ppb"


class AlertCondition(str, enum.Enum):
    above = "above"
    below = "below"


# ── Readings ──────────────────────────────────────────────

class ReadingItem(BaseModel):
    metric: MetricName
    value: float


class ReadingsCreate(BaseModel):
    mac: str = Field(..., description="ESP8266 WiFi MAC address")
    readings: list[ReadingItem] = Field(..., min_length=1)
    recorded_at: int = Field(..., description="Unix epoch seconds")
    adc_bits: Optional[int] = Field(None, description="ADC bit depth (10 or 12)")
    board_type: Optional[str] = Field(None, description="Board type slug")


class ReadingsCreateResponse(BaseModel):
    status: str = "ok"
    inserted: int
    alerts_triggered: int


class ReadingOut(BaseModel):
    id: UUID
    sensor_id: UUID
    plant_id: Optional[UUID] = None
    metric: str
    value: float
    recorded_at: datetime


class ReadingsListResponse(BaseModel):
    data: list[ReadingOut]
    count: int


# ── Sensors ───────────────────────────────────────────────

class SensorOut(BaseModel):
    id: UUID
    name: str
    mac_address: Optional[str] = None
    display_name: Optional[str] = None
    location: str
    sensor_type: Optional[str] = None
    adc_bits: int = 10
    board_type_id: Optional[UUID] = None
    board_type: Optional["BoardTypeOut"] = None
    last_seen_at: Optional[datetime] = None
    created_at: datetime


class SensorsListResponse(BaseModel):
    data: list[SensorOut]
    count: int


class SensorUpdate(BaseModel):
    display_name: Optional[str] = None
    location: Optional[str] = None
    sensor_type: Optional[str] = None
    board_type_id: Optional[UUID] = None


# ── Soil Types ────────────────────────────────────────────

class SoilTypeCreate(BaseModel):
    name: str
    raw_dry: int = 800
    raw_wet: int = 400
    raw_dry_12bit: int = 3200
    raw_wet_12bit: int = 600


class SoilTypeUpdate(BaseModel):
    name: Optional[str] = None
    raw_dry: Optional[int] = None
    raw_wet: Optional[int] = None
    raw_dry_12bit: Optional[int] = None
    raw_wet_12bit: Optional[int] = None


class SoilTypeOut(BaseModel):
    id: UUID
    name: str
    raw_dry: int
    raw_wet: int
    raw_dry_12bit: int
    raw_wet_12bit: int
    created_at: datetime


class SoilTypesListResponse(BaseModel):
    data: list[SoilTypeOut]
    count: int


# ── Plant Species ───────────────────────────────────────────

class PlantSpeciesCreate(BaseModel):
    name: str
    min_temp: Optional[float] = None
    max_temp: Optional[float] = None
    optimal_min_temp: Optional[float] = None
    optimal_max_temp: Optional[float] = None
    min_humidity: Optional[float] = None
    max_humidity: Optional[float] = None
    optimal_min_humidity: Optional[float] = None
    optimal_max_humidity: Optional[float] = None
    min_moisture: Optional[float] = None
    max_moisture: Optional[float] = None
    optimal_min_moisture: Optional[float] = None
    optimal_max_moisture: Optional[float] = None
    min_light: Optional[float] = None
    max_light: Optional[float] = None
    optimal_min_light: Optional[float] = None
    optimal_max_light: Optional[float] = None
    min_co2: Optional[float] = None
    max_co2: Optional[float] = None
    optimal_min_co2: Optional[float] = None
    optimal_max_co2: Optional[float] = None
    min_pressure: Optional[float] = None
    max_pressure: Optional[float] = None
    optimal_min_pressure: Optional[float] = None
    optimal_max_pressure: Optional[float] = None
    min_tvoc: Optional[float] = None
    max_tvoc: Optional[float] = None
    optimal_min_tvoc: Optional[float] = None
    optimal_max_tvoc: Optional[float] = None


class PlantSpeciesUpdate(BaseModel):
    name: Optional[str] = None
    min_temp: Optional[float] = None
    max_temp: Optional[float] = None
    optimal_min_temp: Optional[float] = None
    optimal_max_temp: Optional[float] = None
    min_humidity: Optional[float] = None
    max_humidity: Optional[float] = None
    optimal_min_humidity: Optional[float] = None
    optimal_max_humidity: Optional[float] = None
    min_moisture: Optional[float] = None
    max_moisture: Optional[float] = None
    optimal_min_moisture: Optional[float] = None
    optimal_max_moisture: Optional[float] = None
    min_light: Optional[float] = None
    max_light: Optional[float] = None
    optimal_min_light: Optional[float] = None
    optimal_max_light: Optional[float] = None
    min_co2: Optional[float] = None
    max_co2: Optional[float] = None
    optimal_min_co2: Optional[float] = None
    optimal_max_co2: Optional[float] = None
    min_pressure: Optional[float] = None
    max_pressure: Optional[float] = None
    optimal_min_pressure: Optional[float] = None
    optimal_max_pressure: Optional[float] = None
    min_tvoc: Optional[float] = None
    max_tvoc: Optional[float] = None
    optimal_min_tvoc: Optional[float] = None
    optimal_max_tvoc: Optional[float] = None


class PlantSpeciesOut(BaseModel):
    id: UUID
    name: str
    min_temp: Optional[float] = None
    max_temp: Optional[float] = None
    optimal_min_temp: Optional[float] = None
    optimal_max_temp: Optional[float] = None
    min_humidity: Optional[float] = None
    max_humidity: Optional[float] = None
    optimal_min_humidity: Optional[float] = None
    optimal_max_humidity: Optional[float] = None
    min_moisture: Optional[float] = None
    max_moisture: Optional[float] = None
    optimal_min_moisture: Optional[float] = None
    optimal_max_moisture: Optional[float] = None
    min_light: Optional[float] = None
    max_light: Optional[float] = None
    optimal_min_light: Optional[float] = None
    optimal_max_light: Optional[float] = None
    min_co2: Optional[float] = None
    max_co2: Optional[float] = None
    optimal_min_co2: Optional[float] = None
    optimal_max_co2: Optional[float] = None
    min_pressure: Optional[float] = None
    max_pressure: Optional[float] = None
    optimal_min_pressure: Optional[float] = None
    optimal_max_pressure: Optional[float] = None
    min_tvoc: Optional[float] = None
    max_tvoc: Optional[float] = None
    optimal_min_tvoc: Optional[float] = None
    optimal_max_tvoc: Optional[float] = None
    created_at: datetime


class PlantSpeciesListResponse(BaseModel):
    data: list[PlantSpeciesOut]
    count: int


# ── Rooms ─────────────────────────────────────────────────


class RoomCreate(BaseModel):
    name: str


class RoomUpdate(BaseModel):
    name: Optional[str] = None


class RoomOut(BaseModel):
    id: UUID
    name: str
    created_at: datetime


class RoomsListResponse(BaseModel):
    data: list[RoomOut]
    count: int


# ── Plants ────────────────────────────────────────────────

class PlantCreate(BaseModel):
    name: str
    plant_species_id: Optional[UUID] = None
    planted_date: Optional[date] = None
    photo_url: Optional[str] = None
    notes: Optional[str] = None
    soil_type_id: Optional[UUID] = None
    room_id: Optional[UUID] = None
    reference_plant_id: Optional[UUID] = None


class PlantUpdate(BaseModel):
    name: Optional[str] = None
    plant_species_id: Optional[UUID] = None
    planted_date: Optional[date] = None
    photo_url: Optional[str] = None
    notes: Optional[str] = None
    soil_type_id: Optional[UUID] = None
    room_id: Optional[UUID] = None
    reference_plant_id: Optional[UUID] = None


class PlantOut(BaseModel):
    id: UUID
    name: str
    plant_species_id: Optional[UUID] = None
    planted_date: Optional[date] = None
    photo_url: Optional[str] = None
    notes: Optional[str] = None
    soil_type_id: Optional[UUID] = None
    room_id: Optional[UUID] = None
    reference_plant_id: Optional[UUID] = None
    created_at: datetime
    sensors: list[SensorOut] = []
    soil_type: Optional[SoilTypeOut] = None
    plant_species: Optional[PlantSpeciesOut] = None
    room: Optional[RoomOut] = None


class PlantsListResponse(BaseModel):
    data: list[PlantOut]
    count: int


class SensorAssociate(BaseModel):
    sensor_id: UUID


# ── Alerts ────────────────────────────────────────────────

class AlertCreate(BaseModel):
    sensor_id: UUID
    metric: MetricName
    condition: AlertCondition
    threshold: float
    email: EmailStr


class AlertOut(BaseModel):
    id: UUID
    sensor_id: UUID
    metric: str
    condition: str
    threshold: float
    email: str
    active: bool


class AlertsListResponse(BaseModel):
    data: list[AlertOut]
    count: int


# ── Board Types ──────────────────────────────────────────


class BoardTypeCreate(BaseModel):
    name: str
    slug: str
    mcu: str
    fqbn: Optional[str] = None
    adc_bits: int = 10
    sleep_seconds: int = 300
    sensors: list[dict] = []
    notes: Optional[str] = None


class BoardTypeUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    mcu: Optional[str] = None
    fqbn: Optional[str] = None
    adc_bits: Optional[int] = None
    sleep_seconds: Optional[int] = None
    sensors: Optional[list[dict]] = None
    notes: Optional[str] = None


class BoardTypeOut(BaseModel):
    id: UUID
    name: str
    slug: str
    mcu: str
    fqbn: Optional[str] = None
    adc_bits: int = 10
    sleep_seconds: int = 300
    sensors: list[dict] = []
    notes: Optional[str] = None
    created_at: datetime


class BoardTypesListResponse(BaseModel):
    data: list[BoardTypeOut]
    count: int


# ── Watering Events ──────────────────────────────────────


class WateringEventOut(BaseModel):
    id: UUID
    plant_id: UUID
    sensor_id: Optional[UUID] = None
    detected_at: datetime
    moisture_before: Optional[float] = None
    moisture_after: Optional[float] = None
    source: str = "auto"
    created_at: datetime


class WateringEventsListResponse(BaseModel):
    data: list[WateringEventOut]
    count: int


class WateringEventCreate(BaseModel):
    plant_id: UUID
    detected_at: Optional[datetime] = None


# ── Watering Schedules ──────────────────────────────────


class WateringScheduleCreate(BaseModel):
    interval_days: int = 7
    notes: Optional[str] = None


class WateringScheduleUpdate(BaseModel):
    interval_days: Optional[int] = None
    enabled: Optional[bool] = None
    notes: Optional[str] = None


class WateringScheduleOut(BaseModel):
    id: UUID
    plant_id: UUID
    interval_days: int
    last_watered_at: Optional[datetime] = None
    next_due_at: Optional[datetime] = None
    enabled: bool
    notes: Optional[str] = None
    created_at: datetime


class WateringSchedulesListResponse(BaseModel):
    data: list[WateringScheduleOut]
    count: int


# ── Trends ───────────────────────────────────────────────


class TrendPoint(BaseModel):
    day: str  # ISO date string
    avg: float
    min: float
    max: float


class TrendResponse(BaseModel):
    metric: str
    period: str
    current_avg: float
    previous_avg: Optional[float] = None
    trend: str  # "up", "down", "stable"
    change_pct: Optional[float] = None
    points: list[TrendPoint]


# ── Notification Channels ───────────────────────────────

class NotificationChannelCreate(BaseModel):
    channel_type: str  # email, telegram, discord, webhook
    config: dict = {}
    enabled: bool = True

class NotificationChannelUpdate(BaseModel):
    config: Optional[dict] = None
    enabled: Optional[bool] = None

class NotificationChannelOut(BaseModel):
    id: UUID
    channel_type: str
    config: dict
    enabled: bool
    created_at: datetime

class NotificationChannelsListResponse(BaseModel):
    data: list[NotificationChannelOut]
    count: int


class StatusResponse(BaseModel):
    status: str = "ok"
