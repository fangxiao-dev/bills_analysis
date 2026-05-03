from __future__ import annotations

from bills_analysis.integrations.invoice_content_extractor import extract_bill_id


def test_extracts_rechnung_nr_from_table_row() -> None:
    payload = {
        "tables": [
            {
                "cells": [
                    {"row_index": 0, "column_index": 0, "content": "Auftrags-Nr.:"},
                    {"row_index": 0, "column_index": 1, "content": "O25-549985559821"},
                    {"row_index": 1, "column_index": 0, "content": "Rechnungs-Nr.:"},
                    {"row_index": 1, "column_index": 1, "content": "RE1064897"},
                    {"row_index": 2, "column_index": 0, "content": "Kunden-Nr.:"},
                    {"row_index": 2, "column_index": 1, "content": "1238563"},
                ]
            }
        ],
        "content": "Auftrags-Nr.: O25-549985559821\nRechnungs-Nr.: RE1064897",
    }

    result = extract_bill_id(payload)

    assert result["value"] == "RE1064897"
    assert result["source"] == "table_row"
    assert result["label"] == "Rechnungs-Nr.:"


def test_extracts_rechnung_nr_from_content_line_without_exact_label_name() -> None:
    payload = {
        "content": "Lieferadresse\nRechnung Nr RE-2026/0042\nKunden-Nr. 123456",
        "tables": [],
    }

    result = extract_bill_id(payload)

    assert result["value"] == "RE-2026/0042"
    assert result["source"] == "content_regex"


def test_ignores_order_number_when_rechnung_nr_is_absent() -> None:
    payload = {
        "content": "Auftrags-Nr.: O25-549985559821\nKunden-Nr.: 1238563",
        "tables": [
            {
                "cells": [
                    {"rowIndex": 0, "columnIndex": 0, "content": "Auftrags-Nr.:"},
                    {"rowIndex": 0, "columnIndex": 1, "content": "O25-549985559821"},
                ]
            }
        ],
    }

    result = extract_bill_id(payload)

    assert result["value"] is None


def test_extracts_value_from_same_column_next_row_for_header_tables() -> None:
    payload = {
        "tables": [
            {
                "cells": [
                    {"rowIndex": 0, "columnIndex": 0, "content": "Rechnungsnummer"},
                    {"rowIndex": 0, "columnIndex": 1, "content": "Datum der Lieferung"},
                    {"rowIndex": 1, "columnIndex": 0, "content": "R25-03089715"},
                    {"rowIndex": 1, "columnIndex": 1, "content": "25.08.2025"},
                ]
            }
        ],
        "content": "",
    }

    result = extract_bill_id(payload)

    assert result["value"] == "R25-03089715"
    assert result["source"] == "table_column_below"


def test_extracts_beleg_nr_when_it_is_under_rechnung_heading() -> None:
    payload = {
        "content": "go asia Supermarkt\nRechnung\nBeleg-Nr .:\n100578596\nDatum: 18.08.2025",
        "tables": [],
    }

    result = extract_bill_id(payload)

    assert result["value"] == "100578596"
    assert result["source"] == "content_adjacent_line"
