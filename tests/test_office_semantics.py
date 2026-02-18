from __future__ import annotations

from bills_analysis.integrations.local_backend import _resolve_receiver_address_ok
from bills_analysis.integrations.office_semantics import (
    match_receiver_address,
    match_receiver_name,
    resolve_receiver_ok,
)


def test_match_receiver_address_accepts_street_variants() -> None:
    """Street spelling variants should still match when house number, PLZ, and city are consistent."""

    expected = "Reinoldistr.8 44135 Dortmund"
    assert match_receiver_address("Reinoldistr. 8 44135 Dortmund", expected) is True
    assert match_receiver_address("Reinoldistrasse 8, 44135 Dortmund", expected) is True
    assert match_receiver_address("Reinoldistraße 8\n44135 Dortmund", expected) is True


def test_match_receiver_address_rejects_wrong_components() -> None:
    """Address mismatch in house number, postal code, or city should fail semantic matching."""

    expected = "Reinoldistr.8 44135 Dortmund"
    assert match_receiver_address("Reinoldistr. 9 44135 Dortmund", expected) is False
    assert match_receiver_address("Reinoldistr. 8 44139 Dortmund", expected) is False
    assert match_receiver_address("Reinoldistr. 8 44135 Essen", expected) is False


def test_resolve_receiver_address_ok_uses_semantic_match(monkeypatch) -> None:
    """Receiver address resolver should evaluate using semantic matcher instead of strict string equality."""

    monkeypatch.setenv("OFFICE_EXPECTED_RECEIVER_ADDRESS", "Reinoldistr.8 44135 Dortmund")
    office_info = {"receiver_address": "Reinoldistrasse 8, 44135 Dortmund"}
    assert _resolve_receiver_address_ok(office_info) is True


def test_match_receiver_name_accepts_i_l_confusion() -> None:
    """Receiver name matcher should accept conservative OCR I/l confusion without broad fuzzy matching."""

    assert match_receiver_name("Ramen lppin Dortmund GmbH", "Ramen Ippin Dortmund GmbH") is True


def test_match_receiver_name_rejects_true_name_mismatch() -> None:
    """Receiver name matcher should reject real name differences to avoid risky over-correction."""

    assert match_receiver_name("Ramen Ippin Essen GmbH", "Ramen Ippin Dortmund GmbH") is False


def test_resolve_receiver_ok_uses_name_and_address_signals() -> None:
    """Receiver ok should require both conservative name match and semantic address match when no explicit bool is provided."""

    office_info = {
        "receiver": "Ramen lppin Dortmund GmbH",
        "receiver_address": "Reinoldistrasse 8, 44135 Dortmund",
    }
    assert resolve_receiver_ok(
        office_info,
        expected_receiver="Ramen Ippin Dortmund GmbH",
        expected_address="Reinoldistr.8 44135 Dortmund",
    ) is True
    office_info["receiver_address"] = "Reinoldistr. 8 44135 Essen"
    assert resolve_receiver_ok(
        office_info,
        expected_receiver="Ramen Ippin Dortmund GmbH",
        expected_address="Reinoldistr.8 44135 Dortmund",
    ) is False
