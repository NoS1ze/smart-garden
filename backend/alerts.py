from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail

from database import supabase

ALERT_COOLDOWN_MINUTES = int(os.getenv("ALERT_COOLDOWN_MINUTES", "60"))


def _send_email(to_email: str, subject: str, body: str) -> None:
    api_key = os.getenv("SENDGRID_API_KEY")
    if not api_key:
        return
    message = Mail(
        from_email="alerts@smartgarden.io",
        to_emails=to_email,
        subject=subject,
        plain_text_content=body,
    )
    client = SendGridAPIClient(api_key)
    client.send(message)


def _raw_to_percent(raw: float, raw_dry: int = 800, raw_wet: int = 400) -> float:
    """Convert raw soil moisture analog value to percentage."""
    if raw_dry == raw_wet:
        return 0.0
    pct = ((raw_dry - raw) / (raw_dry - raw_wet)) * 100.0
    return max(0.0, min(100.0, pct))


def check_alerts(sensor_id: str, readings: list[dict]) -> int:
    """Check active alerts for the given sensor and readings.

    Returns the number of alerts triggered (emails sent).
    For soil_moisture, raw values are converted to percentages using
    default calibration before comparing against thresholds.
    """
    triggered = 0

    for reading in readings:
        metric = reading["metric"]
        value = reading["value"]

        # For soil_moisture, convert raw → % for threshold comparison
        compare_value = _raw_to_percent(value) if metric == "soil_moisture" else value

        # Fetch active alert rules matching this sensor + metric
        result = (
            supabase.table("alerts")
            .select("*")
            .eq("sensor_id", sensor_id)
            .eq("metric", metric)
            .eq("active", True)
            .execute()
        )
        alert_rules = result.data or []

        for rule in alert_rules:
            breached = False
            if rule["condition"] == "above" and compare_value > rule["threshold"]:
                breached = True
            elif rule["condition"] == "below" and compare_value < rule["threshold"]:
                breached = True

            if not breached:
                continue

            # Check cooldown — look at most recent alert_history entry for this rule
            cooldown_cutoff = datetime.now(timezone.utc) - timedelta(minutes=ALERT_COOLDOWN_MINUTES)
            history = (
                supabase.table("alert_history")
                .select("triggered_at")
                .eq("alert_id", rule["id"])
                .gte("triggered_at", cooldown_cutoff.isoformat())
                .order("triggered_at", desc=True)
                .limit(1)
                .execute()
            )

            if history.data:
                # Still within cooldown window — skip
                continue

            # Send email
            direction = "above" if rule["condition"] == "above" else "below"
            subject = f"Smart Garden Alert: {metric} {direction} {rule['threshold']}"
            display_value = f"{compare_value:.1f}%" if metric == "soil_moisture" else str(value)
            body = (
                f"Sensor {sensor_id} reported {metric} = {display_value}, "
                f"which is {direction} your threshold of {rule['threshold']}."
            )
            _send_email(rule["email"], subject, body)

            # Record in alert_history
            supabase.table("alert_history").insert({
                "alert_id": rule["id"],
                "triggered_at": datetime.now(timezone.utc).isoformat(),
                "value_at_trigger": value,
            }).execute()

            triggered += 1

    return triggered
