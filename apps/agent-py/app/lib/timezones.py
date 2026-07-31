"""Timezone resolution for scheduling.

Meeting times arrive from the model as ISO strings. Before this module they were
parsed with a bare `datetime.fromisoformat`, so a string with no offset produced a
*naive* datetime and `.timestamp()` silently read it in the container's local zone —
conflict checks against UTC-aware calendar data were then wrong by that offset, with
no error. Everything here exists to make the zone explicit and carried end to end:
resolve it once (explicit IANA > location hint > configured default), attach it at
parse time, and hand it to Google Calendar alongside the timestamp.
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.config import settings

# Location hint -> IANA zone. Matched on word boundaries against the free-text
# `location` the model passes ("Zoom", "NYC office", "Bengaluru HQ"). Virtual-meeting
# words (zoom/meet/teams/webex) are deliberately absent so they fall through to the
# default rather than inventing a zone.
_LOCATION_ZONES: dict[str, str] = {
    # India — "IST" is ambiguous (also Irish/Israel Standard Time); this corpus is
    # India-centric, so it maps here. Pass an explicit IANA name to override.
    "india": "Asia/Kolkata", "ist": "Asia/Kolkata", "kolkata": "Asia/Kolkata",
    "calcutta": "Asia/Kolkata", "mumbai": "Asia/Kolkata", "bombay": "Asia/Kolkata",
    "delhi": "Asia/Kolkata", "new delhi": "Asia/Kolkata", "gurgaon": "Asia/Kolkata",
    "noida": "Asia/Kolkata", "bengaluru": "Asia/Kolkata", "bangalore": "Asia/Kolkata",
    "hyderabad": "Asia/Kolkata", "chennai": "Asia/Kolkata", "pune": "Asia/Kolkata",
    # US Eastern
    "eastern": "America/New_York", "et": "America/New_York", "est": "America/New_York",
    "edt": "America/New_York", "new york": "America/New_York", "nyc": "America/New_York",
    "manhattan": "America/New_York", "brooklyn": "America/New_York",
    "boston": "America/New_York", "atlanta": "America/New_York", "miami": "America/New_York",
    "philadelphia": "America/New_York", "washington": "America/New_York",
    "dc": "America/New_York", "toronto": "America/Toronto", "ottawa": "America/Toronto",
    # US Central — "CST" also means China Standard Time; US reading chosen here.
    "central": "America/Chicago", "cst": "America/Chicago", "cdt": "America/Chicago",
    "chicago": "America/Chicago", "dallas": "America/Chicago", "houston": "America/Chicago",
    "austin": "America/Chicago", "minneapolis": "America/Chicago",
    # US Mountain — Phoenix does not observe DST, so it gets its own zone.
    "mountain": "America/Denver", "mst": "America/Denver", "mdt": "America/Denver",
    "denver": "America/Denver", "salt lake city": "America/Denver",
    "phoenix": "America/Phoenix", "arizona": "America/Phoenix",
    # US Pacific
    "pacific": "America/Los_Angeles", "pt": "America/Los_Angeles",
    "pst": "America/Los_Angeles", "pdt": "America/Los_Angeles",
    "san francisco": "America/Los_Angeles", "sf": "America/Los_Angeles",
    "bay area": "America/Los_Angeles", "san jose": "America/Los_Angeles",
    "palo alto": "America/Los_Angeles", "mountain view": "America/Los_Angeles",
    "los angeles": "America/Los_Angeles", "seattle": "America/Los_Angeles",
    "portland": "America/Los_Angeles", "vancouver": "America/Vancouver",
    # UK / Europe
    "london": "Europe/London", "uk": "Europe/London", "england": "Europe/London",
    "bst": "Europe/London", "dublin": "Europe/Dublin", "lisbon": "Europe/Lisbon",
    "cet": "Europe/Berlin", "cest": "Europe/Berlin", "berlin": "Europe/Berlin",
    "munich": "Europe/Berlin", "paris": "Europe/Paris", "amsterdam": "Europe/Amsterdam",
    "madrid": "Europe/Madrid", "barcelona": "Europe/Madrid", "rome": "Europe/Rome",
    "milan": "Europe/Rome", "zurich": "Europe/Zurich", "vienna": "Europe/Vienna",
    "stockholm": "Europe/Stockholm", "warsaw": "Europe/Warsaw",
    # APAC / MEA / LATAM
    "singapore": "Asia/Singapore", "sgt": "Asia/Singapore",
    "tokyo": "Asia/Tokyo", "japan": "Asia/Tokyo", "jst": "Asia/Tokyo",
    "seoul": "Asia/Seoul", "hong kong": "Asia/Hong_Kong",
    "shanghai": "Asia/Shanghai", "beijing": "Asia/Shanghai", "china": "Asia/Shanghai",
    "sydney": "Australia/Sydney", "melbourne": "Australia/Melbourne",
    "aest": "Australia/Sydney", "auckland": "Pacific/Auckland",
    "dubai": "Asia/Dubai", "uae": "Asia/Dubai", "abu dhabi": "Asia/Dubai",
    "tel aviv": "Asia/Jerusalem", "jerusalem": "Asia/Jerusalem",
    "sao paulo": "America/Sao_Paulo", "mexico city": "America/Mexico_City",
}

# "GMT+5:30", "UTC-08:00", "+0530" — a raw offset the user typed instead of a zone name.
_OFFSET_RE = re.compile(r"^(?:gmt|utc)?\s*([+-])(\d{1,2})(?::?(\d{2}))?$", re.IGNORECASE)


def _fixed_offset(text: str) -> tuple[timezone, str] | None:
    m = _OFFSET_RE.match(text.strip())
    if not m:
        return None
    sign, hours, minutes = m.group(1), int(m.group(2)), int(m.group(3) or 0)
    if hours > 14 or minutes > 59:
        return None
    delta = timedelta(hours=hours, minutes=minutes)
    if sign == "-":
        delta = -delta
    return timezone(delta), f"UTC{sign}{hours:02d}:{minutes:02d}"


def _named_zone(text: str) -> tuple[ZoneInfo, str] | None:
    try:
        return ZoneInfo(text), text
    except (ZoneInfoNotFoundError, ValueError, KeyError):
        return None


def zone_from_location(location: str | None) -> tuple[ZoneInfo, str] | None:
    """Best-effort IANA zone from a free-text location. None when nothing matches."""
    if not location:
        return None
    norm = re.sub(r"\s+", " ", location.strip().lower())
    # Longest key first so "new york" wins over "york"-like partials.
    for key in sorted(_LOCATION_ZONES, key=len, reverse=True):
        if re.search(rf"\b{re.escape(key)}\b", norm):
            return _named_zone(_LOCATION_ZONES[key])
    return None


def default_zone() -> tuple[ZoneInfo | timezone, str]:
    configured = (settings.default_timezone or "UTC").strip()
    return _named_zone(configured) or _fixed_offset(configured) or (timezone.utc, "UTC")


def resolve_zone(tz: str | None = None, location: str | None = None):
    """Pick the zone for a meeting: explicit tz > location hint > configured default.

    Returns (tzinfo, name, source) where source is one of explicit/location/default —
    surfaced to the user so an inferred zone is never silently assumed to be confirmed.
    """
    if tz and tz.strip():
        hit = _named_zone(tz.strip()) or _fixed_offset(tz) or zone_from_location(tz)
        if hit:
            return hit[0], hit[1], "explicit"
    hit = zone_from_location(location)
    if hit:
        return hit[0], hit[1], "location"
    zone, name = default_zone()
    return zone, name, "default"


def iana_or_none(name: str | None) -> str | None:
    """Google Calendar's `timeZone` field only accepts an IANA id — a raw-offset label
    like 'UTC+05:30' would be rejected, and the ISO offset already covers that case."""
    return name if name and _named_zone(name) else None


def parse_in_zone(iso: str, zone) -> datetime:
    """Parse an ISO datetime, attaching `zone` only when the string carries no offset.

    An explicit offset in the string is authoritative and preserved; a bare wall-clock
    time is interpreted in the meeting's zone rather than the server's.
    """
    dt = datetime.fromisoformat(str(iso).strip().replace("Z", "+00:00"))
    return dt.replace(tzinfo=zone) if dt.tzinfo is None else dt


def format_in_zone(dt: datetime, zone, name: str) -> str:
    """Human label for a slot, e.g. 'Wed 15 Jul 2026, 2:00 PM IST (UTC+05:30)'."""
    local = dt.astimezone(zone)
    offset = local.strftime("%z")
    pretty_offset = f"{offset[:3]}:{offset[3:]}" if len(offset) == 5 else offset
    abbrev = local.strftime("%Z")
    stamp = local.strftime("%a %d %b %Y, %I:%M %p").replace(" 0", " ")
    label = abbrev or name
    # A fixed-offset zone labels itself "UTC+05:30"; don't repeat that in parentheses.
    if label.upper().startswith("UTC") or label.upper().startswith("GMT"):
        return f"{stamp} UTC{pretty_offset}"
    return f"{stamp} {label} (UTC{pretty_offset})"
