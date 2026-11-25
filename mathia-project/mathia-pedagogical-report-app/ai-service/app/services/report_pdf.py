"""PDF layout. All text is escaped; only server-built links become markup."""

from io import BytesIO
from pathlib import Path
from xml.sax.saxutils import escape, quoteattr

import reportlab
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

from app.schemas.report_presentation import StudentReportPresentation
from app.services.report_presentation import safe_resource_url

# Bundled, licensed TrueType fonts support English, Spanish, and Italian text.
# Register once at import, before concurrent rendering starts.
FONT_DIRECTORY = Path(reportlab.__file__).parent / "fonts"
pdfmetrics.registerFont(TTFont("Mathia", str(FONT_DIRECTORY / "Vera.ttf")))
pdfmetrics.registerFont(TTFont("MathiaBold", str(FONT_DIRECTORY / "VeraBd.ttf")))


def render_student_report_pdf(report: StudentReportPresentation) -> bytes:
    output = BytesIO()
    ink = colors.HexColor("#18313d")
    accent = colors.HexColor("#087e82")
    body = ParagraphStyle(
        "Body",
        fontName="Mathia",
        fontSize=10,
        leading=15,
        textColor=ink,
        spaceAfter=8,
        splitLongWords=True,
        alignment=TA_LEFT,
        allowWidows=0,
        allowOrphans=0,
    )
    title = ParagraphStyle(
        "Title",
        parent=body,
        fontName="MathiaBold",
        fontSize=22,
        leading=28,
        spaceAfter=16,
    )
    heading = ParagraphStyle(
        "Heading",
        parent=body,
        fontName="MathiaBold",
        fontSize=13,
        leading=18,
        textColor=accent,
        spaceBefore=13,
        spaceAfter=8,
        keepWithNext=True,
    )
    label = ParagraphStyle("Label", parent=body, fontName="MathiaBold", keepWithNext=True)
    small = ParagraphStyle("Small", parent=body, fontSize=8, leading=12)
    status_style = ParagraphStyle(
        "Status",
        parent=small,
        fontName="MathiaBold",
        textColor=accent,
        spaceAfter=15,
    )

    def paragraph(text: str, style: ParagraphStyle = body) -> Paragraph:
        return Paragraph(escape(text).replace("\n", "<br/>"), style)

    story = [paragraph(report.status_label, status_style), paragraph(report.title, title)]
    for detail in report.details:
        story.append(paragraph(f"{detail.label}: {detail.value}", small))
    story.append(Spacer(1, 4 * mm))
    for section in report.sections:
        story.append(paragraph(section.title, heading))
        for block in section.blocks:
            if block.label:
                story.append(paragraph(block.label, label))
            lines = block.text.split("\n")
            for line in lines[:-1]:
                story.append(paragraph(line) if line else Spacer(1, 3 * mm))
            markup = escape(lines[-1])
            for link in block.links:
                if safe_resource_url(link.url):
                    # Show the URL in both formats, with wrapping and a clickable annotation.
                    link_markup = (
                        f"{escape(link.title)}: <link href={quoteattr(link.url)} "
                        f'color="#087e82">{escape(link.url)}</link>'
                    )
                else:
                    link_markup = escape(link.title)
                markup += f'<br/><font size="8">{link_markup}</font>'
            # Keep links in the same splittable paragraph to avoid a lone resource
            # label at the top of the next page.
            story.append(Paragraph(markup, body))

    def decorate(canvas, doc):
        canvas.saveState()
        canvas.setFont("MathiaBold", 10)
        canvas.setFillColor(accent)
        canvas.drawString(22 * mm, A4[1] - 17 * mm, "MATHIA")
        canvas.setStrokeColor(colors.HexColor("#d5e3e6"))
        canvas.line(22 * mm, A4[1] - 21 * mm, A4[0] - 22 * mm, A4[1] - 21 * mm)
        canvas.setFont("Mathia", 7)
        canvas.setFillColor(ink)
        canvas.drawString(22 * mm, 14 * mm, report.status_label)
        canvas.drawRightString(A4[0] - 22 * mm, 14 * mm, f"{report.page_label} {doc.page}")
        canvas.restoreState()

    doc = SimpleDocTemplate(
        output,
        pagesize=A4,
        rightMargin=22 * mm,
        leftMargin=22 * mm,
        topMargin=29 * mm,
        bottomMargin=25 * mm,
        title=report.title,
        author="Mathia",
        invariant=1,
        pageCompression=1,
    )
    doc.build(story, onFirstPage=decorate, onLaterPages=decorate)
    return output.getvalue()
