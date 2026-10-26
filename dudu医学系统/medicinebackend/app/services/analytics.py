import csv
import io
import json
from datetime import date, timedelta

from app.errors import require
from app.services.catalog import list_drugs, list_patients
from app.services.clinic import registration_list
from app.services.common import paginate, rows, today


def report(conn, start_date: str, end_date: str):
    start, end = date.fromisoformat(start_date), date.fromisoformat(end_date)
    require(
        start <= end and (end - start).days <= 366,
        "请选择顺序正确且不超过一年的日期区间",
        422,
        "VALIDATION_ERROR",
    )
    visits = rows(
        conn,
        """SELECT s.date,COUNT(*) AS visits FROM registrations r
        JOIN schedules s ON r.schedule_id=s.id WHERE s.date BETWEEN ? AND ? AND r.status!='cancelled'
        GROUP BY s.date""",
        (start_date, end_date),
    )
    paid = rows(
        conn,
        """SELECT date(paid_at,'+8 hours') AS date,SUM(amount_cents) AS paid_cents,COUNT(*) AS charges
        FROM charges WHERE date(paid_at,'+8 hours') BETWEEN ? AND ? GROUP BY date(paid_at,'+8 hours')""",
        (start_date, end_date),
    )
    refunded = rows(
        conn,
        """SELECT date(refunded_at,'+8 hours') AS date,SUM(amount_cents) AS refund_cents
        FROM charges WHERE status='refunded' AND date(refunded_at,'+8 hours') BETWEEN ? AND ?
        GROUP BY date(refunded_at,'+8 hours')""",
        (start_date, end_date),
    )
    visits_map, paid_map, refund_map = ({r["date"]: r for r in source} for source in (visits, paid, refunded))
    daily = []
    for offset in range((end - start).days + 1):
        day = (start + timedelta(days=offset)).isoformat()
        income = paid_map.get(day, {}).get("paid_cents", 0)
        refund = refund_map.get(day, {}).get("refund_cents", 0)
        daily.append(
            {
                "date": day,
                "visits": visits_map.get(day, {}).get("visits", 0),
                "paid_cents": income,
                "refund_cents": refund,
                "revenue_cents": income - refund,
                "charges": paid_map.get(day, {}).get("charges", 0),
            }
        )
    department_stats = rows(
        conn,
        """SELECT dp.id,dp.name,dp.color,COUNT(r.id) AS visits
        FROM departments dp LEFT JOIN doctors d ON d.department_id=dp.id
        LEFT JOIN schedules s ON s.doctor_id=d.id AND s.date BETWEEN ? AND ?
        LEFT JOIN registrations r ON r.schedule_id=s.id AND r.status!='cancelled'
        GROUP BY dp.id ORDER BY visits DESC,dp.id""",
        (start_date, end_date),
    )
    for department in department_stats:
        department["revenue_cents"] = conn.execute(
            """SELECT COALESCE(SUM(
            CASE WHEN date(c.paid_at,'+8 hours') BETWEEN ? AND ? THEN c.amount_cents ELSE 0 END -
            CASE WHEN c.status='refunded' AND date(c.refunded_at,'+8 hours') BETWEEN ? AND ? THEN c.amount_cents ELSE 0 END
            ),0) FROM charges c JOIN prescriptions rx ON rx.id=c.prescription_id
            JOIN doctors d ON d.id=rx.doctor_id WHERE d.department_id=?""",
            (start_date, end_date, start_date, end_date, department["id"]),
        ).fetchone()[0]
    methods = rows(
        conn,
        """SELECT payment_method,COUNT(*) AS count,SUM(amount_cents) AS amount_cents
        FROM charges WHERE date(paid_at,'+8 hours') BETWEEN ? AND ? GROUP BY payment_method""",
        (start_date, end_date),
    )
    summary = {
        key: sum(item[key] for item in daily)
        for key in ("visits", "paid_cents", "refund_cents", "revenue_cents", "charges")
    }
    summary["average_cents"] = (
        round(summary["revenue_cents"] / summary["charges"]) if summary["charges"] else 0
    )
    return {
        "start_date": start_date,
        "end_date": end_date,
        "summary": summary,
        "daily": daily,
        "departments": department_stats,
        "payment_methods": methods,
    }


def dashboard(conn, actor):
    current = date.fromisoformat(today())
    start = (current - timedelta(days=6)).isoformat()
    data = report(conn, start, current.isoformat())
    doctor_filter = " AND s.doctor_id=?" if actor.role == "doctor" else ""
    doctor_params = (actor.doctor_id,) if actor.role == "doctor" else ()
    counts = rows(
        conn,
        """SELECT r.status,COUNT(*) AS count FROM registrations r JOIN schedules s ON s.id=r.schedule_id
        WHERE s.date=?"""
        + doctor_filter
        + " GROUP BY r.status",
        (today(), *doctor_params),
    )
    counts = {item["status"]: item["count"] for item in counts}
    rx_filter = " AND doctor_id=?" if actor.role == "doctor" else ""
    rx_counts = {
        r["status"]: r["count"]
        for r in rows(
            conn,
            "SELECT status,COUNT(*) AS count FROM prescriptions WHERE 1=1" + rx_filter + " GROUP BY status",
            doctor_params,
        )
    }
    lows = list_drugs(conn, low_stock=True, page_size=5)
    expiring = list_drugs(conn, expiring=True, page_size=5)
    financial = actor.role in ("admin", "cashier")
    trend = data["daily"]
    if actor.role == "doctor":
        own = {
            r["date"]: r["visits"]
            for r in rows(
                conn,
                """SELECT s.date,COUNT(*) AS visits
            FROM registrations r JOIN schedules s ON s.id=r.schedule_id
            WHERE s.doctor_id=? AND s.date BETWEEN ? AND ? AND r.status!='cancelled' GROUP BY s.date""",
                (actor.doctor_id, start, today()),
            )
        }
        trend = [{"date": item["date"], "visits": own.get(item["date"], 0)} for item in trend]
    else:
        trend = [{"date": item["date"], "visits": item["visits"]} for item in trend]
    department_data = data["departments"]
    if actor.role == "doctor":
        department_data = rows(
            conn,
            """SELECT dp.id,dp.name,dp.color,COUNT(r.id) AS visits
            FROM departments dp JOIN doctors d ON d.department_id=dp.id
            LEFT JOIN schedules s ON s.doctor_id=d.id AND s.date BETWEEN ? AND ?
            LEFT JOIN registrations r ON r.schedule_id=s.id AND r.status!='cancelled'
            WHERE d.id=? GROUP BY dp.id""",
            (start, today(), actor.doctor_id),
        )
    department_data = [{k: item[k] for k in ("id", "name", "color", "visits")} for item in department_data]
    waiting = (
        registration_list(conn, actor, date_filter=today(), status="waiting", page_size=5)["items"]
        if actor.role != "pharmacist"
        else []
    )
    alerts = []
    if actor.role in ("admin", "pharmacist"):
        for drug in lows["items"][:3]:
            alerts.append(
                {
                    "id": f"stock-{drug['id']}",
                    "type": "warning",
                    "title": f"{drug['generic_name']} 库存偏低",
                    "description": f"可用 {drug['available_stock']} {drug['unit']}，建议及时补货",
                    "path": "/inventory?filter=low",
                }
            )
        for drug in expiring["items"][:2]:
            alerts.append(
                {
                    "id": f"expiry-{drug['id']}",
                    "type": "info",
                    "title": f"{drug['generic_name']} 效期提醒",
                    "description": f"最近有效期 {drug['nearest_expiry']}，请核对批次",
                    "path": "/inventory?filter=expiring",
                }
            )
    if actor.role in ("admin", "cashier") and rx_counts.get("unpaid", 0):
        alerts.append(
            {
                "id": "unpaid",
                "type": "info",
                "title": "待收费处方",
                "description": f"还有 {rx_counts['unpaid']} 张处方等待结算",
                "path": "/billing",
            }
        )
    if actor.role in ("admin", "pharmacist") and rx_counts.get("paid", 0):
        alerts.append(
            {
                "id": "dispense",
                "type": "info",
                "title": "待发药处方",
                "description": f"已有 {rx_counts['paid']} 张处方完成缴费",
                "path": "/pharmacy",
            }
        )
    total_today = sum(value for status, value in counts.items() if status != "cancelled")
    yesterday = next(
        (item["visits"] for item in trend if item["date"] == (current - timedelta(days=1)).isoformat()), 0
    )
    return {
        "date": today(),
        "stats": {
            "today_visits": total_today,
            "yesterday_visits": yesterday,
            "waiting": counts.get("waiting", 0),
            "in_progress": counts.get("in_progress", 0),
            "completed": counts.get("completed", 0),
            "today_revenue_cents": data["daily"][-1]["revenue_cents"] if financial else None,
            "unpaid": rx_counts.get("unpaid", 0),
            "pending_dispense": rx_counts.get("paid", 0),
            "low_stock": lows["total"],
            "total_patients": list_patients(conn, actor, page_size=1)["total"]
            if actor.role != "pharmacist"
            else None,
        },
        "trend": trend,
        "departments": department_data,
        "waiting_list": waiting,
        "alerts": alerts,
        "activity": rows(
            conn,
            """SELECT action,actor_name,entity_type,created_at FROM audit_logs
                WHERE action NOT LIKE 'auth.%' ORDER BY id DESC LIMIT 5""",
        )
        if actor.role == "admin"
        else [],
    }


def audit_list(conn, q="", action="", page=1, page_size=20):
    sql = "SELECT * FROM audit_logs WHERE 1=1"
    params = []
    if q:
        sql += " AND (actor_name LIKE ? OR details LIKE ? OR entity_id LIKE ?)"
        params += [f"%{q}%"] * 3
    if action:
        sql += " AND action=?"
        params.append(action)
    result = paginate(conn, sql, params, page, page_size, "id DESC")
    for item in result["items"]:
        item["details"] = json.loads(item["details"])
    return result


def safe_csv(values):
    def cell(value):
        if isinstance(value, str) and value.startswith(("=", "+", "-", "@")):
            return "'" + value
        return value

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerows([cell(value) for value in row] for row in values)
    return b"\xef\xbb\xbf" + buffer.getvalue().encode("utf-8")
