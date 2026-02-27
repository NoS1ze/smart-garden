# Smart Garden IoT — API Specification

Base URL: `http://<host>:8000`

All responses use `Content-Type: application/json`.

---

## POST /api/readings

Ingest sensor readings from an ESP8266 device. The sensor is identified by its WiFi MAC address. If the MAC is not yet registered, the backend auto-creates a new sensor entry.

### Request Body

```json
{
  "mac": "8C:CE:4E:CE:66:15",
  "readings": [
    {
      "metric": "soil_moisture",
      "value": 45.0
    }
  ],
  "recorded_at": 1708789200
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `mac` | string | yes | ESP8266 WiFi MAC address (e.g. `"8C:CE:4E:CE:66:15"`) |
| `readings` | array | yes | One or more metric readings (min 1) |
| `readings[].metric` | string | yes | One of: `temperature`, `humidity`, `soil_moisture`, `light_lux`, `co2_ppm` |
| `readings[].value` | float | yes | The measured value |
| `recorded_at` | integer | yes | Unix epoch timestamp (seconds) |

### Success Response — 201 Created

```json
{
  "status": "ok",
  "inserted": 1,
  "alerts_triggered": 0
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | Always `"ok"` on success |
| `inserted` | integer | Number of reading rows inserted |
| `alerts_triggered` | integer | Number of alert emails sent |

### Error Responses

**422 Unprocessable Entity** — validation failure

**500 Internal Server Error** — database or upstream failure

---

## GET /api/readings

Retrieve historical readings for a sensor, optionally filtered by date range.

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sensor_id` | string (UUID) | yes | Filter by sensor |
| `metric` | string | no | Filter by metric name |
| `from` | string (ISO 8601 date, e.g. `2024-02-24`) | no | Start of date range (inclusive) |
| `to` | string (ISO 8601 date, e.g. `2024-02-25`) | no | End of date range (inclusive) |
| `limit` | integer | no | Max rows to return (default 100, max 1000) |
| `offset` | integer | no | Pagination offset (default 0) |

### Success Response — 200 OK

```json
{
  "data": [
    {
      "id": "uuid",
      "sensor_id": "uuid",
      "metric": "soil_moisture",
      "value": 45.0,
      "recorded_at": "2024-02-24T10:00:00Z"
    }
  ],
  "count": 1
}
```

---

## GET /api/sensors

List all registered sensors.

### Success Response — 200 OK

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "8C:CE:4E:CE:66:15",
      "mac_address": "8C:CE:4E:CE:66:15",
      "display_name": "Garden Bed A",
      "location": "Backyard",
      "created_at": "2024-02-20T08:00:00Z"
    }
  ],
  "count": 1
}
```

| Field | Type | Description |
|-------|------|-------------|
| `data[].id` | string (UUID) | Sensor PK |
| `data[].name` | string | Internal name (often the MAC address) |
| `data[].mac_address` | string or null | WiFi MAC address |
| `data[].display_name` | string or null | User-set friendly name |
| `data[].location` | string | Physical location |
| `data[].created_at` | string (ISO 8601) | When the sensor was registered |
| `count` | integer | Number of sensors returned |

---

## PUT /api/sensors/{sensor_id}

Update a sensor's display name and/or location.

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sensor_id` | string (UUID) | yes | The sensor to update |

### Request Body

```json
{
  "display_name": "Garden Bed A",
  "location": "Backyard"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `display_name` | string | no | Friendly name for the sensor |
| `location` | string | no | Physical location |

At least one field must be provided.

### Success Response — 200 OK

Returns the updated sensor object (same schema as GET /api/sensors items).

### Error Responses

**400 Bad Request** — no fields provided

**404 Not Found** — sensor not found

---

## GET /api/plant-types

List all plant types and their requirements.

### Success Response — 200 OK

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Monstera",
      "min_temp": 15.0,
      "max_temp": 30.0,
      "optimal_min_temp": 20.0,
      "optimal_max_temp": 25.0,
      "created_at": "2024-02-20T08:00:00Z"
    }
  ],
  "count": 1
}
```

---

## GET /api/plants

List all plants with their associated sensors and types.

### Success Response — 200 OK

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Tomato Plant",
      "plant_type_id": "uuid",
      "planted_date": "2024-03-01",
      "photo_url": "https://example.com/tomato.jpg",
      "notes": "Needs lots of sun",
      "created_at": "2024-02-20T08:00:00Z",
      "sensors": [
        {
          "id": "uuid",
          "name": "8C:CE:4E:CE:66:15",
          "mac_address": "8C:CE:4E:CE:66:15",
          "display_name": "Garden Bed A",
          "location": "Backyard",
          "created_at": "2024-02-20T08:00:00Z"
        }
      ]
    }
  ],
  "count": 1
}
```

| Field | Type | Description |
|-------|------|-------------|
| `data[].id` | string (UUID) | Plant PK |
| `data[].name` | string | Plant name |
| `data[].plant_type_id` | string (UUID) or null | Associated plant type |
| `data[].planted_date` | string (date) or null | When it was planted |
| `data[].photo_url` | string or null | URL to plant image |
| `data[].notes` | string or null | Freeform notes |
| `data[].created_at` | string (ISO 8601) | Record creation time |
| `data[].sensors` | array | List of associated sensor objects |
| `data[].plant_type` | object or null | Nested plant type object |
| `count` | integer | Number of plants returned |

---

## POST /api/plants

Create a new plant.

### Request Body

```json
{
  "name": "Tomato Plant",
  "plant_type_id": "uuid",
  "planted_date": "2024-03-01",
  "photo_url": "https://example.com/tomato.jpg",
  "notes": "Needs lots of sun"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Plant name |
| `plant_type_id` | string (UUID) | no | Associated plant type ID |
| `planted_date` | string (date) | no | When planted (YYYY-MM-DD) |
| `photo_url` | string | no | URL to plant image |
| `notes` | string | no | Freeform notes |

### Success Response — 201 Created

Returns the created plant object with an empty `sensors` array.

---

## PUT /api/plants/{plant_id}

Update an existing plant.

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `plant_id` | string (UUID) | yes | The plant to update |

### Request Body

Same fields as POST /api/plants. All fields are optional; at least one must be provided.

### Success Response — 200 OK

Returns the updated plant object with its associated sensors.

### Error Responses

**400 Bad Request** — no fields provided

**404 Not Found** — plant not found

---

## DELETE /api/plants/{plant_id}

Delete a plant. Cascade-deletes all sensor_plant associations.

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `plant_id` | string (UUID) | yes | The plant to delete |

### Success Response — 200 OK

```json
{
  "status": "ok"
}
```

### Error Responses

**404 Not Found** — plant not found

---

## POST /api/plants/{plant_id}/sensors

Associate a sensor with a plant.

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `plant_id` | string (UUID) | yes | The plant |

### Request Body

```json
{
  "sensor_id": "uuid"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sensor_id` | string (UUID) | yes | The sensor to associate |

### Success Response — 201 Created

```json
{
  "status": "ok"
}
```

### Error Responses

**404 Not Found** — plant or sensor not found

**409 Conflict** — association already exists (Supabase unique constraint)

---

## DELETE /api/plants/{plant_id}/sensors/{sensor_id}

Remove a sensor association from a plant.

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `plant_id` | string (UUID) | yes | The plant |
| `sensor_id` | string (UUID) | yes | The sensor to unassociate |

### Success Response — 200 OK

```json
{
  "status": "ok"
}
```

### Error Responses

**404 Not Found** — association not found

---

## POST /api/alerts

Create a new alert rule for a sensor.

### Request Body

```json
{
  "sensor_id": "string (UUID)",
  "metric": "string",
  "condition": "string",
  "threshold": 30.0,
  "email": "user@example.com"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sensor_id` | string (UUID) | yes | Sensor to monitor |
| `metric` | string | yes | One of: `temperature`, `humidity`, `soil_moisture`, `light_lux`, `co2_ppm` |
| `condition` | string | yes | `"above"` or `"below"` |
| `threshold` | float | yes | Threshold value |
| `email` | string (email) | yes | Email to notify |

### Success Response — 201 Created

```json
{
  "id": "uuid",
  "sensor_id": "uuid",
  "metric": "soil_moisture",
  "condition": "below",
  "threshold": 30.0,
  "email": "user@example.com",
  "active": true
}
```

### Error Responses

**422 Unprocessable Entity** — validation failure

**500 Internal Server Error** — database failure

---

## GET /api/alerts

List alert rules, optionally filtered by sensor.

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sensor_id` | string (UUID) | no | Filter alerts by sensor |
| `active` | boolean | no | Filter by active status |

### Success Response — 200 OK

```json
{
  "data": [
    {
      "id": "uuid",
      "sensor_id": "uuid",
      "metric": "soil_moisture",
      "condition": "below",
      "threshold": 30.0,
      "email": "user@example.com",
      "active": true
    }
  ],
  "count": 1
}
```

---

## DELETE /api/alerts/{alert_id}

Soft-delete (deactivate) an alert rule by setting `active = false`.

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `alert_id` | string (UUID) | yes | The alert rule to deactivate |

### Success Response — 200 OK

```json
{
  "status": "ok"
}
```

### Error Responses

**404 Not Found** — no alert with that ID
