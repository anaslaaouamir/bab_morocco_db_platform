"""
ReportLab PDF generator for Bab Morocco partnership contracts.
Always produces a real, valid PDF — in both dev and production mode.
Dev: clauses come from MockContractGenerator (hardcoded French text).
Prod: clauses come from ClaudeContractGenerator (AI-generated, multilingual).
"""

import io
from datetime import date

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    HRFlowable,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

# Bab Morocco brand orange
BAB_ORANGE = colors.HexColor("#B5451B")
BAB_DARK = colors.HexColor("#1C1C1E")
BAB_LIGHT_GREY = colors.HexColor("#F5F5F5")
BAB_MID_GREY = colors.HexColor("#8E8E93")

# ─── Section headers per language ────────────────────────────────────────────

_SECTION_HEADERS: dict[str, dict[str, str]] = {
    "fr": {
        "title": "CONTRAT DE PARTENARIAT",
        "subtitle": "Bab Morocco — BD Intelligence Platform",
        "date_label": "Date de signature :",
        "parties": "1. PARTIES CONTRACTANTES",
        "objet": "2. OBJET DU PARTENARIAT",
        "commission_clause": "3. COMMISSION ET MODALITÉS DE PAIEMENT",
        "obligations_bab": "4. OBLIGATIONS DE BAB MOROCCO",
        "obligations_partner": "5. OBLIGATIONS DU PARTENAIRE",
        "duree_clause": "6. DURÉE ET RÉSILIATION",
        "confidentialite": "7. CONFIDENTIALITÉ ET PROPRIÉTÉ INTELLECTUELLE",
        "rgpd_clause": "8. PROTECTION DES DONNÉES PERSONNELLES",
        "juridiction": "9. DROIT APPLICABLE ET JURIDICTION",
        "post_signature_note": "ACTIVATION POST-SIGNATURE",
        "signatures": "SIGNATURES",
        "sig_bab": "Pour Bab Morocco",
        "sig_partner": "Le Partenaire",
        "sig_name": "Nom et qualité :",
        "sig_date": "Date :",
        "sig_line": "_________________________________",
    },
    "en": {
        "title": "PARTNERSHIP AGREEMENT",
        "subtitle": "Bab Morocco — BD Intelligence Platform",
        "date_label": "Signature date:",
        "parties": "1. CONTRACTING PARTIES",
        "objet": "2. SUBJECT OF THE PARTNERSHIP",
        "commission_clause": "3. COMMISSION AND PAYMENT TERMS",
        "obligations_bab": "4. BAB MOROCCO OBLIGATIONS",
        "obligations_partner": "5. PARTNER OBLIGATIONS",
        "duree_clause": "6. DURATION AND TERMINATION",
        "confidentialite": "7. CONFIDENTIALITY AND INTELLECTUAL PROPERTY",
        "rgpd_clause": "8. PERSONAL DATA PROTECTION",
        "juridiction": "9. GOVERNING LAW AND JURISDICTION",
        "post_signature_note": "POST-SIGNATURE ACTIVATION",
        "signatures": "SIGNATURES",
        "sig_bab": "For Bab Morocco",
        "sig_partner": "The Partner",
        "sig_name": "Name and title:",
        "sig_date": "Date:",
        "sig_line": "_________________________________",
    },
    "es": {
        "title": "CONTRATO DE COLABORACIÓN",
        "subtitle": "Bab Morocco — BD Intelligence Platform",
        "date_label": "Fecha de firma:",
        "parties": "1. PARTES CONTRATANTES",
        "objet": "2. OBJETO DE LA COLABORACIÓN",
        "commission_clause": "3. COMISIÓN Y CONDICIONES DE PAGO",
        "obligations_bab": "4. OBLIGACIONES DE BAB MOROCCO",
        "obligations_partner": "5. OBLIGACIONES DEL SOCIO",
        "duree_clause": "6. DURACIÓN Y RESOLUCIÓN",
        "confidentialite": "7. CONFIDENCIALIDAD Y PROPIEDAD INTELECTUAL",
        "rgpd_clause": "8. PROTECCIÓN DE DATOS PERSONALES",
        "juridiction": "9. LEY APLICABLE Y JURISDICCIÓN",
        "post_signature_note": "ACTIVACIÓN POST-FIRMA",
        "signatures": "FIRMAS",
        "sig_bab": "Por Bab Morocco",
        "sig_partner": "El Socio",
        "sig_name": "Nombre y cargo:",
        "sig_date": "Fecha:",
        "sig_line": "_________________________________",
    },
    "de": {
        "title": "PARTNERSCHAFTSVERTRAG",
        "subtitle": "Bab Morocco — BD Intelligence Platform",
        "date_label": "Unterzeichnungsdatum:",
        "parties": "1. VERTRAGSPARTEIEN",
        "objet": "2. VERTRAGSGEGENSTAND",
        "commission_clause": "3. PROVISION UND ZAHLUNGSBEDINGUNGEN",
        "obligations_bab": "4. PFLICHTEN VON BAB MOROCCO",
        "obligations_partner": "5. PFLICHTEN DES PARTNERS",
        "duree_clause": "6. LAUFZEIT UND KÜNDIGUNG",
        "confidentialite": "7. VERTRAULICHKEIT UND GEISTIGES EIGENTUM",
        "rgpd_clause": "8. DATENSCHUTZ",
        "juridiction": "9. ANWENDBARES RECHT UND GERICHTSSTAND",
        "post_signature_note": "AUTOMATISCHE AKTIVIERUNG NACH UNTERZEICHNUNG",
        "signatures": "UNTERSCHRIFTEN",
        "sig_bab": "Für Bab Morocco",
        "sig_partner": "Der Partner",
        "sig_name": "Name und Funktion:",
        "sig_date": "Datum:",
        "sig_line": "_________________________________",
    },
    "ar": {
        "title": "عقد الشراكة",
        "subtitle": "Bab Morocco — BD Intelligence Platform",
        "date_label": "تاريخ التوقيع:",
        "parties": "١. الأطراف المتعاقدة",
        "objet": "٢. موضوع الشراكة",
        "commission_clause": "٣. العمولة وشروط الدفع",
        "obligations_bab": "٤. التزامات Bab Morocco",
        "obligations_partner": "٥. التزامات الشريك",
        "duree_clause": "٦. المدة والفسخ",
        "confidentialite": "٧. السرية والملكية الفكرية",
        "rgpd_clause": "٨. حماية البيانات الشخصية",
        "juridiction": "٩. القانون المطبق والاختصاص القضائي",
        "post_signature_note": "التفعيل التلقائي بعد التوقيع",
        "signatures": "التوقيعات",
        "sig_bab": "عن Bab Morocco",
        "sig_partner": "الشريك",
        "sig_name": "الاسم والصفة:",
        "sig_date": "التاريخ:",
        "sig_line": "_________________________________",
    },
}

_CLAUSE_ORDER = [
    "parties", "objet", "commission_clause", "obligations_bab",
    "obligations_partner", "duree_clause", "confidentialite",
    "rgpd_clause", "juridiction", "post_signature_note",
]


def _get_headers(language: str) -> dict[str, str]:
    return _SECTION_HEADERS.get(language, _SECTION_HEADERS["fr"])


def _build_styles(headers: dict[str, str]) -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "ContractTitle",
            parent=base["Title"],
            fontSize=20,
            textColor=BAB_DARK,
            alignment=TA_CENTER,
            spaceAfter=4,
            fontName="Helvetica-Bold",
        ),
        "subtitle": ParagraphStyle(
            "ContractSubtitle",
            parent=base["Normal"],
            fontSize=10,
            textColor=BAB_MID_GREY,
            alignment=TA_CENTER,
            spaceAfter=6,
        ),
        "date": ParagraphStyle(
            "ContractDate",
            parent=base["Normal"],
            fontSize=9,
            textColor=BAB_MID_GREY,
            alignment=TA_CENTER,
            spaceAfter=2,
        ),
        "section_header": ParagraphStyle(
            "SectionHeader",
            parent=base["Normal"],
            fontSize=10,
            textColor=BAB_ORANGE,
            fontName="Helvetica-Bold",
            spaceBefore=16,
            spaceAfter=6,
        ),
        "body": ParagraphStyle(
            "ContractBody",
            parent=base["Normal"],
            fontSize=9,
            textColor=BAB_DARK,
            alignment=TA_JUSTIFY,
            leading=15,
            spaceAfter=4,
        ),
        "signature_header": ParagraphStyle(
            "SigHeader",
            parent=base["Normal"],
            fontSize=10,
            textColor=BAB_ORANGE,
            fontName="Helvetica-Bold",
            spaceBefore=20,
            spaceAfter=12,
            alignment=TA_CENTER,
        ),
        "sig_label": ParagraphStyle(
            "SigLabel",
            parent=base["Normal"],
            fontSize=9,
            textColor=BAB_DARK,
            fontName="Helvetica-Bold",
            alignment=TA_CENTER,
            spaceAfter=20,
        ),
        "sig_line": ParagraphStyle(
            "SigLine",
            parent=base["Normal"],
            fontSize=9,
            textColor=BAB_MID_GREY,
            alignment=TA_CENTER,
            spaceAfter=4,
        ),
        "sig_note": ParagraphStyle(
            "SigNote",
            parent=base["Normal"],
            fontSize=8,
            textColor=BAB_MID_GREY,
            alignment=TA_CENTER,
        ),
    }


def _page_header_footer(canvas, doc):
    """Draw header and footer on every page."""
    canvas.saveState()
    w, h = A4

    # Orange top bar
    canvas.setFillColor(BAB_ORANGE)
    canvas.rect(0, h - 1.2 * cm, w, 0.5 * cm, fill=True, stroke=False)

    # Company name in header
    canvas.setFillColor(colors.white)
    canvas.setFont("Helvetica-Bold", 9)
    canvas.drawString(2 * cm, h - 0.95 * cm, "BAB MOROCCO")

    canvas.setFillColor(BAB_MID_GREY)
    canvas.setFont("Helvetica", 8)
    canvas.drawRightString(w - 2 * cm, h - 0.95 * cm, "BD Intelligence Platform — Confidentiel")

    # Footer line
    canvas.setStrokeColor(BAB_LIGHT_GREY)
    canvas.line(2 * cm, 1.5 * cm, w - 2 * cm, 1.5 * cm)

    # Page number
    canvas.setFillColor(BAB_MID_GREY)
    canvas.setFont("Helvetica", 8)
    canvas.drawCentredString(w / 2, 1.0 * cm, f"Page {doc.page}")

    canvas.restoreState()


def generate_contract_pdf(
    partner_name: str,
    partner_type: str,
    country: str,
    language: str,
    commission: float,
    clauses: dict,
) -> bytes:
    """
    Generate a professional Bab Morocco partnership contract PDF.

    Args:
        partner_name: Partner company name.
        partner_type: Internal type slug (e.g. 'hotel_riad').
        country: Partner country.
        language: Two-letter language code (fr/en/es/de/ar).
        commission: Agreed commission rate as float.
        clauses: Dict with all 9 clause keys (from contract_generator).

    Returns:
        PDF as bytes.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=2.5 * cm,
        rightMargin=2.5 * cm,
        topMargin=2.5 * cm,
        bottomMargin=2.5 * cm,
        title=f"Contrat de Partenariat — {partner_name}",
        author="Bab Morocco BD Intelligence Platform",
        subject="Partnership Contract",
    )

    lang = language if language in _SECTION_HEADERS else "fr"
    headers = _get_headers(lang)
    styles = _build_styles(headers)
    story = []

    # ── Cover header ──────────────────────────────────────────────────────────
    story.append(Spacer(1, 0.8 * cm))
    story.append(Paragraph(headers["title"], styles["title"]))
    story.append(Paragraph(headers["subtitle"], styles["subtitle"]))
    story.append(Paragraph(
        f"{headers['date_label']} {date.today().strftime('%d/%m/%Y')}",
        styles["date"],
    ))
    story.append(Spacer(1, 0.3 * cm))
    story.append(HRFlowable(width="100%", thickness=2, color=BAB_ORANGE, spaceAfter=16))

    # Partner info summary table
    info_data = [
        ["Partenaire / Partner", partner_name],
        ["Pays / Country", country],
        ["Commission", f"{commission}%"],
    ]
    info_table = Table(info_data, colWidths=[5 * cm, 11 * cm])
    info_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), BAB_LIGHT_GREY),
        ("TEXTCOLOR", (0, 0), (0, -1), BAB_DARK),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROWBACKGROUND", (0, 0), (-1, -1), [colors.white, BAB_LIGHT_GREY]),
        ("GRID", (0, 0), (-1, -1), 0.5, BAB_LIGHT_GREY),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(info_table)
    story.append(Spacer(1, 0.5 * cm))

    # ── Contract clauses ──────────────────────────────────────────────────────
    for key in _CLAUSE_ORDER:
        text = clauses.get(key, "")
        if not text:
            continue

        section_label = headers.get(key, key.upper())
        story.append(Paragraph(section_label, styles["section_header"]))
        story.append(HRFlowable(
            width="100%", thickness=0.5, color=BAB_LIGHT_GREY, spaceAfter=8,
        ))

        # Split on double newlines to preserve paragraph breaks
        paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
        for para in paragraphs:
            # Render bold markers (**text**) as ReportLab bold tags
            rendered = para.replace("**", "<b>", 1)
            while "**" in rendered:
                rendered = rendered.replace("**", "</b>", 1)
                if "**" in rendered:
                    rendered = rendered.replace("**", "<b>", 1)
            # Replace single newlines with <br/> for bulleted lists
            rendered = rendered.replace("\n", "<br/>")
            story.append(Paragraph(rendered, styles["body"]))
            story.append(Spacer(1, 3))

    # ── Signature block ───────────────────────────────────────────────────────
    story.append(PageBreak())
    story.append(Paragraph(headers["signatures"], styles["signature_header"]))
    story.append(HRFlowable(width="100%", thickness=1, color=BAB_ORANGE, spaceAfter=20))

    sig_data = [
        [
            Paragraph(headers["sig_bab"], styles["sig_label"]),
            Paragraph(headers["sig_partner"], styles["sig_label"]),
        ],
        [
            Paragraph(headers["sig_line"], styles["sig_line"]),
            Paragraph(headers["sig_line"], styles["sig_line"]),
        ],
        [
            Paragraph(f"{headers['sig_name']}", styles["sig_note"]),
            Paragraph(f"{headers['sig_name']}", styles["sig_note"]),
        ],
        [
            Paragraph(f"{headers['sig_date']}", styles["sig_note"]),
            Paragraph(f"{headers['sig_date']}", styles["sig_note"]),
        ],
    ]
    sig_table = Table(sig_data, colWidths=[8 * cm, 8 * cm])
    sig_table.setStyle(TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(sig_table)

    story.append(Spacer(1, 1 * cm))
    story.append(Paragraph(
        "Signé électroniquement via YouSign (certifié eIDAS) — babmorocco.com",
        styles["sig_note"],
    ))

    doc.build(story, onFirstPage=_page_header_footer, onLaterPages=_page_header_footer)
    return buffer.getvalue()
