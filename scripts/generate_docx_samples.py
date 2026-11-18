#!/usr/bin/env python3
import os
import docx
from docx.shared import Inches, Pt, RGBColor, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOGO_PATH = os.path.join(BASE_DIR, 'public', 'brand', 'logo.png')
SAMPLE_IMG_PATH = os.path.join(BASE_DIR, 'la cherry.jpg ')
DESKTOP_DIR = '/home/azizbek/Desktop'

COLOR_PRIMARY = RGBColor(131, 24, 67)     # #831843 (La Cherry malina / to'q pushti)
COLOR_TEXT = RGBColor(30, 27, 75)        # #1e1b4b (to'q matn)
COLOR_MUTED = RGBColor(100, 116, 139)    # #64748b (och matn)

def set_cell_background(cell, hex_color):
    """Katak fon rangini o'rnatish"""
    shading_elm = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{hex_color}"/>')
    cell._tc.get_or_add_tcPr().append(shading_elm)

def set_cell_margins(cell, top=80, bottom=80, left=120, right=120):
    """Katak chetki oraliqlari (padding)"""
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = OxmlElement('w:tcMar')
    for m, val in [('top', top), ('bottom', bottom), ('left', left), ('right', right)]:
        node = OxmlElement(f'w:{m}')
        node.set(qn('w:w'), str(val))
        node.set(qn('w:type'), 'dxa')
        tcMar.append(node)
    tcPr.append(tcMar)

def set_table_borders(table, color="CBD5E1", sz="4", val="single"):
    """Jadval chegaralarini (border) chiroyli ingichka chiziq qilish"""
    tblPr = table._tbl.tblPr
    borders = parse_xml(f'''
        <w:tblBorders {nsdecls("w")}>
            <w:top w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>
            <w:bottom w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>
            <w:left w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>
            <w:right w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>
            <w:insideH w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>
            <w:insideV w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>
        </w:tblBorders>
    ''')
    tblPr.append(borders)

def create_kp():
    """Qisqa, lo'nda, ortiqcha matnlarsiz, faqat sana, logo va aniq ustunli KP"""
    doc = docx.Document()
    sections = doc.sections
    for section in sections:
        section.top_margin = Cm(1.2)
        section.bottom_margin = Cm(1.2)
        section.left_margin = Cm(1.4)
        section.right_margin = Cm(1.4)

    # 1. Tepasi: Rangli Logo va qisqa kontaktlar
    top_table = doc.add_table(rows=1, cols=2)
    top_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    top_table.autofit = False

    c_left = top_table.rows[0].cells[0]
    c_left.width = Cm(10.0)
    lp = c_left.paragraphs[0]
    lp.paragraph_format.space_after = Pt(2)
    if os.path.exists(LOGO_PATH):
        lp.add_run().add_picture(LOGO_PATH, width=Cm(4.0))

    p_brand = c_left.add_paragraph()
    p_brand.paragraph_format.space_after = Pt(0)
    r = p_brand.add_run("LA CHERRY PARFUM & COSMETICS")
    r.bold = True
    r.font.size = Pt(11)
    r.font.color.rgb = COLOR_PRIMARY

    c_right = top_table.rows[0].cells[1]
    c_right.width = Cm(8.0)
    rp = c_right.paragraphs[0]
    rp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    rp.paragraph_format.space_after = Pt(0)
    r = rp.add_run("ALOQA:\n")
    r.bold = True
    r.font.size = Pt(9.5)
    r.font.color.rgb = COLOR_PRIMARY
    r_c = rp.add_run("• Oybek: +998 90 955 04 80\n• Isfandiyor: +998 90 925 85 56\nToshkent sh., Chilonzor")
    r_c.font.size = Pt(8.5)
    r_c.font.color.rgb = COLOR_TEXT

    # 2. Hujjat sarlavhasi (Faqat "KP № ..." va chiqarilgan sana)
    p_title = doc.add_paragraph()
    p_title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_title.paragraph_format.space_before = Pt(10)
    p_title.paragraph_format.space_after = Pt(2)
    t_run = p_title.add_run("KP № 58")
    t_run.bold = True
    t_run.font.size = Pt(16)
    t_run.font.color.rgb = COLOR_PRIMARY

    p_sub = doc.add_paragraph()
    p_sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_sub.paragraph_format.space_after = Pt(12)
    s_run = p_sub.add_run("Sana: 12-noyabr 2026-yil")
    s_run.bold = True
    s_run.font.size = Pt(10)
    s_run.font.color.rgb = COLOR_TEXT

    # 3. Tovarlar jadvali: №, RASM, NOMI, DONA, DONA NARXI, SUMMASI
    items = [
        {
            "name": "La Cherry Sweet Rose Atiri (100 ml)",
            "qty": "24",
            "price": "120 000",
            "total": "2 880 000",
        },
        {
            "name": "Lattafa Asad Erkaklar Atiri (100 ml)",
            "qty": "12",
            "price": "320 000",
            "total": "3 840 000",
        },
        {
            "name": "CeraVe Namlovchi Krem (50 ml)",
            "qty": "36",
            "price": "185 000",
            "total": "6 660 000",
        },
        {
            "name": "Nivea Tana Spreyi (150 ml)",
            "qty": "48",
            "price": "27 000",
            "total": "1 296 000",
        },
        {
            "name": "Premium Soch Uchun Taroq (XL)",
            "qty": "50",
            "price": "18 000",
            "total": "900 000",
        },
    ]

    table = doc.add_table(rows=1 + len(items) + 1, cols=6)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    set_table_borders(table, color="CBD5E1", sz="4", val="single")

    headers = ["№", "RASM", "NOMI", "DONA", "DONA NARXI", "SUMMASI"]
    widths = [Cm(1.0), Cm(2.4), Cm(7.2), Cm(1.8), Cm(2.8), Cm(3.0)]

    hdr_cells = table.rows[0].cells
    for i, title in enumerate(headers):
        hdr_cells[i].width = widths[i]
        set_cell_background(hdr_cells[i], "831843")
        set_cell_margins(hdr_cells[i], 100, 100, 60, 60)
        p = hdr_cells[i].paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = p.add_run(title)
        run.bold = True
        run.font.size = Pt(9)
        run.font.color.rgb = RGBColor(255, 255, 255)

    for idx, item in enumerate(items):
        row_cells = table.rows[idx + 1].cells
        for c, w in zip(row_cells, widths):
            c.width = w
            set_cell_margins(c, 80, 80, 60, 60)
            c.vertical_alignment = WD_ALIGN_VERTICAL.CENTER

        if idx % 2 == 1:
            for c in row_cells:
                set_cell_background(c, "F8FAFC")

        # №
        p0 = row_cells[0].paragraphs[0]
        p0.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p0.add_run(str(idx + 1)).font.size = Pt(9.5)

        # RASM (KATTA, ANIQ, RANG-BARANG)
        p1 = row_cells[1].paragraphs[0]
        p1.alignment = WD_ALIGN_PARAGRAPH.CENTER
        if os.path.exists(SAMPLE_IMG_PATH):
            p1.add_run().add_picture(SAMPLE_IMG_PATH, width=Cm(1.8), height=Cm(1.8))
        else:
            p1.add_run("📷").font.size = Pt(14)

        # NOMI
        p2 = row_cells[2].paragraphs[0]
        r2 = p2.add_run(item["name"])
        r2.bold = True
        r2.font.size = Pt(9.5)
        r2.font.color.rgb = COLOR_TEXT

        # DONA
        p3 = row_cells[3].paragraphs[0]
        p3.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r3 = p3.add_run(item["qty"])
        r3.bold = True
        r3.font.size = Pt(9.5)

        # DONA NARXI
        p4 = row_cells[4].paragraphs[0]
        p4.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        r4 = p4.add_run(item["price"] + " so'm")
        r4.font.size = Pt(9.5)

        # SUMMASI
        p5 = row_cells[5].paragraphs[0]
        p5.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        r5 = p5.add_run(item["total"] + " so'm")
        r5.bold = True
        r5.font.size = Pt(9.5)
        r5.font.color.rgb = COLOR_PRIMARY

    # Jami qatori
    tot_row = table.rows[len(items) + 1]
    for c in tot_row.cells:
        set_cell_background(c, "FDF2F8")
        set_cell_margins(c, 100, 100, 60, 60)
    
    p_tl = tot_row.cells[2].paragraphs[0]
    p_tl.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    r = p_tl.add_run("JAMI:")
    r.bold = True
    r.font.size = Pt(10)
    r.font.color.rgb = COLOR_PRIMARY

    p_tq = tot_row.cells[3].paragraphs[0]
    p_tq.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r_tq = p_tq.add_run("170 dona")
    r_tq.bold = True
    r_tq.font.size = Pt(9.5)

    p_tv = tot_row.cells[5].paragraphs[0]
    p_tv.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    r_tv = p_tv.add_run("15 576 000 so'm")
    r_tv.bold = True
    r_tv.font.size = Pt(10.5)
    r_tv.font.color.rgb = COLOR_PRIMARY

    # So'z bilan summa
    p_words = doc.add_paragraph()
    p_words.paragraph_format.space_before = Pt(8)
    p_words.paragraph_format.space_after = Pt(14)
    r_w = p_words.add_run("Jami summa: ")
    r_w.bold = True
    r_w.font.size = Pt(9.5)
    r_w2 = p_words.add_run("O'n besh million besh yuz yetmish olti ming so'm 00 tiyin.")
    r_w2.italic = True
    r_w2.font.size = Pt(9.5)

    # Imzo va Aloqa
    sign_table = doc.add_table(rows=1, cols=2)
    sign_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    s1, s2 = sign_table.rows[0].cells[0], sign_table.rows[0].cells[1]
    s1.width = Cm(9.5)
    s2.width = Cm(8.5)

    ps1 = s1.paragraphs[0]
    r = ps1.add_run("Tuzuvchi mas'ul:\n\n_____________________ / Oybek M.")
    r.font.size = Pt(9)
    r.font.color.rgb = COLOR_TEXT

    ps2 = s2.paragraphs[0]
    ps2.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    r2 = ps2.add_run("Tasdiqlayman (Rahbar):\n\n_____________________ / Alisher Q.\nM.O'.")
    r2.font.size = Pt(9)
    r2.font.color.rgb = COLOR_TEXT

    out_path = os.path.join(DESKTOP_DIR, 'Tijorat_taklifi_KP_namuna.docx')
    doc.save(out_path)
    print(f"KP saqlandi: {out_path}")


def create_nakladnoy():
    """Qisqa, lo'nda, aniq ustunli Nakladnoy"""
    doc = docx.Document()
    sections = doc.sections
    for section in sections:
        section.top_margin = Cm(1.2)
        section.bottom_margin = Cm(1.2)
        section.left_margin = Cm(1.4)
        section.right_margin = Cm(1.4)

    # 1. Header (Logo va Rekvizitlar)
    top_table = doc.add_table(rows=1, cols=2)
    top_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    top_table.autofit = False

    left_cell = top_table.rows[0].cells[0]
    left_cell.width = Cm(10.0)
    lp = left_cell.paragraphs[0]
    lp.paragraph_format.space_after = Pt(2)
    if os.path.exists(LOGO_PATH):
        lp.add_run().add_picture(LOGO_PATH, width=Cm(4.0))

    p_brand = left_cell.add_paragraph()
    p_brand.paragraph_format.space_after = Pt(0)
    r = p_brand.add_run("LA CHERRY PARFUM & COSMETICS")
    r.bold = True
    r.font.size = Pt(11)
    r.font.color.rgb = COLOR_PRIMARY

    p_addr = left_cell.add_paragraph()
    p_addr.paragraph_format.space_after = Pt(0)
    r = p_addr.add_run("Toshkent sh., Chilonzor tumani\nTel: +998 90 955 04 80 | +998 90 925 85 56")
    r.font.size = Pt(8.5)
    r.font.color.rgb = COLOR_MUTED

    right_cell = top_table.rows[0].cells[1]
    right_cell.width = Cm(8.0)
    rp = right_cell.paragraphs[0]
    rp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    rp.paragraph_format.space_after = Pt(0)
    r = rp.add_run("REKVIZITLAR:\n")
    r.bold = True
    r.font.size = Pt(9.5)
    r.font.color.rgb = COLOR_PRIMARY
    r2 = rp.add_run("INN: 309 882 145\nH/r: 2020 8000 1009 8765 4321\nBank: ATB «Kapitalbank» MFO: 01036")
    r2.font.size = Pt(8.5)
    r2.font.color.rgb = COLOR_TEXT

    # 2. Hujjat nomi va sana
    p_title = doc.add_paragraph()
    p_title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_title.paragraph_format.space_before = Pt(8)
    p_title.paragraph_format.space_after = Pt(2)
    t_run = p_title.add_run("YUK XATI (NAKLADNOY) № 1042")
    t_run.bold = True
    t_run.font.size = Pt(15)
    t_run.font.color.rgb = COLOR_PRIMARY

    p_sub = doc.add_paragraph()
    p_sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_sub.paragraph_format.space_after = Pt(8)
    s_run = p_sub.add_run("Sana: 12-noyabr 2026-yil   •   Filial: A filial")
    s_run.bold = True
    s_run.font.size = Pt(9.5)
    s_run.font.color.rgb = COLOR_TEXT

    # 3. Tomonlar bloki (Qisqa)
    party_table = doc.add_table(rows=1, cols=2)
    party_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    set_table_borders(party_table, color="CBD5E1", sz="4", val="single")

    c1 = party_table.rows[0].cells[0]
    c1.width = Cm(9.0)
    set_cell_background(c1, "F8FAFC")
    set_cell_margins(c1, 80, 80, 100, 100)
    p1 = c1.paragraphs[0]
    r = p1.add_run("Yetkazib beruvchi: ")
    r.bold = True
    r.font.size = Pt(9)
    r.font.color.rgb = COLOR_PRIMARY
    p1.add_run("LA CHERRY MChJ\nMas'ul: Oybek (+998 90 955 04 80)").font.size = Pt(8.5)

    c2 = party_table.rows[0].cells[1]
    c2.width = Cm(9.0)
    set_cell_background(c2, "F8FAFC")
    set_cell_margins(c2, 80, 80, 100, 100)
    p2 = c2.paragraphs[0]
    r = p2.add_run("Qabul qiluvchi: ")
    r.bold = True
    r.font.size = Pt(9)
    r.font.color.rgb = COLOR_PRIMARY
    p2.add_run("«Parfum Elite» savdo majmuasi\nMas'ul: Dilshod R. (+998 90 123 45 67)").font.size = Pt(8.5)

    doc.add_paragraph().paragraph_format.space_after = Pt(4)

    # 4. Asosiy Tovarlar Jadvali: №, RASM, NOMI, DONA, DONA NARXI, SUMMASI
    items = [
        {"name": "La Cherry Sweet Rose Atiri (100 ml)", "qty": "24", "price": "120 000", "total": "2 880 000"},
        {"name": "Lattafa Asad Erkaklar Atiri (100 ml)", "qty": "12", "price": "320 000", "total": "3 840 000"},
        {"name": "CeraVe Namlovchi Krem (50 ml)", "qty": "36", "price": "185 000", "total": "6 660 000"},
        {"name": "Nivea Tana Spreyi (150 ml)", "qty": "48", "price": "27 000", "total": "1 296 000"},
    ]

    table = doc.add_table(rows=1 + len(items) + 2, cols=6)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    set_table_borders(table, color="CBD5E1", sz="4", val="single")

    headers = ["№", "RASM", "NOMI", "DONA", "DONA NARXI", "SUMMASI"]
    widths = [Cm(1.0), Cm(2.4), Cm(7.2), Cm(1.8), Cm(2.8), Cm(3.0)]

    hdr_cells = table.rows[0].cells
    for i, title in enumerate(headers):
        hdr_cells[i].width = widths[i]
        set_cell_background(hdr_cells[i], "831843")
        set_cell_margins(hdr_cells[i], 100, 100, 60, 60)
        p = hdr_cells[i].paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = p.add_run(title)
        run.bold = True
        run.font.size = Pt(9)
        run.font.color.rgb = RGBColor(255, 255, 255)

    for idx, item in enumerate(items):
        row_cells = table.rows[idx + 1].cells
        for c, w in zip(row_cells, widths):
            c.width = w
            set_cell_margins(c, 80, 80, 60, 60)
            c.vertical_alignment = WD_ALIGN_VERTICAL.CENTER

        if idx % 2 == 1:
            for c in row_cells:
                set_cell_background(c, "F8FAFC")

        # №
        p0 = row_cells[0].paragraphs[0]
        p0.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p0.add_run(str(idx + 1)).font.size = Pt(9.5)

        # RASM
        p1 = row_cells[1].paragraphs[0]
        p1.alignment = WD_ALIGN_PARAGRAPH.CENTER
        if os.path.exists(SAMPLE_IMG_PATH):
            p1.add_run().add_picture(SAMPLE_IMG_PATH, width=Cm(1.8), height=Cm(1.8))
        else:
            p1.add_run("📷").font.size = Pt(14)

        # NOMI
        p2 = row_cells[2].paragraphs[0]
        r2 = p2.add_run(item["name"])
        r2.bold = True
        r2.font.size = Pt(9.5)
        r2.font.color.rgb = COLOR_TEXT

        # DONA
        p3 = row_cells[3].paragraphs[0]
        p3.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r3 = p3.add_run(item["qty"])
        r3.bold = True
        r3.font.size = Pt(9.5)

        # DONA NARXI
        p4 = row_cells[4].paragraphs[0]
        p4.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        p4.add_run(item["price"] + " so'm").font.size = Pt(9.5)

        # SUMMASI
        p5 = row_cells[5].paragraphs[0]
        p5.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        r5 = p5.add_run(item["total"] + " so'm")
        r5.bold = True
        r5.font.size = Pt(9.5)
        r5.font.color.rgb = COLOR_PRIMARY

    # Jami
    r_sub = table.rows[len(items) + 1]
    for c in r_sub.cells: set_cell_margins(c, 80, 80, 60, 60)
    p_l = r_sub.cells[2].paragraphs[0]
    p_l.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    p_l.add_run("Jami miqdor:").bold = True
    p_q = r_sub.cells[3].paragraphs[0]
    p_q.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_q.add_run("120 dona").bold = True
    p_t = r_sub.cells[5].paragraphs[0]
    p_t.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    p_t.add_run("14 676 000 so'm").bold = True

    r_final = table.rows[len(items) + 2]
    for c in r_final.cells: 
        set_cell_background(c, "FDF2F8")
        set_cell_margins(c, 90, 90, 60, 60)
    p_fl = r_final.cells[2].paragraphs[0]
    p_fl.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    r_fl = p_fl.add_run("TO'LOV UCHUN JAMI:")
    r_fl.bold = True
    r_fl.font.size = Pt(10)
    r_fl.font.color.rgb = COLOR_PRIMARY
    p_ft = r_final.cells[5].paragraphs[0]
    p_ft.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    r_ft = p_ft.add_run("14 676 000 so'm")
    r_ft.bold = True
    r_ft.font.size = Pt(10.5)
    r_ft.font.color.rgb = COLOR_PRIMARY

    # 5. So'z bilan summa
    p_words = doc.add_paragraph()
    p_words.paragraph_format.space_before = Pt(6)
    p_words.paragraph_format.space_after = Pt(6)
    r = p_words.add_run("Jami to'lov summasi so'z bilan: ")
    r.bold = True
    r.font.size = Pt(9)
    r2 = p_words.add_run("O'n to'rt million olti yuz yetmish olti ming so'm 00 tiyin.")
    r2.italic = True
    r2.font.size = Pt(9)

    # Qoldiqlar
    bal_table = doc.add_table(rows=3, cols=2)
    bal_table.alignment = WD_TABLE_ALIGNMENT.RIGHT
    set_table_borders(bal_table, color="CBD5E1", sz="4", val="single")
    bal_rows = [
        ("Oldingi qoldiq:", "0 so'm"),
        ("Ushbu hujjat bo'yicha:", "14 676 000 so'm"),
        ("To'landi:", "10 000 000 so'm"),
    ]
    for idx, (label, val) in enumerate(bal_rows):
        row = bal_table.rows[idx]
        c0, c1 = row.cells[0], row.cells[1]
        c0.width = Cm(5.0)
        c1.width = Cm(3.5)
        set_cell_margins(c0, 40, 40, 60, 60)
        set_cell_margins(c1, 40, 40, 60, 60)
        p0 = c0.paragraphs[0]
        p0.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        p0.add_run(label).font.size = Pt(8.5)
        p1 = c1.paragraphs[0]
        p1.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        p1.add_run(val).font.size = Pt(8.5)

    # Imzolar
    doc.add_paragraph().paragraph_format.space_after = Pt(12)
    sign_table = doc.add_table(rows=1, cols=2)
    sign_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    s1, s2 = sign_table.rows[0].cells[0], sign_table.rows[0].cells[1]
    s1.width = Cm(9.0)
    s2.width = Cm(9.0)

    ps1 = s1.paragraphs[0]
    ps1.add_run("Topshirdi:\n\n_____________________ / Oybek M.").font.size = Pt(9)

    ps2 = s2.paragraphs[0]
    ps2.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    ps2.add_run("Qabul qildi:\n\n_____________________ / Dilshod R.").font.size = Pt(9)

    out_path = os.path.join(DESKTOP_DIR, 'Nakladnoy_namuna.docx')
    doc.save(out_path)
    print(f"Nakladnoy saqlandi: {out_path}")

if __name__ == '__main__':
    create_kp()
    create_nakladnoy()
