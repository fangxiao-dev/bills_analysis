# src/bills_analysis/azure_extraction.py
from __future__ import annotations

import json
import os
import re

try:
    from dotenv import load_dotenv
except ModuleNotFoundError:
    def load_dotenv(*_args, **_kwargs):
        """Fallback no-op when python-dotenv is not installed."""

        return False

from openai import AzureOpenAI

try:
    from azure.core.credentials import AzureKeyCredential
    from azure.ai.documentintelligence import DocumentIntelligenceClient
    from azure.ai.documentintelligence.models import AnalyzeDocumentRequest
    _AZURE_DI_IMPORT_ERROR: Exception | None = None
except ModuleNotFoundError as exc:
    AzureKeyCredential = None  # type: ignore[assignment]
    DocumentIntelligenceClient = None  # type: ignore[assignment]
    AnalyzeDocumentRequest = None  # type: ignore[assignment]
    _AZURE_DI_IMPORT_ERROR = exc


def _field_to_dict(field) -> dict:
    if field is None:
        return {}
    if hasattr(field, "as_dict"):
        try:
            return field.as_dict()
        except Exception:
            pass
    payload = {}
    for attr in [
        "type",
        "content",
        "value_string",
        "value_number",
        "value_currency",
        "value_date",
        "value_address",
        "value_array",
        "value_object",
    ]:
        val = getattr(field, attr, None)
        if val is not None:
            payload[attr] = val
    return payload


def _fields_to_dict(fields: dict) -> dict:
    if not isinstance(fields, dict):
        return {}
    return {k: _field_to_dict(v) for k, v in fields.items()}


def _extract_amount(field) -> float | None:
    # print([f"Extracting amount from field: {field}"])
    if not field:
        return None
    if getattr(field, "value_currency", None):
        print([f"  found value_currency: {field.value_currency}"])
        return field.value_currency.amount
    if getattr(field, "valueCurrency", None):
        print([f"  found valueCurrency: {field.valueCurrency}"])
        return field.valueCurrency.amount
    if getattr(field, "value_number", None) is not None:
        print([f"  found value_number: {field.value_number}"])  
        return field.value_number
    # Fallback: parse content like "1.181,75"
    content = getattr(field, "content", None)
    if not content:
        return None
    text = str(content).strip()
    if not text:
        return None
    text = text.replace(" ", "")
    # normalize 1.181,75 or 1,181.75
    if "," in text and "." in text:
        if text.rfind(",") > text.rfind("."):
            text = text.replace(".", "")
            text = text.replace(",", ".")
        else:
            text = text.replace(",", "")
    else:
        text = text.replace(",", ".")
    try:
        return float(text)
    except ValueError:
        return None

load_dotenv()

_DI_CLIENT: DocumentIntelligenceClient | None = None
_AOAI_CLIENT: AzureOpenAI | None = None
OFFICE_PURPOSE_JFC = "JFC"
OFFICE_PURPOSE_RAMEN_EUROPA = "Ramenlppin Europa"
OFFICE_PURPOSE_FALLBACK = "Service&Andere"


def _get_di_client() -> DocumentIntelligenceClient:
    global _DI_CLIENT
    if _AZURE_DI_IMPORT_ERROR is not None:
        raise RuntimeError(
            "缺少依赖 azure-ai-documentintelligence，请执行 `uv sync` 后重试。"
        ) from _AZURE_DI_IMPORT_ERROR

    endpoint = os.getenv("AZURE_DI_ENDPOINT") or os.getenv("AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT")
    key = os.getenv("AZURE_DI_KEY") or os.getenv("AZURE_DOCUMENT_INTELLIGENCE_KEY")
    if not endpoint or not key:
        raise ValueError(
            "请设置 AZURE_DI_ENDPOINT/AZURE_DI_KEY（兼容 AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT/KEY）"
        )
    if _DI_CLIENT is None:
        _DI_CLIENT = DocumentIntelligenceClient(
            endpoint=endpoint,
            credential=AzureKeyCredential(key),
            api_version="2024-11-30",
        )
        print("[Azure] client created")
    return _DI_CLIENT


def _get_aoai_client() -> AzureOpenAI:
    global _AOAI_CLIENT
    endpoint = os.getenv("AZURE_OPENAI_ENDPOINT")
    key = os.getenv("AZURE_OPENAI_KEY")
    if not endpoint or not key:
        raise ValueError("请在环境变量中设置 AZURE_OPENAI_ENDPOINT 和 AZURE_OPENAI_KEY")
    if _AOAI_CLIENT is None:
        _AOAI_CLIENT = AzureOpenAI(
            azure_endpoint=endpoint,
            api_key=key,
            api_version="2025-01-01-preview",
        )
        print("[AzureOpenAI] client created")
    return _AOAI_CLIENT

def analyze_document_with_azure(
    image_path: str,
    model_id: str = "prebuilt-invoice",
    *,
    return_fields: bool = False,
):
    """
    通用分析函数：支持指定使用 invoice 或 receipt 模型
    提取：brutto, netto, store_name, total_tax, run_date + 对应 confidence
    如果是 invoice 模型提取，则额外提取 invoice_id
    """
    print(f"[Azure] model_id={model_id}")   # "prebuilt-invoice" / "prebuilt-receipt"
    print(f"[Azure] image_path={image_path}")
    # print(f"[Azure] endpoint_set={bool(endpoint)} key_set={bool(key)}")
    client = _get_di_client()

    # 读取本地文件为字节流
    with open(image_path, "rb") as f:
        file_content = f.read()
    print(f"[Azure] bytes_read={len(file_content)}")

    # 根据调用前判断好的 model_id 进行分析
    # print("[Azure] begin analyze")
    di_timeout_sec = float(os.getenv("DI_TIMEOUT_SEC", "120"))
    poller = client.begin_analyze_document(
        model_id, 
        AnalyzeDocumentRequest(bytes_source=file_content)
    )
    result = poller.result(timeout=di_timeout_sec)
    # print(json.dumps(result.as_dict(), indent=2))
    print(f"[Azure] Finished documents_count={len(result.documents) if result.documents else 0}")

    extracted_data = {
        "model_used": model_id,
        "store_name": None,
        "confidence_store_name": None,
        "brutto": None,
        "confidence_brutto": None,
        "total_tax": None,
        "confidence_total_tax": None,
        "netto": None,
        "confidence_netto": None,
        "invoice_id": None,
        "confidence_invoice_id": None
    }

    fields_dict = {}
    if result.documents:
        doc = result.documents[0]
        fields = doc.fields
        fields_dict = _fields_to_dict(fields)
        # print(fields)
        print(f"[Azure] fields keys: {list(fields.keys())}")
        # 1. Store Name 提取
        if model_id == "prebuilt-receipt":
            f_merchant = fields.get("MerchantName")
            extracted_data["store_name"] = f_merchant.value_string if f_merchant else None
            extracted_data["confidence_store_name"] = f_merchant.confidence if f_merchant else None
        else: # prebuilt-invoice
            f_vendor = fields.get("VendorName")
            extracted_data["store_name"] = f_vendor.value_string if f_vendor else None
            extracted_data["confidence_store_name"] = f_vendor.confidence if f_vendor else None

        # 2. Brutto (总额) 提取
        # Prefer model-specific field, but fallback to other common fields.
        f_total = None
        if model_id == "prebuilt-receipt":
            f_total = fields.get("Total") or fields.get("InvoiceTotal")
        else:
            f_total = fields.get("InvoiceTotal") or fields.get("Total")
        print(f"[Azure] f_total field: {f_total}")
        if f_total:
            extracted_data["brutto"] = _extract_amount(f_total)
            extracted_data["confidence_brutto"] = f_total.confidence
        print(f"[Azure] brutto={extracted_data['brutto']} conf={extracted_data['confidence_brutto']}")

        # 3. Netto (净额) 提取
        # 官方文档显示两者均对应 Subtotal 字段
        f_subtotal = fields.get("Subtotal") or fields.get("SubTotal")
        if f_subtotal:
            extracted_data["netto"] = _extract_amount(f_subtotal)
            extracted_data["confidence_netto"] = f_subtotal.confidence
            print(f"[Azure] subtotal={extracted_data['netto']} conf={extracted_data['confidence_netto']}")

        # 4. TotalTax 提取（同时作为 brutto/netto 兜底）
        if extracted_data["brutto"] is None or extracted_data["netto"] is None:
            f_total_tax = fields.get("TotalTax")
            total_tax = None
            if f_total_tax:
                total_tax = _extract_amount(f_total_tax)
                extracted_data["total_tax"] = total_tax
                extracted_data["confidence_total_tax"] = f_total_tax.confidence
            if total_tax is not None:
                print(f"[Azure] TotalTax={total_tax} used for fallback")
                if extracted_data["brutto"] is None and extracted_data["netto"] is not None:
                    extracted_data["brutto"] = round(extracted_data["netto"] + total_tax, 2)
                    extracted_data["confidence_brutto"] = -1
                elif extracted_data["netto"] is None and extracted_data["brutto"] is not None:
                    extracted_data["netto"] = round(extracted_data["brutto"] - total_tax, 2)
                    extracted_data["confidence_netto"] = -1
            else:
                print("[Azure] TotalTax missing; cannot infer brutto/netto")
        else:
            f_total_tax = fields.get("TotalTax")
            if f_total_tax:
                extracted_data["total_tax"] = (
                    f_total_tax.value_currency.amount
                    if f_total_tax.value_currency
                    else f_total_tax.value_number
                )
                extracted_data["confidence_total_tax"] = f_total_tax.confidence

        # 5. Invoice ID (仅限 Invoice 模型)
        if model_id == "prebuilt-invoice":
            f_inv_id = fields.get("VendorTaxId")
            extracted_data["invoice_id"] = f_inv_id.value_string.replace(" ", "") if f_inv_id else None
            extracted_data["confidence_invoice_id"] = f_inv_id.confidence if f_inv_id else None

        # 6. Customer Address (仅限 Invoice 模型，用于 office receiver address 校验)
        if model_id == "prebuilt-invoice":
            f_cust_addr = fields.get("CustomerAddress") or fields.get("BillingAddress")
            extracted_data["customer_address"] = getattr(f_cust_addr, "content", None) if f_cust_addr else None
            extracted_data["confidence_customer_address"] = f_cust_addr.confidence if f_cust_addr else None

    print(f"[Azure] extracted_data for this page:\n{extracted_data}")
    if return_fields:
        return extracted_data, fields_dict
    return extracted_data


def clean_invoice_json(data):
    """
    递归清理 Azure DI 返回的 JSON，仅保留核心业务字段。
    """
    if isinstance(data, dict):
        # 定义需要保留的关键字段
        # 我们可以保留 type 来帮助 GPT 理解数据格式
        cleaned = {}
        for k, v in data.items():
            # 跳过冗余的视觉和位置信息
            if k in ['boundingRegions', 'polygon', 'spans', 'confidence']:
                continue
            
            # 递归处理内容
            res = clean_invoice_json(v)
            if res is not None:
                cleaned[k] = res
        return cleaned
    
    elif isinstance(data, list):
        return [clean_invoice_json(item) for item in data]
    
    else:
        # 返回基础类型数据 (str, int, float, bool)
        return data

def test_clean_invoice_json():
    # 使用示例
    with open('tmp_invoice_3.json', 'r', encoding='utf-8') as f:
        raw_data = json.load(f)

    minimized_data = clean_invoice_json(raw_data)

    # 打印对比结果
    print(f"原始字符数: {len(json.dumps(raw_data))}")
    print(f"清理后字符数: {len(json.dumps(minimized_data))}")

    # 保存为精简版供 GPT 使用
    with open('minimized_invoice.json', 'w', encoding='utf-8') as f:
        json.dump(minimized_data, f, ensure_ascii=False)


def test_analyze_receipt_with_azure():
    img_path = rf"D:\CodeSpace\prj_rechnung\bills_analysis\data\samples\scanned\Metzgerei 105_13.pdf"
    analyze_document_with_azure(img_path, model_id="prebuilt-receipt")


def test_analyze_invoice_with_azure():
    img_path = rf"D:\CodeSpace\prj_rechnung\test_data\b\Metro 195_56.pdf"
    analyze_document_with_azure(img_path, model_id="prebuilt-invoice")


def _flatten_text_values(payload: object) -> str:
    """Recursively flatten all string values from nested payload into one lowercase text blob."""

    parts: list[str] = []

    def _walk(node: object) -> None:
        if isinstance(node, dict):
            for value in node.values():
                _walk(value)
            return
        if isinstance(node, list):
            for item in node:
                _walk(item)
            return
        if isinstance(node, str):
            stripped = node.strip()
            if stripped:
                parts.append(stripped)

    _walk(payload)
    return " ".join(parts).lower()


def _collect_text_by_key_hints(payload: object, key_hints: set[str]) -> str:
    """Collect string values whose key path contains any provided hint token."""

    parts: list[str] = []

    def _walk(node: object, path: list[str]) -> None:
        if isinstance(node, dict):
            for key, value in node.items():
                key_text = str(key).strip().lower()
                _walk(value, [*path, key_text])
            return
        if isinstance(node, list):
            for item in node:
                _walk(item, path)
            return
        if isinstance(node, str):
            joined_path = ".".join(path)
            if any(hint in joined_path for hint in key_hints):
                stripped = node.strip()
                if stripped:
                    parts.append(stripped)

    _walk(payload, [])
    return " ".join(parts).lower()


def _is_ramen_europa_label(purpose: str | None) -> bool:
    """Return whether a purpose label semantically points to Ramen Ippin Europa."""

    if not isinstance(purpose, str):
        return False
    token = "".join(ch for ch in purpose.lower() if ch.isalnum())
    if "europa" not in token:
        return False
    ramen_aliases = {
        "ramenippin",
        "ramenlppin",
        "ramanippin",
        "ramanlppin",
    }
    return any(alias in token for alias in ramen_aliases)


def normalize_office_purpose(
    *,
    llm_purpose: str | None,
    sender: str | None,
    receiver: str | None,
    distilled_data: dict,
) -> tuple[str | None, dict[str, object]]:
    """Apply deterministic Office type guardrails after LLM output to prevent key misclassification regressions."""

    full_text = " ".join(
        [
            _flatten_text_values(distilled_data),
            str(sender or ""),
            str(receiver or ""),
            str(llm_purpose or ""),
        ]
    ).lower()
    vendor_side_text = " ".join(
        [
            _collect_text_by_key_hints(distilled_data, {"vendor", "seller", "supplier"}),
            str(sender or ""),
        ]
    ).lower()
    if not vendor_side_text.strip():
        vendor_side_text = full_text

    jfc_hit = bool(re.search(r"\bjfc\b", full_text, flags=re.IGNORECASE))
    ramen_hit = bool(re.search(r"ram[ae]n\s*[il1]ppin", vendor_side_text, flags=re.IGNORECASE))
    europa_hit = "europa" in vendor_side_text
    llm_is_ramen_europa = _is_ramen_europa_label(llm_purpose)

    if jfc_hit:
        return OFFICE_PURPOSE_JFC, {
            "guardrail_hit": True,
            "reason": "jfc_override",
            "jfc_hit": jfc_hit,
            "ramen_hit": ramen_hit,
            "europa_hit": europa_hit,
        }
    if ramen_hit and europa_hit:
        return OFFICE_PURPOSE_RAMEN_EUROPA, {
            "guardrail_hit": True,
            "reason": "ramen_europa_vendor_evidence",
            "jfc_hit": jfc_hit,
            "ramen_hit": ramen_hit,
            "europa_hit": europa_hit,
        }
    if llm_is_ramen_europa and not (ramen_hit and europa_hit):
        return OFFICE_PURPOSE_FALLBACK, {
            "guardrail_hit": True,
            "reason": "reject_ramen_europa_without_vendor_europa",
            "jfc_hit": jfc_hit,
            "ramen_hit": ramen_hit,
            "europa_hit": europa_hit,
        }

    return llm_purpose, {
        "guardrail_hit": False,
        "reason": "no_override",
        "jfc_hit": jfc_hit,
        "ramen_hit": ramen_hit,
        "europa_hit": europa_hit,
    }


def extract_office_invoice_azure(distilled_data: dict):
    """Extract office semantic fields via AOAI and apply deterministic purpose guardrails."""

    client = _get_aoai_client()
    # print(f"[AzureOpenAI] Extracting office invoice category with distilled data: {distilled_data}")
    prompt = """
        ### Role
        You are a professional financial assistant specializing in invoice data extraction and classification.

        ### Task
        Extract specific information from the provided invoice and output it in a strict JSON format.

        ### Information to Extract
        1. **purpose**: Classify the invoice into exactly ONE of the following allowed purpose.
        2. **sender**: The name of the company issuing the invoice.
        - *Rule*: Remove legal suffixes like "GmbH", "AG", "e.K.", "Ltd",etc. (e.g., "Ramen lppin Europa GmbH" -> "Ramen lppin Europa").
        3. **receiver**: The name of the company receiving the invoice (for verification).
        - *Rule*: Keep the full legal company name for receiver, including suffixes like "GmbH"/"AG" if present in invoice text.
        4. **receiver_address**: The street address of the company receiving the invoice (street + house number + postal code + city).
        - *Rule*: Output in one line as `<Street> <HouseNo> <PLZ> <City>`.

        ### OCR Correction Logic (General Rules)
        Before processing, apply these logic rules to fix common OCR/DI artifacts:
        - **Case Normalization**: In German business contexts, the first letter of each major word in a company name should be **Capitalized** (e.g., correct "ramen ippin" to "Ramen Ippin").
        - **Character Confusion**: 
            - Fix "l" (lowercase L) vs. "I" (uppercase i). If a word starts with "I/l" followed by lowercase letters, it is almost certainly an uppercase **"I"**.
            - Fix "0" (zero) vs. "O" (letter O) in company names.
            - Fix "ß" being recognized as "ll", "B", or "ss".
        - **Scope**: The standard name can be a subset of a complete name, e.g. the rules to normalize "Ramen Ippin" also apply to "Ramen Ippin Dortmund", "Ramen Ippin Europa".
        - **Address Normalization**: "Reinoldistraße" / "Reinoldistrasse" / "Reinoldistr." / "Reinoldistr" should all be normalized to "Reinoldistr.". Ensure street number is attached.
        - **Address Output Canonical Form**: If receiver street is Reinoldistrasse/Reinoldistraße variants, output as `Reinoldistr. <HouseNo> <PLZ> Dortmund`.
        - **Contextual Healing**: If a word is very close to a known business term or a name in the list below, e.g., just one or two letters off or missing a space, normalize it to the standard version.
        - **Conservative Receiver Correction**: For `receiver`, only correct high-confidence OCR confusions (`I/l/1`, `O/0`) and obvious spacing issues. Do not invent or over-normalize uncertain words.
        - **Receiver Evidence Rule**: If receiver name is uncertain, keep the closest raw text from invoice rather than forcing a guessed canonical entity.

        ### Standard Entity List As Examples
        Check extracted names against this list. If a match or near-match is found, use the **Standard Name**:
        - **Standard: "Ramen Ippin"** (Commonly misidentified as: "Ramen lppin", "Ramen 1ppin", "RamenIppin")
        - **Standard: "Fujigawa"** (Commonly misidentified as: "Fuiigawa", "Fujigwa", "Fuijgawa")
        - **Standard: "Asiatico"** (Commonly misidentified as: "Asiatco", "Asiatiko")
        - **Standard: "JFC"** (Commonly misidentified as: "JFC Deutschland", "JFC Group")

        ### Allowed Categories
        - **asiatico**: Includes the exact keywords "Asiatco" or "King Fish", then directly classify as "asiatico".
        - **Fuji**: Includes the exact keyword "Fuiigawa", then directly classify as "Fuji".
        - **JFC**: If it includes the exact keyword "JFC", then directly classify as "JFC".
        - **Ramenlppin Europa**: If it includes the exact keyword "Ramen lppin Europa", then directly classify as "Ramenlppin Europa". Notice: it must has the keyword "Europa", if it's just "Ramen Ippin Dortmund" then it is not this category.
        - **Lebensmittel&Bedarf**: Main products are food items like meat, vegetables, etc.
        - **Miete**
        - **Strom&Gas&Internet**
        - **Bar Ausgabe**
        - **Personalkosten**
        - **Gerät&Geschirr**
        - **Reparatur**
        - **Getränke**
        - **Bank&SumUp&Linzen**
        - **Service&Andere**: "Service" correspinds to general stuff for daily business running, e.g. products like pens, or services like cleaning. "Andere" corresponds to unsual or trivial stuff that cannot be precisely determined.
        - **Unternehmen**: Company registration, tax consulting, legal services, etc.

        ### Rules
        - **OCR Correction**: Prioritize the "Known Entities" list. If an extracted name looks like a misspelling of a known entity, use the **Standard** version.
        - The special purposes, asiatico, Fuji, JFC, Ramenlppin Europa, are specific vendor names relating to food-chain, having the highest priority. If any of these keywords are found, classify accordingly without further analysis.
        - **Hard Constraint**: If any evidence contains "JFC", output purpose as exactly "JFC".
        - **Hard Constraint**: "Ramenlppin Europa" requires BOTH Ramen/Raman Ippin keyword AND "Europa" in vendor-side evidence.
        - **Hard Constraint**: Never assign vendor special categories only from receiver text.
        - Other normal purposes, if it is also about food, but does not contain the above keywords, classify as "Lebensmittel&Bedarf".
        - If the purpose is ambiguous, use common sense based on the merchant name.
        - If impossible to determine the purpose, use "Service&Andere".
        - Output MUST be a valid JSON object.

        ### Output Format
        {
        "purpose": "<ONE_OF_ALLOWED_PURPOSES>",
        "sender": "<EXTRACTED_SENDER_NAME>",
        "receiver": "<EXTRACTED_RECEIVER_NAME>",
        "receiver_address": "<EXTRACTED_RECEIVER_ADDRESS>"
        }
    """

    aoai_timeout_sec = float(os.getenv("AOAI_TIMEOUT_SEC", "60"))
    response = client.chat.completions.create(
        model="gpt-4o-mini", # 这里填你的 Deployment Name
        messages=[
            {"role": "user", "content": prompt},
            {"role": "user", "content": f"Do classify: {json.dumps(distilled_data)}"}
        ],
        response_format={"type": "json_object"},
        temperature=0.0,
        timeout=aoai_timeout_sec,
    )
    content = response.choices[0].message.content or "{}"

    try:
        parsed = json.loads(content)
        if not isinstance(parsed, dict):
            return {}
        original_purpose = parsed.get("purpose")
        final_purpose, debug_info = normalize_office_purpose(
            llm_purpose=original_purpose if isinstance(original_purpose, str) else None,
            sender=parsed.get("sender") if isinstance(parsed.get("sender"), str) else None,
            receiver=parsed.get("receiver") if isinstance(parsed.get("receiver"), str) else None,
            distilled_data=distilled_data,
        )
        parsed["purpose"] = final_purpose
        print(
            "[OfficePurpose] "
            f"llm_purpose={original_purpose!r} final_purpose={final_purpose!r} "
            f"guardrail_hit={debug_info.get('guardrail_hit')} reason={debug_info.get('reason')} "
            f"jfc_hit={debug_info.get('jfc_hit')} ramen_hit={debug_info.get('ramen_hit')} "
            f"europa_hit={debug_info.get('europa_hit')}"
        )
        return parsed
    except json.JSONDecodeError:
        return {}

def test_extract_office_invoice_azure():
    with open('minimized_invoice.json', 'r', encoding='utf-8') as f:
        distilled_data = json.load(f)
    category = extract_office_invoice_azure(distilled_data)
    print(f"office category: {category}")

if __name__ == "__main__":  

    # test_clean_invoice_json()
    test_extract_office_invoice_azure()
    # classify_invoice_azure()
    # test_analyze_invoice_with_azure()
