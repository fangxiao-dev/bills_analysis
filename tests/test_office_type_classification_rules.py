from __future__ import annotations

from bills_analysis.extract_by_azure_api import (
    OFFICE_PURPOSE_FALLBACK,
    OFFICE_PURPOSE_JFC,
    OFFICE_PURPOSE_RAMEN_EUROPA,
    normalize_office_purpose,
)


def test_jfc_vendor_always_overrides_to_jfc() -> None:
    """If JFC appears in evidence, final purpose must be JFC regardless of LLM raw output."""

    purpose, debug = normalize_office_purpose(
        llm_purpose=OFFICE_PURPOSE_RAMEN_EUROPA,
        sender="JFC Deutschland",
        receiver="Ramen Ippin Dortmund GmbH",
        distilled_data={
            "VendorName": {"valueString": "JFC Deutschland GmbH"},
            "CustomerName": {"valueString": "Ramen Ippin Dortmund GmbH"},
        },
    )
    assert purpose == OFFICE_PURPOSE_JFC
    assert debug["guardrail_hit"] is True
    assert debug["reason"] == "jfc_override"


def test_receiver_ramen_without_vendor_europa_cannot_be_ramen_europa() -> None:
    """Receiver-side Ramen Ippin text alone must not trigger the Ramen Europa special type."""

    purpose, debug = normalize_office_purpose(
        llm_purpose=OFFICE_PURPOSE_RAMEN_EUROPA,
        sender="Saciri Cleaning Service",
        receiver="Ramen Ippin Dortmund GmbH",
        distilled_data={
            "VendorName": {"valueString": "Saciri Glas&Gebäudereinigungs Service"},
            "CustomerName": {"valueString": "Ramen Ippin Dortmund GmbH"},
        },
    )
    assert purpose == OFFICE_PURPOSE_FALLBACK
    assert debug["guardrail_hit"] is True
    assert debug["reason"] == "reject_ramen_europa_without_vendor_europa"


def test_vendor_ramen_with_europa_is_classified_as_ramen_europa() -> None:
    """Vendor-side evidence containing Ramen Ippin + Europa should be normalized to Ramen Europa."""

    purpose, debug = normalize_office_purpose(
        llm_purpose="Lebensmittel&Bedarf",
        sender="Ramen Ippin Europa",
        receiver="Ramen Ippin Dortmund GmbH",
        distilled_data={
            "VendorName": {"valueString": "Ramen lppin Europa GmbH"},
            "CustomerName": {"valueString": "Ramen Ippin Dortmund GmbH"},
        },
    )
    assert purpose == OFFICE_PURPOSE_RAMEN_EUROPA
    assert debug["guardrail_hit"] is True
    assert debug["reason"] == "ramen_europa_vendor_evidence"


def test_asiatico_stays_non_special_when_no_guardrail_triggers() -> None:
    """Regular non-special purposes should remain unchanged when no hard rule is hit."""

    purpose, debug = normalize_office_purpose(
        llm_purpose="Lebensmittel&Bedarf",
        sender="Asiatico",
        receiver="Ramen Ippin Dortmund GmbH",
        distilled_data={
            "VendorName": {"valueString": "Asiatico BV"},
            "CustomerName": {"valueString": "Ramen Ippin Dortmund GmbH"},
        },
    )
    assert purpose == "Lebensmittel&Bedarf"
    assert debug["guardrail_hit"] is False
    assert debug["reason"] == "no_override"
