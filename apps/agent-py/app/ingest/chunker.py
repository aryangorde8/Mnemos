"""Paragraph-aware chunker — port of apps/agent/src/ingest/chunker.ts."""
from __future__ import annotations

import re

TARGET_CHARS = 720
HARD_MAX = 1100
OVERLAP_CHARS = 140


def _tail_overlap(text: str, n: int) -> str:
    if len(text) <= n:
        return text
    sl = text[len(text) - n:]
    m = re.search(r"[.!?]\s|\n", sl)
    return sl[m.start() + 1:].strip() if m else sl.strip()


def _split_sentence(para: str, target: int, hard_max: int) -> list[str]:
    sentences = re.split(r"(?<=[.!?])\s+(?=[A-Z0-9\"'])", para)
    out: list[str] = []
    buf = ""
    for s in sentences:
        candidate = (buf + " " + s) if buf else s
        if len(candidate) > hard_max:
            if buf:
                out.append(buf)
            if len(s) > hard_max:
                for i in range(0, len(s), target):
                    out.append(s[i:i + target])
                buf = ""
            else:
                buf = s
        else:
            buf = candidate
        if len(buf) >= target:
            out.append(buf)
            buf = ""
    if buf:
        out.append(buf)
    return out


def chunk(text: str) -> list[dict]:
    normalized = text.replace("\r\n", "\n").strip()
    if not normalized:
        return []
    paragraphs = [p.strip() for p in re.split(r"\n{2,}", normalized) if p.strip()]

    chunks: list[dict] = []
    state = {"buffer": "", "ordinal": 0}

    def flush():
        t = state["buffer"].strip()
        if not t:
            return
        chunks.append({"text": t, "ordinal": state["ordinal"]})
        state["ordinal"] += 1
        state["buffer"] = _tail_overlap(t, OVERLAP_CHARS) if OVERLAP_CHARS > 0 else ""

    for para in paragraphs:
        if len(para) > HARD_MAX:
            if state["buffer"]:
                flush()
            for piece in _split_sentence(para, TARGET_CHARS, HARD_MAX):
                state["buffer"] = (state["buffer"] + "\n\n" + piece) if state["buffer"] else piece
                if len(state["buffer"]) >= TARGET_CHARS:
                    flush()
            continue
        nxt = (state["buffer"] + "\n\n" + para) if state["buffer"] else para
        if len(nxt) > HARD_MAX:
            flush()
            state["buffer"] = (state["buffer"] + para) if state["buffer"] else para
        else:
            state["buffer"] = nxt
        if len(state["buffer"]) >= TARGET_CHARS:
            flush()
    if state["buffer"].strip():
        flush()
    return chunks
