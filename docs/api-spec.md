# Smart Garden IoT — API Specification

Base URL: `http://<host>:8000`

All responses use `Content-Type: application/json`.

---

## POST /api/readings

Ingest sensor readings from an ESP8266 device.

### Request Body

```json
{
  "sensor_id": "string (UUID)",
  "readings": [
    {
      "metric": "string",
      "value": "number (float)"
    }
  ],
  "recorded_at": "integer (Unix epoch seconds)"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sensor_id` | string (UUID v4) | yes | The sensor posting data |
| `readings` | array | yes | One or more metric readings (min 1) |
| `readings[].metric` | string | yes | One of: `temperature`, `humidity`, `soil_moisture`, `light_lux`, `co2_ppm` |
| `readings[].value` | float | yes | The measured value |
| `recorded_at` | integer | yes | Unix epoch timestamp (seconds) |

### Success Response — 201 Created

```json
{
  "status": "ok",
  "inserted": 3,
  "alerts_triggered": 1
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | Always `"ok"` on success |
| `inserted` | integer | Number of reading rows inserted |
| `alerts_triggered` | integer | Number of alert emails sent |

### Error Responses

**422 Unprocessable Entity** — validation failure

```json
{
  "detail": [
    {
      "loc": ["body", "sensor_id"],
      "msg": "value is not a valid uuid",
      "type": "value_error.uuid"
    }
  ]
}
```

**500 Internal Server Error** — database or upstream failure

```json
{
  "detail": "Failed to insert readings"
}
```

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

| Field | Type | Description |
|-------|------|-------------|
| `data` | array | List of reading objects |
| `data[].id` | string (UUID) | Reading row ID |
| `data[].sensor_id` | string (UUID) | Sensor FK |
| `data[].metric` | string | Metric name |
| `data[].value` | float | Measured value |
| `data[].recorded_at` | string (ISO 8601) | Timestamp in UTC |
| `count` | integer | Total number of items returned |

### Error Responses

**422 Unprocessable Entity** — invalid query params

```json
{
  "detail": [
    {
      "loc": ["query", "sensor_id"],
      "msg": "value is not a valid uuid",
      "type": "value_error.uuid"
    }
  ]
}
```

---

## GET /api/sensors

List all registered sensors.

### Query Parameters

None.

### Success Response — 200 OK

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Garden Bed A",
      "location": "Backyard",
      "created_at": "2024-02-20T08:00:00Z"
    }
  ],
  "count": 1
}
```

| Field | Type | Description |
|-------|------|-------------|
| `data` | array | List of sensor objects |
| `data[].id` | string (UUID) | Sensor PK |
| `data[].name` | string | Human-readable name |
| `data[].location` | string | Physical location |
| `data[].created_at` | string (ISO 8601) | When the sensor was registered |
| `count` | integer | Number of sensors returned |

### Error Responses

**500 Internal Server Error**

```json
{
  "detail": "Failed to fetch sensors"
}
```

---

## POST /api/alerts

Create a new alert rule for a sensor.

### Request Body

```json
{
  "sensor_id": "string (UUID)",
  "metric": "string",
  "condition": "string",
  "threshold": "number (float)",
  "email": "string (email)"
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

```json
{
  "detail": [
    {
      "loc": ["body", "condition"],
      "msg": "value is not a valid enumeration member; permitted: 'above', 'below'",
      "type": "type_error.enum"
    }
  ]
}
```

**500 Internal Server Error**

```json
{
  "detail": "Failed to create alert"
}
```

---

## GET /api/alerts

List alert rules, optionally filtered by sensor.

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sensor_id` | string (UUID) | no | Filter alerts by sensor |
| `active` | boolean | no | Filter by active status (default: return all) |

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

| Field | Type | Description |
|-------|------|-------------|
| `data` | array | List of alert rule objects |
| `data[].id` | string (UUID) | Alert rule PK |
| `data[].sensor_id` | string (UUID) | Sensor FK |
| `data[].metric` | string | Metric being monitored |
| `data[].condition` | string | `"above"` or `"below"` |
| `data[].threshold` | float | Threshold value |
| `data[].email` | string | Notification email |
| `data[].active` | boolean | Whether the rule is active |
| `count` | integer | Number of alert rules returned |

### Error Responses

**422 Unprocessable Entity** — invalid sensor_id format

```json
{
  "detail": [
    {
      "loc": ["query", "sensor_id"],
      "msg": "value is not a valid uuid",
      "type": "value_error.uuid"
    }
  ]
}
```

---

## DELETE /api/alerts/{alert_id}

Soft-delete (deactivate) an alert rule by setting `active = false`.

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `alert_id` | string (UUID v4) | yes | The alert rule to deactivate |

### Success Response — 200 OK

```json
{
  "status": "ok"
}
```

### Error Responses

**404 Not Found** — no alert with that ID

```json
{
  "detail": "Alert not found"
}
```

**422 Unprocessable Entity** — invalid alert_id format

```json
{
  "detail": [
    {
      "loc": ["path", "alert_id"],
      "msg": "value is not a valid uuid",
      "type": "value_error.uuid"
    }
  ]
}
```
