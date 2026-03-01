from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
from typing import Any

import httpx

logger = logging.getLogger(__name__)


async def send_notification(
    channel_type: str,
    config: dict[str, Any],
    subject: str,
    body: str,
) -> bool:
    """Dispatch a notification to the given channel. Returns True on success."""
    try:
        if channel_type == "email":
            return _send_email(config.get("address", ""), subject, body)
        elif channel_type == "telegram":
            return await _send_telegram(config, subject, body)
        elif channel_type == "discord":
            return await _send_discord(config, subject, body)
        elif channel_type == "webhook":
            return await _send_webhook(config, subject, body)
        else:
            logger.warning(f"Unknown channel type: {channel_type}")
            return False
    except Exception as e:
        logger.error(f"Notification failed ({channel_type}): {e}")
        return False


def _send_email(to_email: str, subject: str, body: str) -> bool:
    """Send email via SendGrid."""
    api_key = os.getenv("SENDGRID_API_KEY")
    if not api_key or not to_email:
        logger.warning("SendGrid API key or email missing")
        return False
    from sendgrid import SendGridAPIClient
    from sendgrid.helpers.mail import Mail

    message = Mail(
        from_email=os.getenv("SENDGRID_FROM_EMAIL", "alerts@smartgarden.local"),
        to_emails=to_email,
        subject=subject,
        plain_text_content=body,
    )
    client = SendGridAPIClient(api_key)
    response = client.send(message)
    return 200 <= response.status_code < 300


async def _send_telegram(config: dict, subject: str, body: str) -> bool:
    """Send message via Telegram Bot API."""
    bot_token = config.get("bot_token", "")
    chat_id = config.get("chat_id", "")
    if not bot_token or not chat_id:
        logger.warning("Telegram bot_token or chat_id missing")
        return False

    text = f"*{subject}*\n{body}"
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"

    async with httpx.AsyncClient() as client:
        resp = await client.post(url, json={
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "Markdown",
        })
        return resp.status_code == 200


async def _send_discord(config: dict, subject: str, body: str) -> bool:
    """Send message via Discord webhook."""
    webhook_url = config.get("webhook_url", "")
    if not webhook_url:
        logger.warning("Discord webhook_url missing")
        return False

    async with httpx.AsyncClient() as client:
        resp = await client.post(webhook_url, json={
            "content": f"**{subject}**\n{body}",
        })
        return 200 <= resp.status_code < 300


async def _send_webhook(config: dict, subject: str, body: str) -> bool:
    """Send JSON payload to a custom webhook URL with optional HMAC signature."""
    url = config.get("url", "")
    secret = config.get("secret", "")
    if not url:
        logger.warning("Webhook URL missing")
        return False

    payload = json.dumps({"subject": subject, "body": body, "source": "smart-garden"})
    headers = {"Content-Type": "application/json"}

    if secret:
        sig = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
        headers["X-Signature-256"] = f"sha256={sig}"

    async with httpx.AsyncClient() as client:
        resp = await client.post(url, content=payload, headers=headers)
        return 200 <= resp.status_code < 300
