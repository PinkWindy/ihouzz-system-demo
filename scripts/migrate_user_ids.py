# -*- coding: utf-8 -*-
"""Migrate db.json: user id string (u001...) -> integer user_id per SRS."""
import json
import re
from pathlib import Path

DB = Path(__file__).resolve().parent.parent / "db.json"

USER_MAP = {
    "u001": 1,
    "u002": 2,
    "u003": 3,
    "u004": 4,
    "u_pos1": 5,
    "u_pos2": 6,
    "u_mkt1": 7,
    "u_marketing": 7,
    "u_admin": 8,
    "u_sales1": 4,
    "u_sales": 4,
    "u_hungnv": 1,
    "u_anhdv": 2,
    "u_tungtt": 3,
}

USER_ID_FIELDS = {
    "createdBy_id",
    "approvedBy_id",
    "rejectedBy_id",
    "resubmittedBy_id",
    "user_id",
    "actor_id",
    "manager_id",
}

ENTITY_USER_PATTERN = re.compile(r"^u[\w]+$", re.I)


def map_user_val(val):
    if val is None:
        return val
    if isinstance(val, int):
        return val
    if isinstance(val, float) and val.is_integer():
        return int(val)
    s = str(val).strip()
    if not s:
        return val
    if s in USER_MAP:
        return USER_MAP[s]
    if s.isdigit():
        return int(s)
    return val


def walk(obj):
    if isinstance(obj, dict):
        if "id" in obj and "role" in obj and "email" in obj:
            obj["id"] = map_user_val(obj["id"])
        for k, v in list(obj.items()):
            if k in USER_ID_FIELDS:
                obj[k] = map_user_val(v)
            elif k == "entityId" and isinstance(v, str) and ENTITY_USER_PATTERN.match(v):
                obj[k] = map_user_val(v)
            else:
                walk(v)
    elif isinstance(obj, list):
        for item in obj:
            walk(item)


def main():
    data = json.loads(DB.read_text(encoding="utf-8"))
    walk(data)
    DB.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print("Migrated", DB)
    print("Users:", [(u.get("id"), u.get("name")) for u in data.get("users", [])])


if __name__ == "__main__":
    main()
