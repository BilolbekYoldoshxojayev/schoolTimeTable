"""
EduPage API Proxy & Demo Server for nampm.edupage.org
Presidential School in Namangan

Zero external dependencies (uses Python built-in http.server, urllib, json).
"""

import http.server
import socketserver
import urllib.request
import json
import os
import re
import mimetypes
from urllib.parse import urlparse, parse_qs

PORT = int(os.environ.get("PORT", 3333))
EDUPAGE_HOST = "nampm.edupage.org"
PUBLIC_DIR = os.path.join(os.path.dirname(__file__), "public")

def edupage_rpc(endpoint_path, args=None):
    if args is None:
        args = []
    payload = {
        "__args": args,
        "__gsh": "00000000",
        "__client_redirect": None
    }
    url = f"https://{EDUPAGE_HOST}{endpoint_path}"
    headers = {
        "Content-Type": "application/json; charset=utf-8",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": f"https://{EDUPAGE_HOST}/timetable/"
    }
    req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'), headers=headers)
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode('utf-8'))

def edupage_get(path_str):
    url = f"https://{EDUPAGE_HOST}{path_str}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Referer": f"https://{EDUPAGE_HOST}/"
    }
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=10) as resp:
        return resp.read().decode('utf-8', errors='ignore')

def parse_rss(xml):
    items = []
    item_matches = re.findall(r'<item>(.*?)</item>', xml, re.DOTALL)
    for itm in item_matches:
        t = re.search(r'<title>(?:<!\[CDATA\[(.*?)\]\]>|(.*?))</title>', itm)
        l = re.search(r'<link>(?:<!\[CDATA\[(.*?)\]\]>|(.*?))</link>', itm)
        d = re.search(r'<pubDate>(.*?)</pubDate>', itm)
        c = re.search(r'<description>(?:<!\[CDATA\[(.*?)\]\]>|(.*?))</description>', itm)
        items.append({
            "title": (t.group(1) or t.group(2) if t else "").strip(),
            "link": (l.group(1) or l.group(2) if l else "").strip(),
            "pubDate": (d.group(1) if d else "").strip(),
            "description": (c.group(1) or c.group(2) if c else "").strip()
        })
    return {"channelTitle": "Presidential School in Namangan", "items": items}

def transform_dbi(raw_dbi):
    tables = {t['id']: t.get('data_rows', []) for t in raw_dbi.get('tables', [])}
    classes_map = {c['id']: c for c in tables.get('classes', [])}
    teachers_map = {t['id']: t for t in tables.get('teachers', [])}
    subjects_map = {s['id']: s for s in tables.get('subjects', [])}
    classrooms_map = {r['id']: r for r in tables.get('classrooms', [])}
    for r in classrooms_map.values():
        if (r.get('name') or '').lower() == 's-zal':
            r['name'] = 'Sport Zal'
            r['short'] = 'Sport Zal'
    periods_map = {p.get('period', p.get('id')): p for p in tables.get('periods', [])}
    lessons_map = {l['id']: l for l in tables.get('lessons', [])}

    class_grid = {}
    teacher_grid = {}
    classroom_grid = {}

    teacher_workload = {}
    classroom_bookings = {}
    class_lessons_count = {}
    subject_total_lessons = {}
    teacher_subjects = {}
    teacher_classes = {}

    for card in tables.get('cards', []):
        lesson = lessons_map.get(card.get('lessonid'))
        if not lesson:
            continue
        start_period = int(card.get('period', 1))
        duration = int(lesson.get('durationperiods', 1) or 1)
        days_mask = card.get('days', '')
        rooms = [classrooms_map[r] for r in card.get('classroomids', []) if r in classrooms_map]
        teachers = [teachers_map[t] for t in lesson.get('teacherids', []) if t in teachers_map]
        classes = [classes_map[c] for c in lesson.get('classids', []) if c in classes_map]
        subj = subjects_map.get(lesson.get('subjectid'), {'name': 'Unknown', 'short': 'UNK', 'color': '#999999'})

        for day_idx, bit in enumerate(days_mask):
            if bit == '1':
                for offset in range(duration):
                    p = start_period + offset
                    item = {
                        "cardId": card.get('id'),
                        "lessonId": lesson.get('id'),
                        "period": p,
                        "startPeriod": start_period,
                        "duration": duration,
                        "periodPart": offset + 1,
                        "isDoublePeriod": duration > 1,
                        "isContinuation": offset > 0,
                        "periodSpan": f"{start_period}–{start_period + duration - 1}" if duration > 1 else str(start_period),
                        "dayIndex": day_idx,
                        "subject": {
                            "id": subj.get('id'),
                            "name": subj.get('name'),
                            "short": subj.get('short'),
                            "color": subj.get('color', '#3b82f6')
                        },
                        "teachers": [{"id": t['id'], "name": t.get('name') or t.get('short'), "short": t.get('short'), "color": t.get('color')} for t in teachers],
                        "classes": [{"id": c['id'], "name": c.get('name'), "short": c.get('short'), "color": c.get('color')} for c in classes],
                        "classrooms": [{"id": r['id'], "name": r.get('name'), "short": r.get('short'), "color": r.get('color')} for r in rooms]
                    }
                    for c in classes:
                        cid = c['id']
                        class_grid.setdefault(cid, {}).setdefault(day_idx, {}).setdefault(p, []).append(item)
                        class_lessons_count[cid] = class_lessons_count.get(cid, 0) + 1
                    for t in teachers:
                        tid = t['id']
                        teacher_grid.setdefault(tid, {}).setdefault(day_idx, {}).setdefault(p, []).append(item)
                        teacher_workload[tid] = teacher_workload.get(tid, 0) + 1
                        teacher_subjects.setdefault(tid, set()).add(subj.get('name'))
                        for cl in classes:
                            teacher_classes.setdefault(tid, set()).add(cl.get('name'))
                    for r in rooms:
                        rid = r['id']
                        classroom_grid.setdefault(rid, {}).setdefault(day_idx, {}).setdefault(p, []).append(item)
                        classroom_bookings.setdefault(rid, set()).add(f"{day_idx}_{p}")
                    sid = subj.get('id')
                    if sid:
                        subject_total_lessons[sid] = subject_total_lessons.get(sid, 0) + 1

    homeroom_map = {}
    for c in tables.get('classes', []):
        if c.get('teacherid'):
            homeroom_map[c['teacherid']] = c.get('name')

    global_info = (tables.get('globals', [{}]) or [{}])[0]

    enriched_classes = []
    for c in tables.get('classes', []):
        hr_teacher = teachers_map.get(c.get('teacherid'), {})
        enriched_classes.append({
            "id": c['id'],
            "name": c.get('name'),
            "short": c.get('short'),
            "color": c.get('color'),
            "teacherId": c.get('teacherid'),
            "homeroomTeacherName": hr_teacher.get('name') or hr_teacher.get('short') or 'Unassigned',
            "weeklyLessons": class_lessons_count.get(c['id'], 0)
        })

    enriched_teachers = []
    for t in tables.get('teachers', []):
        tid = t['id']
        enriched_teachers.append({
            "id": tid,
            "name": t.get('name') or t.get('short'),
            "short": t.get('short'),
            "color": t.get('color'),
            "homeroomClass": homeroom_map.get(tid),
            "weeklyLessons": teacher_workload.get(tid, 0),
            "subjects": list(teacher_subjects.get(tid, set())),
            "classes": list(teacher_classes.get(tid, set()))
        })

    enriched_subjects = []
    for s in tables.get('subjects', []):
        sid = s['id']
        enriched_subjects.append({
            "id": sid,
            "name": s.get('name'),
            "short": s.get('short'),
            "color": s.get('color'),
            "totalLessons": subject_total_lessons.get(sid, 0)
        })

    enriched_classrooms = []
    for r in tables.get('classrooms', []):
        rid = r['id']
        booked_slots = len(classroom_bookings.get(rid, set()))
        utilization_rate = round((booked_slots / 35.0) * 100)
        enriched_classrooms.append({
            "id": rid,
            "name": r.get('name'),
            "short": r.get('short'),
            "color": r.get('color', '#e2e8f0'),
            "bookedSlots": booked_slots,
            "utilizationRate": utilization_rate
        })

    return {
        "school": {
            "name": global_info.get('reg_name', 'Presidential School in Namangan, Islom Karimov Street'),
            "address": 'Islom Karimov Street, Namangan, Uzbekistan',
            "year": global_info.get('edupage_year', 2026),
            "timezone": 'Asia/Tashkent',
            "country": 'uz',
            "platform": 'aSc EduPage 9'
        },
        "days": [{"id": d['id'], "name": d.get('name'), "short": d.get('short')} for d in tables.get('days', [])],
        "periods": [{"id": p.get('period', p.get('id')), "name": p.get('name'), "startTime": p.get('starttime'), "endTime": p.get('endtime')} for p in tables.get('periods', [])],
        "classes": enriched_classes,
        "teachers": enriched_teachers,
        "subjects": enriched_subjects,
        "classrooms": enriched_classrooms,
        "classGrid": class_grid,
        "teacherGrid": teacher_grid,
        "classroomGrid": classroom_grid,
        "stats": {
            "totalClasses": len(tables.get('classes', [])),
            "totalTeachers": len(tables.get('teachers', [])),
            "totalSubjects": len(tables.get('subjects', [])),
            "totalClassrooms": len(tables.get('classrooms', [])),
            "totalLessons": len(tables.get('lessons', [])),
            "totalCards": len(tables.get('cards', []))
        }
    }

class EduPageHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        if path.startswith("/api/"):
            try:
                if path == "/api/info":
                    self.send_json({
                        "institution": "Presidential School in Namangan",
                        "domain": EDUPAGE_HOST,
                        "location": "Islom Karimov Street, Namangan, Uzbekistan",
                        "timezone": "Asia/Tashkent",
                        "academicYear": "2026-2027",
                        "status": "online"
                    })
                    return
                elif path == "/api/timetables":
                    res = edupage_rpc("/timetable/server/ttviewer.js?__func=getTTViewerData", [None, 2026])
                    self.send_json(res.get("r", {}).get("regular", {"timetables": []}))
                    return
                elif path.startswith("/api/timetable/"):
                    tt_num = path.replace("/api/timetable/", "") or "13"
                    res = edupage_rpc("/timetable/server/regulartt.js?__func=regularttGetData", [None, tt_num])
                    transformed = transform_dbi(res.get("r", {}).get("dbiAccessorRes", {}))
                    self.send_json(transformed)
                    return
                elif path == "/api/daily":
                    cid = query.get("classId", ["-17"])[0]
                    date_str = query.get("date", ["2026-09-02"])[0]
                    year = int(date_str[:4]) if len(date_str) >= 4 else 2026
                    args = [None, {"year": year, "datefrom": date_str, "dateto": date_str, "table": "classes", "id": cid, "showColors": True, "showIgroupsInClasses": True, "showOrig": True}]
                    res = edupage_rpc("/timetable/server/currenttt.js?__func=curentttGetData", args)
                    self.send_json(res.get("r", {"ttitems": []}))
                    return
                elif path == "/api/substitution":
                    date_str = query.get("date", ["2026-09-02"])[0]
                    mode = query.get("mode", ["classes"])[0]
                    res = edupage_rpc("/substitution/server/viewer.js?__func=getSubstViewerDayDataHtml", [None, {"date": date_str, "mode": mode, "kiosk": None}])
                    html_content = res.get("r", "")
                    has_subst = ("nosubst" not in html_content) and len(html_content) > 50
                    self.send_json({
                        "date": date_str,
                        "mode": mode,
                        "html": html_content,
                        "hasSubstitution": has_subst
                    })
                    return
                elif path == "/api/news":
                    xml = edupage_get("/rss/news")
                    self.send_json(parse_rss(xml))
                    return
                else:
                    self.send_error(404, "Endpoint Not Found")
                    return
            except Exception as e:
                self.send_json({"error": str(e)}, status=500)
                return

        # Serve static files from public/
        rel_path = path.lstrip("/")
        if not rel_path:
            rel_path = "index.html"
        full_path = os.path.join(PUBLIC_DIR, rel_path)
        if not os.path.exists(full_path):
            full_path = os.path.join(PUBLIC_DIR, "index.html")

        mime, _ = mimetypes.guess_type(full_path)
        if mime is None:
            mime = "text/html"
        if "text" in mime or "javascript" in mime or "json" in mime:
            mime += "; charset=utf-8"

        try:
            with open(full_path, "rb") as f:
                content = f.read()
            self.send_response(200)
            self.send_header("Content-Type", mime)
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            self.send_error(500, f"Error reading file: {e}")

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/raw-rpc":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length).decode("utf-8")
            data = json.loads(body)
            endpoint = data.get("endpoint", "/timetable/server/ttviewer.js?__func=getTTViewerData")
            args = data.get("args", [None, 2026])
            res = edupage_rpc(endpoint, args)
            self.send_json({"response": res})
        else:
            self.send_error(404, "Not Found")

    def send_json(self, data, status=200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

if __name__ == "__main__":
    import sys
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    print("=" * 60)
    print(">> EduPage nampm.edupage.org Explorer (Python Server)")
    print(f">> Running at: http://localhost:{PORT}")
    print("=" * 60)
    with socketserver.TCPServer(("", PORT), EduPageHandler) as httpd:
        httpd.serve_forever()
