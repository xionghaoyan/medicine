from datetime import date, datetime, timedelta, timezone

from app import schemas
from app.security import hash_password
from app.services.catalog import receive_stock
from app.services.clinic import _register, create_prescription
from app.services.common import SHANGHAI, Actor, now, one, today
from app.services.finance import charge_prescription, dispense_prescription


def seed_demo(db, password: str):
    """Initialize fictional teaching data once. Never reset an existing database."""
    with db.read() as conn:
        if conn.execute("SELECT 1 FROM settings WHERE key='demo_initialized'").fetchone():
            return
        if conn.execute("SELECT 1 FROM users LIMIT 1").fetchone():
            return
    password_hash = hash_password(password)
    current = date.fromisoformat(today())
    with db.transaction() as conn:
        if conn.execute("SELECT 1 FROM users LIMIT 1").fetchone():
            return
        conn.executemany(
            "INSERT INTO settings(key,value) VALUES (?,?)",
            [
                ("hospital_name", "嘟嘟社区医疗中心"),
                ("phone", "0731-0000-0000"),
                ("address", "长沙市 · 嘟嘟健康园区（教学演示）"),
                ("demo_initialized", "1"),
            ],
        )
        conn.executemany(
            "INSERT INTO departments(id,name,location,color) VALUES (?,?,?,?)",
            [
                (1, "全科医学科", "一楼 · 101诊室", "#345cf3"),
                (2, "内科", "一楼 · 103诊室", "#7c83ed"),
                (3, "中医科", "二楼 · 201诊室", "#efab62"),
                (4, "儿科", "二楼 · 203诊室", "#53b6c8"),
            ],
        )
        conn.executemany(
            """INSERT INTO doctors(id,name,title,department_id,specialty,consultation_fee_cents,avatar_color)
            VALUES (?,?,?,?,?,?,?)""",
            [
                (1, "林知远", "主任医师", 1, "全科常见病、慢病随访", 2500, "#e9eeff"),
                (2, "陈予薇", "副主任医师", 2, "呼吸系统疾病、内科诊疗", 2000, "#e9e8f4"),
                (3, "周素清", "主任医师", 3, "中医调理、脾胃病", 3000, "#f4ebda"),
                (4, "许言", "主治医师", 4, "儿童常见病、儿童保健", 1500, "#e1edf3"),
                (5, "沈一川", "主治医师", 2, "消化内科、健康咨询", 1500, "#f3e5e1"),
                (6, "赵宁", "副主任医师", 1, "家庭医学、健康管理", 2000, "#edf0ff"),
            ],
        )
        for uid, username, display_name, role, doctor_id in [
            (1, "admin", "杜安然", "admin", None),
            (2, "doctor", "林知远", "doctor", 1),
            (3, "cashier", "周晓宁", "cashier", None),
            (4, "pharmacist", "许文", "pharmacist", None),
        ]:
            conn.execute(
                """INSERT INTO users(id,username,password_hash,display_name,role,doctor_id,created_at)
                VALUES (?,?,?,?,?,?,?)""",
                (uid, username, password_hash, display_name, role, doctor_id, now()),
            )
        admin = Actor(1, "杜安然", "admin", ip="演示初始化")
        cashier = Actor(3, "周晓宁", "cashier", ip="演示初始化")
        pharmacist = Actor(4, "许文", "pharmacist", ip="演示初始化")
        names = [
            "江予安",
            "陈念初",
            "周景行",
            "许知夏",
            "李明远",
            "苏以宁",
            "林书言",
            "沈嘉禾",
            "赵亦安",
            "徐晚晴",
            "吴星河",
            "郑若溪",
            "何沐阳",
            "宋清欢",
            "唐一诺",
            "程初瑶",
            "方景澄",
            "叶书宁",
            "邓以恒",
            "卢思雨",
            "冯予川",
            "蒋安然",
            "韩子墨",
            "梁念慈",
            "顾文轩",
            "彭雪宁",
            "杜嘉树",
            "陆知微",
            "秦沐风",
            "余心悦",
            "白若辰",
            "袁静宜",
            "戴明泽",
            "夏予曦",
            "邵云舒",
            "魏乐知",
            "侯远舟",
            "孟溪月",
            "陶书然",
            "许清扬",
            "罗以南",
            "曾言心",
            "谢庭安",
            "金映秋",
            "高子衿",
            "马书晴",
            "胡怀瑾",
            "刘星晚",
        ]
        for index, name in enumerate(names, 1):
            conn.execute(
                """INSERT INTO patients(id,patient_no,full_name,gender,birth_date,phone,allergies,address,created_at)
                VALUES (?,?,?,?,?,?,?,?,?)""",
                (
                    index,
                    f"DD{index:06d}",
                    name,
                    "male" if index % 2 else "female",
                    f"{1962 + (index * 7) % 48}-{1 + index % 12:02d}-{1 + index % 27:02d}",
                    f"1390000{index:04d}",
                    "青霉素过敏（演示）" if index in (4, 12, 26) else "无已知过敏",
                    "嘟嘟社区（虚构演示档案）",
                    now(),
                ),
            )
        medications = [
            ("阿莫西林胶囊", "嘟嘟示例", "0.25g × 24粒", "胶囊剂", 1200, "A", 680, 365),
            ("布洛芬缓释胶囊", "芬必得", "0.3g × 20粒", "胶囊剂", 1850, "B", 560, 420),
            ("板蓝根颗粒", "白云山", "10g × 20袋", "颗粒剂", 1280, "A", 320, 300),
            ("感冒清热颗粒", "同仁堂", "12g × 10袋", "颗粒剂", 1680, "A", 380, 240),
            ("盐酸氨溴索片", "沐舒坦", "30mg × 20片", "片剂", 1560, "B", 450, 500),
            ("维生素C片", "养生堂", "100mg × 100片", "片剂", 680, "B", 280, 360),
            ("氯雷他定片", "开瑞坦", "10mg × 6片", "片剂", 2250, "B", 16, 260),
            ("连花清瘟胶囊", "以岭", "0.35g × 24粒", "胶囊剂", 2450, "A", 12, 320),
            ("藿香正气口服液", "太极", "10ml × 10支", "口服液", 1850, "A", 42, 19),
            ("复方甘草片", "嘟嘟示例", "100片 / 瓶", "片剂", 1080, "A", 85, 540),
            ("蒙脱石散", "思密达", "3g × 10袋", "散剂", 2180, "B", 126, 380),
            ("小儿氨酚黄那敏颗粒", "嘟嘟示例", "6g × 12袋", "颗粒剂", 1480, "self", 160, 290),
        ]
        initial_stamp = (
            (datetime.now(timezone.utc) - timedelta(days=30))
            .isoformat(timespec="seconds")
            .replace("+00:00", "Z")
        )
        for index, (generic, trade, spec, form, price, insurance, stock, expiry_days) in enumerate(
            medications, 1
        ):
            conn.execute(
                """INSERT INTO drugs(id,drug_code,generic_name,trade_name,specification,dosage_form,unit,
                price_cents,insurance_category,manufacturer,stock_threshold,created_at) VALUES (?,?,?,?,?,?,'盒',?,?,?,20,?)""",
                (
                    index,
                    f"MED{index:03d}",
                    generic,
                    trade,
                    spec,
                    form,
                    price,
                    insurance,
                    "教学药品示例厂",
                    initial_stamp,
                ),
            )
            receive_stock(
                conn,
                schemas.ReceiveInput(
                    drug_id=index,
                    batch_no=f"DD-{current:%y%m}-{index:03d}",
                    quantity=stock,
                    expires_at=current + timedelta(days=expiry_days),
                ),
                admin,
                initial_stamp,
            )
        for offset in range(-6, 8):
            day = (current + timedelta(days=offset)).isoformat()
            for doctor_id in range(1, 7):
                for period in ("morning", "afternoon"):
                    conn.execute(
                        "INSERT INTO schedules(doctor_id,date,period,total_slots,remaining_slots) VALUES (?,?,?,24,24)",
                        (doctor_id, day, period),
                    )
        diagnoses = [("上呼吸道感染", "J06.9"), ("咳嗽", "R05"), ("消化不良", "K30")]
        for offset in range(-6, 1):
            day = current + timedelta(days=offset)
            count = [24, 31, 27, 35, 30, 33, 38][offset + 6]
            for index in range(count):
                doctor_id = (index + offset) % 6 + 1
                period = "morning" if index % 12 < 6 else "afternoon"
                patient_id = (index - offset * 3) % len(names) + 1
                stamp = (
                    datetime(day.year, day.month, day.day, 8 + index % 4, (index * 7) % 60, tzinfo=SHANGHAI)
                    .astimezone(timezone.utc)
                    .isoformat()
                    .replace("+00:00", "Z")
                )
                schedule = one(
                    conn,
                    """SELECT s.*,d.consultation_fee_cents FROM schedules s JOIN doctors d ON d.id=s.doctor_id
                    WHERE s.date=? AND s.doctor_id=? AND s.period=?""",
                    (day.isoformat(), doctor_id, period),
                )
                patient = one(conn, "SELECT * FROM patients WHERE id=?", (patient_id,))
                reg = _register(conn, patient, schedule, cashier, stamp)
                if offset == 0 and index >= 26:
                    continue
                diagnosis, code = diagnoses[index % len(diagnoses)]
                rx = create_prescription(
                    conn,
                    schemas.PrescriptionInput(
                        registration_id=reg["id"],
                        diagnosis=diagnosis,
                        diagnosis_code=code,
                        chief_complaint="虚构教学就诊记录",
                        notes="教学演示记录，非真实处方。",
                        items=[
                            schemas.PrescriptionItemInput(
                                drug_id=index % 6 + 1,
                                quantity=index % 2 + 1,
                                dosage="按医嘱使用",
                                frequency="遵医嘱",
                            ),
                            schemas.PrescriptionItemInput(
                                drug_id=(index + 2) % 6 + 1,
                                quantity=1,
                                dosage="按医嘱使用",
                                frequency="遵医嘱",
                            ),
                        ],
                    ),
                    admin,
                    stamp,
                )
                if offset == 0 and index >= 19:
                    continue
                charge_prescription(
                    conn, rx["id"], ["wechat", "alipay", "cash", "card"][index % 4], cashier, stamp
                )
                if offset == 0 and index >= 12:
                    continue
                dispense_prescription(conn, rx["id"], pharmacist, stamp)
