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


class ReadingsCreateResponse(BaseModel):
    status: str = "ok"
    inserted: int
    alerts_triggered: int


class ReadingOut(BaseModel):
    id: UUID
    sensor_id: UUID
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
    created_at: datetime


class SensorsListResponse(BaseModel):
    data: list[SensorOut]
    count: int


class SensorUpdate(BaseModel):
    display_name: Optional[str] = None
    location: Optional[str] = None


# ── Soil Types ────────────────────────────────────────────

class SoilTypeCreate(BaseModel):
    name: str
    raw_dry: int = 800
    raw_wet: int = 400


class SoilTypeUpdate(BaseModel):
    name: Optional[str] = None
    raw_dry: Optional[int] = None
    raw_wet: Optional[int] = None


class SoilTypeOut(BaseModel):
    id: UUID
    name: str
    raw_dry: int
    raw_wet: int
    created_at: datetime


class SoilTypesListResponse(BaseModel):
    data: list[SoilTypeOut]
    count: int


# ── Plants ────────────────────────────────────────────────

class PlantCreate(BaseModel):
    name: str
    species: Optional[str] = None
    planted_date: Optional[date] = None
    photo_url: Optional[str] = None
    notes: Optional[str] = None
    soil_type_id: Optional[UUID] = None


class PlantUpdate(BaseModel):
    name: Optional[str] = None
    species: Optional[str] = None
    planted_date: Optional[date] = None
    photo_url: Optional[str] = None
    notes: Optional[str] = None
    soil_type_id: Optional[UUID] = None


class PlantOut(BaseModel):
    id: UUID
    name: str
    species: Optional[str] = None
    planted_date: Optional[date] = None
    photo_url: Optional[str] = None
    notes: Optional[str] = None
    soil_type_id: Optional[UUID] = None
    created_at: datetime
    sensors: list[SensorOut] = []
    soil_type: Optional[SoilTypeOut] = None


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


class StatusResponse(BaseModel):
    status: str = "ok"
