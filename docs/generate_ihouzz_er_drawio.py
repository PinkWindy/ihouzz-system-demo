# -*- coding: utf-8 -*-
"""Generate draw.io ERD for ihouzz-demo (db.json + mediaLibraryApi.js)."""
from __future__ import annotations

import html
from pathlib import Path

OUT = Path(__file__).resolve().parent / "iHouzz_Demo_ERD_ITBA.drawio"


def esc_attr(s: str) -> str:
    """Escape for mxCell value= XML attribute (draw.io expects HTML entities)."""
    return html.escape(s, quote=True)


def cell_entity(cid: str, x: float, y: float, w: float, h: float, title: str, rows: list[str], fill: str, stroke: str) -> str:
    body = "&#xa;".join(rows)
    raw = f"<b>{title}</b><hr/><font face='Consolas' size='1' color='#333333'>{body}</font>"
    val = esc_attr(raw)
    return f"""        <mxCell id="{cid}" value="{val}" style="rounded=0;whiteSpace=wrap;html=1;align=left;verticalAlign=top;spacingLeft=8;spacingTop=6;fillColor={fill};strokeColor={stroke};fontSize=11;" vertex="1" parent="1">
          <mxGeometry x="{x}" y="{y}" width="{w}" height="{h}" as="geometry" />
        </mxCell>"""


def cell_note(cid: str, x: float, y: float, w: float, h: float, text: str) -> str:
    raw = text.replace("\n", "&#xa;")
    val = esc_attr(raw)
    return f"""        <mxCell id="{cid}" value="{val}" style="shape=note;whiteSpace=wrap;html=1;size=16;fillColor=#fffacd;strokeColor=#d6b656;fontSize=10;align=left;spacingLeft=6;" vertex="1" parent="1">
          <mxGeometry x="{x}" y="{y}" width="{w}" height="{h}" as="geometry" />
        </mxCell>"""


def cell_title(cid: str, x: float, y: float, w: float, h: float, raw_html: str) -> str:
    return f"""        <mxCell id="{cid}" value="{esc_attr(raw_html)}" style="text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;fontSize=15;fontStyle=1" vertex="1" parent="1">
          <mxGeometry x="{x}" y="{y}" width="{w}" height="{h}" as="geometry" />
        </mxCell>"""


def edge_fk(
    eid: str,
    src: str,
    tgt: str,
    label: str,
    *,
    dashed: int = 0,
    exit_x=1.0,
    exit_y=0.5,
    entry_x=0.0,
    entry_y=0.5,
) -> str:
    dash = f"dashed={dashed};dashPattern=5 5;" if dashed else ""
    lab = ""
    if label:
        lab = f"""        <mxCell id="{eid}_l" value="{esc_attr(label)}" style="edgeLabel;html=1;align=center;fontSize=9;" vertex="1" connectable="0" parent="{eid}">
          <mxGeometry x="-0.2" relative="1" as="geometry"><mxPoint as="offset" /></mxGeometry>
        </mxCell>
"""
    return f"""        <mxCell id="{eid}" style="endArrow=ERone;startArrow=ERmany;html=1;strokeWidth=1;exitX={exit_x};exitY={exit_y};entryX={entry_x};entryY={entry_y};{dash}" edge="1" parent="1" source="{src}" target="{tgt}">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
{lab}"""


def diagram_page(page_id: str, name: str, inner_xml: str, page_w: int, page_h: int) -> str:
    safe_name = esc_attr(name)
    return f"""  <diagram id="{page_id}" name="{safe_name}">
    <mxGraphModel dx="1600" dy="1000" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="{page_w}" pageHeight="{page_h}" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
{inner_xml}
      </root>
    </mxGraphModel>
  </diagram>"""


def main() -> None:
    pos = cell_entity(
        "t_pos",
        60,
        140,
        220,
        130,
        "pos (Chi nhánh)",
        [
            "<b>id</b> PK — string (json-server)",
            "name",
            "manager",
            "status (active | inactive)",
        ],
        "#fff2cc",
        "#d6b656",
    )
    users = cell_entity(
        "t_users",
        360,
        120,
        280,
        240,
        "users (IAM / nhân sự)",
        [
            "<b>user_id</b> PK — INT (1, 2, 3…)",
            "name, email, phone?",
            "role (sales | pos_manager | marketing | admin)",
            "status",
            "<b>pos_id</b> FK → pos.id (nullable: MKT/Admin)",
            "pos_name <i>(denormalized)</i>",
        ],
        "#d5e8d4",
        "#82b366",
    )
    props = cell_entity(
        "t_prop",
        60,
        400,
        380,
        580,
        "properties (Tài sản — Kho / Level 1)",
        [
            "<b>id</b> PK — LS-#####",
            "<b>createdBy_id</b> FK → users.user_id (INT)",
            "<b>pos_id</b> FK → pos.id (number | string trong demo)",
            "— Địa chỉ & mã —",
            "address, district, ward, futureWard?, propertyCode?",
            "— Đặc tả BĐS —",
            "type, propertyType?, price, priceUnit, price_display",
            "area, width, length, bedrooms, bathrooms, floor",
            "direction, road_width, legal | legalStatus?, condition",
            "source, furniture, description?, images[]",
            "— Trạng thái 2 tầng (song song statusLv*) —",
            "level1_status, statusLv1, warehouse_type",
            "level2_status, statusLv2",
            "rejection_reason / rejected_reason, rejected_at",
            "approvedAt | approved_at, approvedBy, pos_manager",
            "— Gỡ nguồn (F8) —",
            "unsource_note, unsourceRequestedAt / By",
            "unsourceApprovedAt / By",
            "— Cập nhật chờ duyệt (F2 / F3) —",
            "pending_update_payload?, update_request_*",
            "update_rejected_*",
            "createdAt, updatedAt",
        ],
        "#dae8fc",
        "#6c8ebf",
    )
    lists = cell_entity(
        "t_list",
        500,
        420,
        340,
        420,
        "listings (Tin đăng — Level 2)",
        [
            "<b>id</b> PK — LT-#####",
            "<b>property_id</b> FK → properties.id",
            "<b>createdBy_id</b> FK → users.user_id (INT)",
            "title, description, contact_phone",
            "images[], videos[]",
            "listing_status",
            "approvedBy, approvedBy_id, approvedAt",
            "rejectedBy, rejectedBy_id, rejectedAt, rejection_note",
            "prev_rejection_note?",
            "unlist_reason, unlist_note, unlistRequestedAt",
            "approvedUnlistBy?, approvedUnlistAt?",
            "createdAt, updatedAt, expiredAt",
            "<i>FE có thể gửi kèm mediaLibraryIds[]</i>",
        ],
        "#e1d5e7",
        "#9673a6",
    )
    media = cell_entity(
        "t_media",
        900,
        440,
        300,
        340,
        "mediaLibrary (File / URL theo tin)",
        [
            "<b>id</b> PK (json-server sinh)",
            "<b>listingId</b> FK → listings.id",
            "property_id FK → properties.id (optional)",
            "kind (image | video), source (upload | url)",
            "url, fileName, mimeType?, fileSize?",
            "createdAt, createdBy, createdBy_id",
            "<i>Schema theo mediaLibraryApi.js — persistMediaItems</i>",
        ],
        "#f8cecc",
        "#b85450",
    )
    logs = cell_entity(
        "t_logs",
        60,
        1020,
        400,
        280,
        "logs (Audit trail — bản ghi đa hình)",
        [
            "<b>id</b> PK",
            "timestamp",
            "action (text, prefix [F#])",
            "<b>entityId</b> <i>polymorphic</i> (LS-*, LT-*, u*, pos id, SYSTEM)",
            "user (tên hiển thị)",
            "reason?, changesPreview[], changes[]",
            "approvalKind?, approver?, changedAt?",
        ],
        "#fad9d5",
        "#ae4132",
    )
    notif = cell_entity(
        "t_notif",
        500,
        1020,
        300,
        200,
        "notifications (In-app)",
        [
            "<b>id</b> PK",
            "propertyId → properties.id",
            "recipient (tên, không FK cứng)",
            "message, type, createdAt, isRead",
        ],
        "#ffe6cc",
        "#d79b00",
    )
    sthist = cell_entity(
        "t_sh",
        840,
        1020,
        300,
        180,
        "status_history",
        [
            "<i>Mảng rỗng trong db.json hiện tại</i>",
            "Dự phòng SRS: property_id, from_status,",
            "to_status, actor_id, reason, created_at…",
        ],
        "#f5f5f5",
        "#666666",
    )
    note1 = cell_note(
        "n_poly",
        1240,
        130,
        300,
        130,
        "ITBA ghi chú:\nentityId trong logs là tham chiếu lỏng (text).\nProduction: audit_lines + FK hoặc JSONB chuẩn.",
    )
    note2 = cell_note(
        "n_posid",
        1240,
        290,
        300,
        100,
        "pos.id trong JSON là string \"1\".\nproperties.pos_id đôi khi là number — chuẩn hóa khi lên DB thật.",
    )
    title1 = cell_title(
        "title_p1",
        60,
        40,
        1100,
        60,
        "<b>iHouzz Demo — ERD Logical (json-server)</b><br/><font style='font-size:11px'>Nguồn: db.json + src/utils/mediaLibraryApi.js · Thực thể = resource REST</font>",
    )

    edges = (
        edge_fk("e_user_pos", "t_users", "t_pos", "pos_id", dashed=0, exit_x=0, exit_y=0.75, entry_x=1, entry_y=0.55)
        + edge_fk("e_prop_user", "t_prop", "t_users", "createdBy_id", dashed=1, exit_x=0.5, exit_y=0, entry_x=0.25, entry_y=1)
        + edge_fk("e_prop_pos", "t_prop", "t_pos", "pos_id", dashed=1, exit_x=0, exit_y=0.25, entry_x=0.5, entry_y=1)
        + edge_fk("e_list_prop", "t_list", "t_prop", "property_id", dashed=0, exit_x=0, exit_y=0.35, entry_x=1, entry_y=0.35)
        + edge_fk("e_list_user", "t_list", "t_users", "createdBy_id", dashed=1, exit_x=0.5, exit_y=0, entry_x=0.85, entry_y=1)
        + edge_fk("e_med_list", "t_media", "t_list", "listingId", dashed=0, exit_x=0, exit_y=0.4, entry_x=1, entry_y=0.55)
        + edge_fk("e_med_prop", "t_media", "t_prop", "property_id", dashed=1, exit_x=0, exit_y=0.75, entry_x=1, entry_y=0.75)
        + """        <mxCell id="e_not_prop" style="endArrow=open;html=1;dashed=1;dashPattern=4 4;strokeColor=#d79b00;exitX=0;exitY=0.35;entryX=0.85;entryY=1;" edge="1" parent="1" source="t_notif" target="t_prop">
          <mxGeometry relative="1" as="geometry"><Array as="points"><mxPoint x="440" y="1180" /><mxPoint x="320" y="1180" /></Array></mxGeometry>
        </mxCell>
        <mxCell id="e_not_prop_l" value="propertyId" style="edgeLabel;html=1;fontSize=9;fontColor=#d79b00;" vertex="1" connectable="0" parent="e_not_prop">
          <mxGeometry x="-0.1" relative="1" as="geometry"><mxPoint x="-20" y="8" as="offset" /></mxGeometry>
        </mxCell>
"""
    )

    page1_body = "\n".join(
        [title1, pos, users, props, lists, media, logs, notif, sthist, note1, note2, edges]
    )

    p2_title = cell_title(
        "title_p2",
        60,
        40,
        900,
        50,
        "<b>Trang 2 — Data dictionary & ghi chú chuẩn hóa</b><br/><font style='font-size:11px'>Dùng khi viết DDL / migration từ prototype</font>",
    )
    dd1_raw = (
        "<b>Từ điển dữ liệu — properties (59 keys gộp từ db.json)</b><hr/>"
        "<font face='Consolas' size='1'>"
        "<b>PK</b> id | <b>FK</b> createdBy_id→users, pos_id→pos<br/>"
        "<b>Địa chỉ</b> address, district, ward, futureWard, propertyCode<br/>"
        "<b>Giá &amp; diện tích</b> price, priceUnit, price_display, area, width, length<br/>"
        "<b>Công trình</b> type, propertyType, bedrooms, bathrooms, floor, direction, road_width<br/>"
        "<b>Pháp lý &amp; mô tả</b> legal | legalStatus, condition, source, furniture, description, images[]<br/>"
        "<b>L1 Kho</b> level1_status, statusLv1, warehouse_type, rejection_reason, rejected_reason, rejected_at<br/>"
        "<b>L2 Tin</b> level2_status, statusLv2<br/>"
        "<b>POS snapshot</b> pos_name, pos_manager, approvedBy, approvedAt | approved_at<br/>"
        "<b>Unsource</b> unsource_note, unsourceRequestedAt/By, unsourceApprovedAt/By<br/>"
        "<b>Update workflow</b> pending_update_payload, update_request_status, update_requested_at/by/_id<br/>"
        "update_request_note, update_rejected_at/by, update_rejection_reason<br/>"
        "<b>Audit</b> createdAt, updatedAt, createdBy (denorm)<br/>"
        "</font><hr/>"
        "<b>listings (26 keys)</b><br/><font face='Consolas' size='1'>"
        "PK id | FK property_id, createdBy_id<br/>"
        "title, description, contact_phone, images[], videos[]<br/>"
        "listing_status, approved*, rejected*, prev_rejection_note<br/>"
        "unlist_*, approvedUnlist*<br/>createdAt, updatedAt, expiredAt</font>"
    )
    dd1 = f"""        <mxCell id="t_dd" value="{esc_attr(dd1_raw)}" style="rounded=0;whiteSpace=wrap;html=1;align=left;verticalAlign=top;spacingLeft=10;spacingTop=8;fillColor=#ffffff;strokeColor=#0047AB;strokeWidth=2;fontSize=11;" vertex="1" parent="1">
          <mxGeometry x="60" y="110" width="540" height="540" as="geometry" />
        </mxCell>"""
    dd2_raw = (
        "<b>users (8) · pos (4) · notifications (7)</b><hr/><font face='Consolas' size='1'>"
        "<b>users:</b> id, name, email, phone?, role, status, pos_id, pos_name<br/>"
        "<b>pos:</b> id, name, manager, status<br/>"
        "<b>notifications:</b> id, propertyId, recipient, message, type, createdAt, isRead</font><hr/>"
        "<b>logs (tối đa 11 keys / bản ghi)</b><br/><font face='Consolas' size='1'>"
        "id, timestamp, action, entityId, user<br/>"
        "reason?, changesPreview[], changes[] {field, old?, new}<br/>"
        "approvalKind?, approver?, changedAt?</font><hr/>"
        "<b>mediaLibrary</b> (chưa có bản ghi mẫu trong db — schema từ code POST)<br/>"
        "listingId, property_id, kind, source, url, fileName, mimeType?, fileSize?, createdAt, createdBy, createdBy_id"
    )
    dd2 = f"""        <mxCell id="t_dd2" value="{esc_attr(dd2_raw)}" style="rounded=0;whiteSpace=wrap;html=1;align=left;verticalAlign=top;spacingLeft=10;spacingTop=8;fillColor=#f8fbff;strokeColor=#6c8ebf;fontSize=11;" vertex="1" parent="1">
          <mxGeometry x="630" y="110" width="520" height="420" as="geometry" />
        </mxCell>"""
    page2_body = "\n".join([p2_title, dd1, dd2])

    p3_title = cell_title(
        "title_p3",
        60,
        40,
        800,
        40,
        "<b>Trang 3 — Traceability Feature → Entity / Trường dữ liệu</b>",
    )
    br = cell_entity(
        "t_br",
        60,
        100,
        1100,
        520,
        "Ánh xạ Feature demo → thực thể (ITBA traceability)",
        [
            "<b>F2</b> Tạo / cập nhật tài sản → <b>properties</b> (+ pending_update_payload, update_*); logs F2/F3",
            "<b>F3</b> Duyệt kho POS → properties.warehouse_type, level1_status, approved*; notifications; logs",
            "<b>F4</b> Soạn tin → <b>listings</b> + POST <b>mediaLibrary</b> (mediaLibraryIds trên FE)",
            "<b>F5 / F7</b> Duyệt niêm yết / gỡ tin → listings.* ; đồng bộ properties.level2_status (BR-005 auto-sync)",
            "<b>F8</b> Gỡ nguồn → properties.unsource* ; cascade listings ; BR-010 chặn khi đang niêm yết",
            "<b>F9</b> Giám sát kho → đọc properties (masking theo pos_id, BR-013)",
            "<b>F10</b> IAM → <b>users</b>, <b>pos</b> ; ma trận quyền hiện lưu localStorage (ngoài ERD — cần bảng role_permission khi production)",
            "<b>F11</b> Export CSV → đọc <b>logs</b>",
            "<b>F12</b> Dashboard → aggregate properties + listings (read-only)",
        ],
        "#e8f4ff",
        "#0047AB",
    )
    page3_body = "\n".join([p3_title, br])

    mxfile = f"""<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net" modified="2026-05-13T00:00:00.000Z" agent="PinkWindy-ITBA-ERD" version="22.0.0" type="device">
{diagram_page("erd_main", "01 — ERD tổng thể (logical)", page1_body, 2000, 1400)}
{diagram_page("erd_dd", "02 — Data dictionary & chuẩn hóa", page2_body, 1300, 750)}
{diagram_page("erd_br", "03 — Traceability Feature → Entity", page3_body, 1300, 700)}
</mxfile>
"""
    OUT.write_text(mxfile, encoding="utf-8")
    print("Wrote", OUT)


if __name__ == "__main__":
    main()
