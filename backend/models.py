from __future__ import annotations

import enum
from datetime import datetime
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
    sensor_id: UUID
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
    location: str
    created_at: datetime


class SensorsListResponse(BaseModel):
    data: list[SensorOut]
    count: int


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
