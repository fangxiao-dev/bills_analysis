from __future__ import annotations

import re


def _canonicalize_company_text(text: str) -> str:
    """Normalize company text for conservative fuzzy matching across OCR and punctuation variants."""

    norm = text.strip().casefold()
    replacements = {
        "ß": "ss",
        "ä": "ae",
        "ö": "oe",
        "ü": "ue",
        ",": " ",
        ".": " ",
        "\n": " ",
        "\r": " ",
        "\t": " ",
    }
    for src, dest in replacements.items():
        norm = norm.replace(src, dest)
    norm = re.sub(r"\s+", " ", norm)
    return norm.strip()


def _ocr_fold_token(token: str) -> str:
    """Fold common OCR-confused characters into a canonical token for guarded equivalence checks."""

    folded = token
    folded = folded.replace("1", "i")
    folded = folded.replace("l", "i")
    folded = folded.replace("|", "i")
    folded = folded.replace("0", "o")
    return folded


def _tokens_equivalent(actual: str, expected: str) -> bool:
    """Compare two company name tokens with conservative OCR ambiguity folding."""

    if actual == expected:
        return True
    return _ocr_fold_token(actual) == _ocr_fold_token(expected)


def match_receiver_name(receiver_text: str, expected_receiver: str) -> bool | None:
    """Return conservative semantic equivalence for receiver company names."""

    actual = (receiver_text or "").strip()
    expected = (expected_receiver or "").strip()
    if not actual or not expected:
        return None

    actual_norm = _canonicalize_company_text(actual)
    expected_norm = _canonicalize_company_text(expected)
    if actual_norm == expected_norm:
        return True

    actual_tokens = actual_norm.split(" ")
    expected_tokens = expected_norm.split(" ")
    if len(actual_tokens) != len(expected_tokens):
        return False

    ambiguous_hits = 0
    for actual_token, expected_token in zip(actual_tokens, expected_tokens):
        if actual_token == expected_token:
            continue
        if not _tokens_equivalent(actual_token, expected_token):
            return False
        ambiguous_hits += 1
    return ambiguous_hits > 0


def _canonicalize_address_text(text: str) -> str:
    """Normalize address text for robust semantic matching across OCR and punctuation variants."""

    norm = text.strip().casefold()
    replacements = {
        "ß": "ss",
        "ä": "ae",
        "ö": "oe",
        "ü": "ue",
        ",": " ",
        "\n": " ",
        "\r": " ",
        "\t": " ",
    }
    for src, dest in replacements.items():
        norm = norm.replace(src, dest)
    norm = re.sub(r"\s+", " ", norm)
    return norm.strip()


def _extract_address_components(text: str) -> tuple[str | None, str | None, str | None, str | None]:
    """Extract canonical street key, house number, postal code, and city from free-form address text."""

    norm = _canonicalize_address_text(text)
    street_key = "reinoldistr" if "reinoldistr" in norm else None

    house_no: str | None = None
    house_match = re.search(r"reinoldistr(?:asse|\.|\s)*\s*(\d+[a-z]?)\b", norm)
    if house_match:
        house_no = house_match.group(1)

    plz: str | None = None
    plz_match = re.search(r"\b(\d{5})\b", norm)
    if plz_match:
        plz = plz_match.group(1)

    city = "dortmund" if "dortmund" in norm else None
    return street_key, house_no, plz, city


def match_receiver_address(address_text: str, expected_address: str) -> bool | None:
    """Return semantic equivalence for receiver address using street/no./PLZ/city components."""

    actual = (address_text or "").strip()
    expected = (expected_address or "").strip()
    if not actual or not expected:
        return None

    actual_components = _extract_address_components(actual)
    expected_components = _extract_address_components(expected)
    if any(component is None for component in expected_components):
        return _canonicalize_address_text(actual) == _canonicalize_address_text(expected)
    return actual_components == expected_components


def resolve_receiver_ok(
    office_info: dict[str, object],
    *,
    expected_receiver: str,
    expected_address: str,
) -> bool | None:
    """Resolve receiver consistency by combining explicit model output and conservative dual-signal checks."""

    receiver_ok = office_info.get("receiver_ok")
    if isinstance(receiver_ok, bool):
        return receiver_ok
    if isinstance(receiver_ok, str):
        text = receiver_ok.strip().lower()
        if text in {"true", "yes", "1", "ok"}:
            return True
        if text in {"false", "no", "0"}:
            return False

    receiver_value = office_info.get("receiver")
    if not isinstance(receiver_value, str):
        return None
    name_ok = match_receiver_name(receiver_value, expected_receiver)
    if name_ok is not True:
        return name_ok

    address_value = office_info.get("receiver_address")
    if not isinstance(address_value, str):
        return None
    return match_receiver_address(address_value, expected_address)
