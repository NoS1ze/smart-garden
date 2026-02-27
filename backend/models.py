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


# ── Plant Types ───────────────────────────────────────────

class PlantTypeCreate(BaseModel):
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


class PlantTypeUpdate(BaseModel):
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


class PlantTypeOut(BaseModel):
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
    created_at: datetime


class PlantTypesListResponse(BaseModel):
    data: list[PlantTypeOut]
    count: int


# ── Plants ────────────────────────────────────────────────

class PlantCreate(BaseModel):
    name: str
    plant_type_id: Optional[UUID] = None
    planted_date: Optional[date] = None
    photo_url: Optional[str] = None
    notes: Optional[str] = None
    soil_type_id: Optional[UUID] = None


class PlantUpdate(BaseModel):
    name: Optional[str] = None
    plant_type_id: Optional[UUID] = None
    planted_date: Optional[date] = None
    photo_url: Optional[str] = None
    notes: Optional[str] = None
    soil_type_id: Optional[UUID] = None


class PlantOut(BaseModel):
    id: UUID
    name: str
    plant_type_id: Optional[UUID] = None
    planted_date: Optional[date] = None
    photo_url: Optional[str] = None
    notes: Optional[str] = None
    soil_type_id: Optional[UUID] = None
    created_at: datetime
    sensors: list[SensorOut] = []
    soil_type: Optional[SoilTypeOut] = None
    plant_type: Optional[PlantTypeOut] = None


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
