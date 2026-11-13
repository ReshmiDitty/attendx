import os
import json
import csv
import io
import hashlib
import shutil
from datetime import datetime
import streamlit as st
import streamlit.components.v1 as components

# Configure Streamlit page for full-bleed dashboard presentation
st.set_page_config(
    page_title="AttendX – Student Attendance Management System",
    page_icon="🎓",
    layout="wide",
    initial_sidebar_state="collapsed"
)

# Hide Streamlit's native chrome to let AttendX's custom UI take over the entire screen
st.markdown("""
<style>
  /* Hide Streamlit default navigation, header, footer, and borders */
  #MainMenu, header, footer, [data-testid="stToolbar"], [data-testid="stDecoration"], [data-testid="stSidebarNav"] {
    display: none !important;
    visibility: hidden !important;
    height: 0 !important;
  }
  .stApp {
    background-color: #ECE6DF !important;
    padding: 0 !important;
    margin: 0 !important;
  }
  .block-container {
    padding: 0 !important;
    margin: 0 !important;
    max-width: 100vw !important;
    min-height: 100vh !important;
    height: auto !important;
  }
  iframe {
    width: 100vw !important;
    height: 100vh !important;
    min-height: 1020px !important;
    border: none !important;
    display: block !important;
  }
</style>
""", unsafe_allow_html=True)

# Helper: Load flatfile data from data/*.txt with hardcoded fallbacks
def load_project_data():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    
    # 1. Students
    students = []
    s_path = os.path.join(base_dir, "data", "students.txt")
    if os.path.exists(s_path):
        with open(s_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line: continue
                p = line.split("|")
                if len(p) >= 6:
                    students.append({
                        "roll_no": p[0], "name": p[1], "section": p[2],
                        "email": p[3], "phone": p[4], "joined_on": p[5]
                    })
    if not students:
        students = [
            {"roll_no": "CS101", "name": "Aarav Sharma", "section": "CS-A", "email": "aarav.sharma@attendx.edu", "phone": "+91 98765 43210", "joined_on": "2026-08-01"},
            {"roll_no": "CS102", "name": "Ananya Iyer", "section": "CS-A", "email": "ananya.iyer@attendx.edu", "phone": "+91 98765 43211", "joined_on": "2026-08-01"},
            {"roll_no": "CS103", "name": "Rohan Verma", "section": "CS-A", "email": "rohan.verma@attendx.edu", "phone": "+91 98765 43212", "joined_on": "2026-08-01"},
            {"roll_no": "CS104", "name": "Diya Patel", "section": "CS-A", "email": "diya.patel@attendx.edu", "phone": "+91 98765 43213", "joined_on": "2026-08-01"},
            {"roll_no": "CS105", "name": "Kabir Khan", "section": "CS-A", "email": "kabir.khan@attendx.edu", "phone": "+91 98765 43214", "joined_on": "2026-08-01"},
            {"roll_no": "CS106", "name": "Priyanka Das", "section": "CS-A", "email": "priyanka.das@attendx.edu", "phone": "+91 98765 43215", "joined_on": "2026-08-01"},
            {"roll_no": "CS107", "name": "Siddharth Rao", "section": "CS-A", "email": "siddharth.rao@attendx.edu", "phone": "+91 98765 43216", "joined_on": "2026-08-01"},
            {"roll_no": "CS108", "name": "Neha Kapoor", "section": "CS-A", "email": "neha.kapoor@attendx.edu", "phone": "+91 98765 43217", "joined_on": "2026-08-01"},
            {"roll_no": "CS109", "name": "Aryan Saxena", "section": "CS-A", "email": "aryan.saxena@attendx.edu", "phone": "+91 98765 43218", "joined_on": "2026-08-01"},
            {"roll_no": "CS110", "name": "Bhavna Mehta", "section": "CS-A", "email": "bhavna.mehta@attendx.edu", "phone": "+91 98765 43219", "joined_on": "2026-08-01"},
            {"roll_no": "CS201", "name": "Ishaan Roy", "section": "CS-B", "email": "ishaan.roy@attendx.edu", "phone": "+91 98765 43220", "joined_on": "2026-08-01"},
            {"roll_no": "CS202", "name": "Sneha Nair", "section": "CS-B", "email": "sneha.nair@attendx.edu", "phone": "+91 98765 43221", "joined_on": "2026-08-01"},
            {"roll_no": "CS203", "name": "Vikram Malhotra", "section": "CS-B", "email": "vikram.m@attendx.edu", "phone": "+91 98765 43222", "joined_on": "2026-08-01"},
            {"roll_no": "CS204", "name": "Pooja Reddy", "section": "CS-B", "email": "pooja.reddy@attendx.edu", "phone": "+91 98765 43223", "joined_on": "2026-08-01"},
            {"roll_no": "CS205", "name": "Aditya Joshi", "section": "CS-B", "email": "aditya.j@attendx.edu", "phone": "+91 98765 43224", "joined_on": "2026-08-01"},
            {"roll_no": "CS206", "name": "Ritu Choudhary", "section": "CS-B", "email": "ritu.c@attendx.edu", "phone": "+91 98765 43225", "joined_on": "2026-08-01"},
            {"roll_no": "CS207", "name": "Manan Shah", "section": "CS-B", "email": "manan.shah@attendx.edu", "phone": "+91 98765 43226", "joined_on": "2026-08-01"},
            {"roll_no": "CS208", "name": "Shalini Tiwari", "section": "CS-B", "email": "shalini.t@attendx.edu", "phone": "+91 98765 43227", "joined_on": "2026-08-01"},
            {"roll_no": "CS209", "name": "Kunal Singhania", "section": "CS-B", "email": "kunal.s@attendx.edu", "phone": "+91 98765 43228", "joined_on": "2026-08-01"},
            {"roll_no": "CS210", "name": "Avani Mishra", "section": "CS-B", "email": "avani.m@attendx.edu", "phone": "+91 98765 43229", "joined_on": "2026-08-01"},
            {"roll_no": "IT301", "name": "Meera Kulkarni", "section": "IT-A", "email": "meera.k@attendx.edu", "phone": "+91 98765 43230", "joined_on": "2026-08-01"},
            {"roll_no": "IT302", "name": "Devendra Sen", "section": "IT-A", "email": "dev.sen@attendx.edu", "phone": "+91 98765 43231", "joined_on": "2026-08-01"},
            {"roll_no": "IT303", "name": "Tanya Gupta", "section": "IT-A", "email": "tanya.gupta@attendx.edu", "phone": "+91 98765 43232", "joined_on": "2026-08-01"},
            {"roll_no": "IT304", "name": "Farhan Sheikh", "section": "IT-A", "email": "farhan.s@attendx.edu", "phone": "+91 98765 43233", "joined_on": "2026-08-01"},
            {"roll_no": "IT305", "name": "Rhea D'Souza", "section": "IT-A", "email": "rhea.dsouza@attendx.edu", "phone": "+91 98765 43234", "joined_on": "2026-08-01"},
            {"roll_no": "IT306", "name": "Yashwant Deshmukh", "section": "IT-A", "email": "yash.d@attendx.edu", "phone": "+91 98765 43235", "joined_on": "2026-08-01"},
            {"roll_no": "IT307", "name": "Kriti Aggarwal", "section": "IT-A", "email": "kriti.a@attendx.edu", "phone": "+91 98765 43236", "joined_on": "2026-08-01"},
            {"roll_no": "IT308", "name": "Nikhil Pillai", "section": "IT-A", "email": "nikhil.p@attendx.edu", "phone": "+91 98765 43237", "joined_on": "2026-08-01"},
            {"roll_no": "IT309", "name": "Sakshi Bhatt", "section": "IT-A", "email": "sakshi.b@attendx.edu", "phone": "+91 98765 43238", "joined_on": "2026-08-01"},
            {"roll_no": "IT310", "name": "Varun Chatterjee", "section": "IT-A", "email": "varun.c@attendx.edu", "phone": "+91 98765 43239", "joined_on": "2026-08-01"}
        ]

    # 2. Attendance
    attendance = []
    a_path = os.path.join(base_dir, "data", "attendance.txt")
    if os.path.exists(a_path):
        with open(a_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line: continue
                p = line.split("|")
                if len(p) >= 4:
                    attendance.append({
                        "date": p[0], "roll_no": p[1], "status": p[2], "remarks": p[3]
                    })
                    
    # 3. Calculate summary metrics identical to backend
    today = "2026-11-02"
    today_records = [r for r in attendance if r["date"] == today]
    pres_today = sum(1 for r in today_records if r["status"] == "Present")
    abs_today = sum(1 for r in today_records if r["status"] == "Absent")
    late_today = sum(1 for r in today_records if r["status"] == "Late")
    total_today = pres_today + abs_today + late_today
    
    tot_pres_all = sum(1 for r in attendance if r["status"] == "Present")
    tot_late_all = sum(1 for r in attendance if r["status"] == "Late")
    total_recs = len(attendance)
    overall_pct = ((tot_pres_all + tot_late_all) / total_recs * 100.0) if total_recs > 0 else 0.0
    
    kpi = {
        "total_students": len(students),
        "present_today": pres_today,
        "absent_today": abs_today,
        "late_today": late_today,
        "total_today": total_today,
        "present_today_pct": (pres_today / total_today * 100.0) if total_today > 0 else 0.0,
        "absent_today_pct": (abs_today / total_today * 100.0) if total_today > 0 else 0.0,
        "late_today_pct": (late_today / total_today * 100.0) if total_today > 0 else 0.0,
        "overall_percentage": round(overall_pct, 1)
    }

    # Sections
    sections = []
    distinct_secs = sorted(list(set(s["section"] for s in students)))
    for sec in distinct_secs:
        sec_rolls = set(s["roll_no"] for s in students if s["section"] == sec)
        sec_recs = [r for r in attendance if r["roll_no"] in sec_rolls]
        s_tot = len(sec_recs)
        s_p = sum(1 for r in sec_recs if r["status"] == "Present")
        s_a = sum(1 for r in sec_recs if r["status"] == "Absent")
        s_l = sum(1 for r in sec_recs if r["status"] == "Late")
        sections.append({
            "section": sec,
            "total_students": len(sec_rolls),
            "percentage": round(((s_p + s_l) / s_tot * 100.0) if s_tot > 0 else 0.0, 1),
            "present_percentage": round((s_p / s_tot * 100.0) if s_tot > 0 else 0.0, 1),
            "absent_percentage": round((s_a / s_tot * 100.0) if s_tot > 0 else 0.0, 1),
            "present_count": s_p,
            "absent_count": s_a,
            "late_count": s_l
        })

    # Trend
    dates = sorted(list(set(r["date"] for r in attendance)))
    trend = []
    for d in dates:
        d_recs = [r for r in attendance if r["date"] == d]
        d_tot = len(d_recs)
        dp = sum(1 for r in d_recs if r["status"] == "Present")
        da = sum(1 for r in d_recs if r["status"] == "Absent")
        dl = sum(1 for r in d_recs if r["status"] == "Late")
        trend.append({
            "date": d,
            "present": dp,
            "absent": da,
            "late": dl,
            "percentage": round(((dp + dl) / d_tot * 100.0) if d_tot > 0 else 0.0, 1),
            "present_percentage": round((dp / d_tot * 100.0) if d_tot > 0 else 0.0, 1),
            "absent_percentage": round((da / d_tot * 100.0) if d_tot > 0 else 0.0, 1)
        })

    # Low attendance watchlist (< 75%)
    low_alerts = []
    for s in students:
        s_recs = [r for r in attendance if r["roll_no"] == s["roll_no"]]
        s_tot = len(s_recs)
        sp = sum(1 for r in s_recs if r["status"] == "Present")
        sl = sum(1 for r in s_recs if r["status"] == "Late")
        pct = ((sp + sl) / s_tot * 100.0) if s_tot > 0 else 0.0
        if s_tot > 0 and pct < 75.0:
            low_alerts.append({
                "roll_no": s["roll_no"],
                "name": s["name"],
                "section": s["section"],
                "percentage": round(pct, 1),
                "present_days": sp,
                "total_days": s_tot
            })

    # Activity Feed
    activity_feed = [
        {"timestamp": "2026-11-02 22:30:00", "user": "admin", "action": "User admin active on AttendX production dashboard"},
        {"timestamp": "2026-11-02 22:01:11", "user": "admin", "action": "User admin logged in successfully (admin)"},
        {"timestamp": "2026-11-02 21:16:16", "user": "system", "action": "Attendance verified for 2026-11-02 session"}
    ]

    summary = {
        "kpi": kpi,
        "sections": sections,
        "trend": trend,
        "low_attendance_alerts": low_alerts,
        "activity_feed": activity_feed
    }

    # 4. Users
    users = []
    u_path = os.path.join(base_dir, "data", "users.txt")
    if os.path.exists(u_path):
        with open(u_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line: continue
                p = line.split("|")
                if len(p) >= 3:
                    users.append({ "username": p[0], "role": p[2] })
    if not users:
        users = [
            { "username": "admin", "role": "admin" },
            { "username": "teacher", "role": "teacher" }
        ]

    return {
        "students": students,
        "attendance": attendance,
        "users": users,
        "summary": summary
    }

def read_records(filename, minimum_fields):
    path = os.path.join(base_dir, "data", filename)
    result = []
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as source:
            for line in source:
                fields = line.rstrip("\r\n").split("|")
                if len(fields) >= minimum_fields and fields[0]:
                    result.append(fields)
    return result

def write_records(filename, records):
    data_dir = os.path.join(base_dir, "data")
    backup_dir = os.path.join(base_dir, "backups")
    os.makedirs(data_dir, exist_ok=True)
    os.makedirs(backup_dir, exist_ok=True)
    target = os.path.join(data_dir, filename)
    if os.path.exists(target):
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        shutil.copy2(target, os.path.join(backup_dir, f"{filename}_{stamp}.bak"))
    temporary = target + ".tmp"
    with open(temporary, "w", encoding="utf-8", newline="") as output:
        for record in records:
            if any("|" in str(value) or "\n" in str(value) for value in record):
                raise ValueError("Values cannot contain pipe characters or newlines.")
            output.write("|".join(str(value) for value in record) + "\n")
        output.flush()
        os.fsync(output.fileno())
    os.replace(temporary, target)

def persist_iframe_action(action):
    if not isinstance(action, dict):
        return
    kind = action.get("action")
    payload = action.get("payload") or {}
    if kind in ("addStudent", "updateStudent"):
        student = payload.get("student") or {}
        roll = str(student.get("roll_no", "")).strip()
        if not roll or not str(student.get("name", "")).strip():
            raise ValueError("Roll number and name are required.")
        rows = read_records("students.txt", 6)
        existing = next((current for current in rows if current[0] == roll), None)
        row = [roll, student.get("name", ""), student.get("section", ""),
               student.get("email", ""), student.get("phone", ""),
               student.get("joined_on") or (existing[5] if existing else datetime.now().date().isoformat())]
        found = False
        for index, current in enumerate(rows):
            if current[0] == roll:
                rows[index] = row
                found = True
                break
        if kind == "addStudent" and found:
            raise ValueError(f"Student {roll} already exists.")
        if kind == "updateStudent" and not found:
            raise ValueError(f"Student {roll} was not found.")
        if not found:
            rows.append(row)
        write_records("students.txt", rows)
    elif kind == "deleteStudent":
        roll = str(payload.get("roll", ""))
        write_records("students.txt", [r for r in read_records("students.txt", 6) if r[0] != roll])
        write_records("attendance.txt", [r for r in read_records("attendance.txt", 4) if r[1] != roll])
    elif kind == "saveAttendance":
        date = str(payload.get("date", ""))
        records = payload.get("records") or []
        if not date:
            raise ValueError("Attendance date is required.")
        rows = [r for r in read_records("attendance.txt", 4) if r[0] != date]
        rows.extend([[date, r.get("roll_no", ""), r.get("status", "Present"), r.get("remarks", "")] for r in records])
        write_records("attendance.txt", rows)
    elif kind == "deleteUser":
        username = str(payload.get("username", ""))
        if username.lower() == "admin":
            raise ValueError("Cannot delete the protected admin account.")
        write_records("users.txt", [r for r in read_records("users.txt", 3) if r[0] != username])
    elif kind == "addUser":
        username, password, role = (str(payload.get(k, "")).strip() for k in ("username", "password", "role"))
        rows = read_records("users.txt", 3)
        if not username or not password:
            raise ValueError("Username and password are required.")
        if any(r[0].lower() == username.lower() for r in rows):
            raise ValueError("Username already exists.")
        password_hash = hashlib.sha256(f"AttendX_SecureSalt_v1:{password}".encode("utf-8")).hexdigest()
        write_records("users.txt", rows + [[username, password_hash, role or "teacher"]])

# Read frontend assets
base_dir = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(base_dir, "public", "index.html"), "r", encoding="utf-8") as f:
    html_template = f.read()

with open(os.path.join(base_dir, "public", "css", "style.css"), "r", encoding="utf-8") as f:
    css_content = f.read()

with open(os.path.join(base_dir, "public", "js", "charts.js"), "r", encoding="utf-8") as f:
    charts_js_content = f.read()

with open(os.path.join(base_dir, "public", "js", "app.js"), "r", encoding="utf-8") as f:
    app_js_content = f.read()

project_data = load_project_data()
data_json = json.dumps(project_data)

def csv_bytes(headers, records):
    output = io.StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow(headers)
    writer.writerows(records)
    return output.getvalue().encode("utf-8-sig")

def attendance_report_rows(student_rows, attendance_rows):
    attendance_by_roll = {}
    for record in attendance_rows:
        attendance_by_roll.setdefault(record[1], []).append(record)
    report_rows = []
    for student in student_rows:
        history = attendance_by_roll.get(student[0], [])
        present = sum(row[2] == "Present" for row in history)
        absent = sum(row[2] == "Absent" for row in history)
        late = sum(row[2] == "Late" for row in history)
        total = len(history)
        report_rows.append([student[0], student[1], student[2], total, present, absent, late,
                            round((present + late) * 100 / total, 1) if total else 0.0])
    return report_rows

# Keep native downloads above the embedded website so browser iframe download
# restrictions cannot block CSV exports.
students_for_export = read_records("students.txt", 6)
attendance_for_export = read_records("attendance.txt", 4)
reports_for_export = attendance_report_rows(students_for_export, attendance_for_export)
st.subheader("Download data")
download_col1, download_col2, download_col3 = st.columns(3)
with download_col1:
    st.download_button("Download students CSV", csv_bytes(
        ["roll_no", "name", "section", "email", "phone", "joined_on"], students_for_export
    ), "attendx_students.csv", "text/csv", use_container_width=True)
with download_col2:
    st.download_button("Download attendance CSV", csv_bytes(
        ["date", "roll_no", "status", "remarks"], attendance_for_export
    ), "attendx_attendance.csv", "text/csv", use_container_width=True)
with download_col3:
    st.download_button("Download attendance report CSV", csv_bytes(
        ["roll_no", "name", "section", "total_days", "present_days", "absent_days", "late_days", "attendance_percent"], reports_for_export
    ), "attendx_attendance_report.csv", "text/csv", type="primary", use_container_width=True)

# Inject CSS directly into the HTML head
html_bundle = html_template.replace(
    '<link rel="stylesheet" href="css/style.css">',
    f'<style>\n{css_content}\n</style>'
)

# Inline client-side mock API that resolves from project_data
mock_api_script = f"""
<script>
window.__ATTENDX_DATA__ = {data_json};
window.__ATTENDX_SAVE__ = (action, payload) => window.parent.postMessage({{
  type: 'attendx:action', value: {{ action, payload }}
}}, '*');

// Pre-authenticate as admin on first visit unless user explicitly logged out
if (!localStorage.getItem('attendx_auth_token') && localStorage.getItem('attendx_logged_out') !== 'true') {{
  localStorage.setItem('attendx_auth_token', 'demo_admin_token_streamlit');
  localStorage.setItem('attendx_user', JSON.stringify({{ username: 'admin', role: 'admin' }}));
  localStorage.setItem('attendx_theme', 'light');
}}

// Standalone in-memory API for Streamlit Cloud
window.API = {{
  TOKEN_KEY: 'attendx_auth_token',
  USER_KEY: 'attendx_user',
  getToken() {{ return localStorage.getItem(this.TOKEN_KEY); }},
  setToken(t) {{ if (t) localStorage.setItem(this.TOKEN_KEY, t); else localStorage.removeItem(this.TOKEN_KEY); }},
  getUser() {{
    try {{ const u = localStorage.getItem(this.USER_KEY); return u ? JSON.parse(u) : null; }}
    catch {{ return null; }}
  }},
  setUser(u) {{ if (u) localStorage.setItem(this.USER_KEY, JSON.stringify(u)); else localStorage.removeItem(this.USER_KEY); }},
  isAuthenticated() {{ return !!this.getToken(); }},

  async login(username, password) {{
    const user = {{ username: username || 'admin', role: (username === 'teacher') ? 'teacher' : 'admin' }};
    localStorage.removeItem('attendx_logged_out');
    this.setToken('session_' + Date.now());
    this.setUser(user);
    return {{ success: true, message: 'Logged in successfully', data: {{ token: this.getToken(), user }} }};
  }},

  async logout() {{
    localStorage.setItem('attendx_logged_out', 'true');
    this.setToken(null);
    this.setUser(null);
    if (window.App && typeof window.App.showLogin === 'function') {{
      window.App.showLogin();
    }}
  }},

  async getSummary() {{
    return {{ success: true, message: 'Summary loaded', data: window.__ATTENDX_DATA__.summary }};
  }},

  async getStudents() {{
    return {{ success: true, message: 'Students retrieved', data: window.__ATTENDX_DATA__.students }};
  }},

  async addStudent(s) {{
    window.__ATTENDX_SAVE__('addStudent', {{ student: s }});
    window.__ATTENDX_DATA__.students.push(s);
    return {{ success: true, message: 'Student added successfully', data: s }};
  }},

  async updateStudent(roll, s) {{
    window.__ATTENDX_SAVE__('updateStudent', {{ student: {{ ...s, roll_no: roll }} }});
    const idx = window.__ATTENDX_DATA__.students.findIndex(x => x.roll_no === roll);
    if (idx !== -1) {{
      window.__ATTENDX_DATA__.students[idx] = {{ ...window.__ATTENDX_DATA__.students[idx], ...s }};
    }}
    return {{ success: true, message: 'Student updated successfully' }};
  }},

  async deleteStudent(roll) {{
    window.__ATTENDX_SAVE__('deleteStudent', {{ roll }});
    window.__ATTENDX_DATA__.students = window.__ATTENDX_DATA__.students.filter(x => x.roll_no !== roll);
    return {{ success: true, message: 'Student deleted successfully' }};
  }},

  async getAttendance(date, section = '') {{
    let targetDate = (typeof date === 'string' && date) ? date : (date && date.date ? date.date : '2026-11-02');
    let targetSec = (typeof section === 'string') ? section : (date && date.section ? date.section : 'all');
    
    const students = window.__ATTENDX_DATA__.students;
    const allAttendance = window.__ATTENDX_DATA__.attendance;
    const dateRecords = allAttendance.filter(r => r.date === targetDate);
    const isRecorded = dateRecords.length > 0;

    let filteredStudents = [...students];
    if (targetSec && targetSec !== 'all' && targetSec !== 'All Sections') {{
      filteredStudents = filteredStudents.filter(s => s.section.toLowerCase() === targetSec.toLowerCase());
    }}

    let present_count = 0, absent_count = 0, late_count = 0;
    const records = filteredStudents.map(s => {{
      const match = dateRecords.find(r => r.roll_no === s.roll_no);
      const status = match ? match.status : 'Present';
      const remarks = match ? match.remarks : 'Regular attendance';

      if (status === 'Present') present_count++;
      else if (status === 'Absent') absent_count++;
      else if (status === 'Late') late_count++;

      return {{
        roll_no: s.roll_no,
        name: s.name,
        section: s.section,
        status: status,
        remarks: remarks
      }};
    }});

    return {{
      success: true,
      message: 'Attendance data retrieved',
      data: {{
        date: targetDate,
        is_recorded: isRecorded,
        total_students: records.length,
        present_count,
        absent_count,
        late_count,
        records: records
      }}
    }};
  }},

  async saveAttendance(date, records) {{
    window.__ATTENDX_SAVE__('saveAttendance', {{ date, records }});
    const existing = window.__ATTENDX_DATA__.attendance.filter(r => r.date !== date);
    records.forEach(r => existing.push({{ date, roll_no: r.roll_no, status: r.status, remarks: r.remarks || '' }}));
    window.__ATTENDX_DATA__.attendance = existing;

    // Recalculate summary KPIs and sections so dashboard reflects new attendance
    const today = '2026-11-02';
    const students = window.__ATTENDX_DATA__.students;
    const todayRecs = window.__ATTENDX_DATA__.attendance.filter(r => r.date === today);
    const pToday = todayRecs.filter(r => r.status === 'Present').length;
    const aToday = todayRecs.filter(r => r.status === 'Absent').length;
    const lToday = todayRecs.filter(r => r.status === 'Late').length;
    const totToday = pToday + aToday + lToday;

    const totPresAll = window.__ATTENDX_DATA__.attendance.filter(r => r.status === 'Present').length;
    const totLateAll = window.__ATTENDX_DATA__.attendance.filter(r => r.status === 'Late').length;
    const totAll = window.__ATTENDX_DATA__.attendance.length;
    const ovPct = totAll > 0 ? ((totPresAll + totLateAll) / totAll * 100.0) : 0.0;

    window.__ATTENDX_DATA__.summary.kpi.present_today = pToday;
    window.__ATTENDX_DATA__.summary.kpi.absent_today = aToday;
    window.__ATTENDX_DATA__.summary.kpi.late_today = lToday;
    window.__ATTENDX_DATA__.summary.kpi.total_today = totToday;
    window.__ATTENDX_DATA__.summary.kpi.present_today_pct = totToday > 0 ? (pToday / totToday * 100.0) : 0.0;
    window.__ATTENDX_DATA__.summary.kpi.absent_today_pct = totToday > 0 ? (aToday / totToday * 100.0) : 0.0;
    window.__ATTENDX_DATA__.summary.kpi.late_today_pct = totToday > 0 ? (lToday / totToday * 100.0) : 0.0;
    window.__ATTENDX_DATA__.summary.kpi.overall_percentage = Number(ovPct.toFixed(1));

    return {{ success: true, message: 'Attendance recorded successfully' }};
  }},

  async getStudentReport(roll) {{
    const student = window.__ATTENDX_DATA__.students.find(s => s.roll_no === roll) || {{ roll_no: roll, name: 'Student', section: 'CS-A' }};
    const history = window.__ATTENDX_DATA__.attendance.filter(r => r.roll_no === roll);
    const total_days = history.length;
    const present_days = history.filter(r => r.status === 'Present').length;
    const absent_days = history.filter(r => r.status === 'Absent').length;
    const late_days = history.filter(r => r.status === 'Late').length;
    const percentage = total_days > 0 ? ((present_days + late_days) / total_days) * 100.0 : 0.0;
    return {{
      success: true,
      data: {{
        student,
        total_days,
        present_days,
        absent_days,
        late_days,
        percentage,
        history
      }}
    }};
  }},

  async getAuditLog() {{
    return {{ success: true, data: [
      {{ timestamp: '2026-11-02 22:30:00', user: 'admin', action: 'User admin active on AttendX dashboard' }},
      {{ timestamp: '2026-11-02 22:01:11', user: 'admin', action: 'User admin logged in successfully (admin)' }}
    ] }};
  }},

  async getUsers() {{
    return {{
      success: true,
      data: window.__ATTENDX_DATA__.users || [
        {{ username: 'admin', role: 'admin' }},
        {{ username: 'teacher', role: 'teacher' }}
      ]
    }};
  }},

  async addUser(username, password, role) {{
    window.__ATTENDX_SAVE__('addUser', {{ username, password, role }});
    if (!window.__ATTENDX_DATA__.users) {{
      window.__ATTENDX_DATA__.users = [{{ username: 'admin', role: 'admin' }}];
    }}
    if (window.__ATTENDX_DATA__.users.some(u => u.username === username)) {{
      throw new Error('Username already exists');
    }}
    const newUser = {{ username, role: role || 'teacher' }};
    window.__ATTENDX_DATA__.users.push(newUser);
    return {{ success: true, message: 'User created successfully', data: newUser }};
  }},

  async deleteUser(username) {{
    window.__ATTENDX_SAVE__('deleteUser', {{ username }});
    if (username === 'admin') {{
      throw new Error('Cannot delete protected root admin account');
    }}
    if (!window.__ATTENDX_DATA__.users) {{
      window.__ATTENDX_DATA__.users = [];
    }}
    window.__ATTENDX_DATA__.users = window.__ATTENDX_DATA__.users.filter(u => u.username !== username);
    return {{ success: true, message: 'User deleted successfully' }};
  }},

  async exportCSV(type = 'attendance') {{
    let csv = '';
    if (type === 'students') {{
      csv = 'roll_no,name,section,email,phone,joined_on\\n' +
        window.__ATTENDX_DATA__.students.map(s => `${{s.roll_no}},"${{s.name}}",${{s.section}},${{s.email}},${{s.phone}},${{s.joined_on}}`).join('\\n');
    }} else {{
      csv = 'date,roll_no,status,remarks\\n' +
        window.__ATTENDX_DATA__.attendance.map(a => `${{a.date}},${{a.roll_no}},${{a.status}},"${{a.remarks}}"`).join('\\n');
    }}
    const blob = new Blob([csv], {{ type: 'text/csv' }});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `attendx_${{type}}_export.csv`;
    link.click();
    return csv;
  }}
}};
</script>
"""

# Replace local script tags with CDN Chart.js & Lucide + inlined logic
scripts_replacement = f"""
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  {mock_api_script}
  <script>
{charts_js_content}
  </script>
  <script>
{app_js_content}
  </script>
"""

# Replace bottom script tags in HTML
old_scripts = """  <script src="js/chart.umd.js"></script>
  <script src="js/lucide.min.js"></script>
  <script src="js/api.js"></script>
  <script src="js/charts.js"></script>
  <script src="js/app.js"></script>"""

if old_scripts in html_bundle:
    html_bundle = html_bundle.replace(old_scripts, scripts_replacement)
else:
    # Fallback tag replacement
    html_bundle = html_bundle.replace('<script src="js/chart.umd.js"></script>', '<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js"></script>')
    html_bundle = html_bundle.replace('<script src="js/lucide.min.js"></script>', '<script src="https://unpkg.com/lucide@latest"></script>' + mock_api_script)
    html_bundle = html_bundle.replace('<script src="js/api.js"></script>', '')
    html_bundle = html_bundle.replace('<script src="js/charts.js"></script>', f'<script>\n{charts_js_content}\n</script>')
    html_bundle = html_bundle.replace('<script src="js/app.js"></script>', f'<script>\n{app_js_content}\n</script>')

# Render AttendX as a Streamlit component so browser actions can be committed by Python.
component = components.declare_component(
    "attendx_app", path=os.path.join(base_dir, "streamlit_component")
)
iframe_action = component(html=html_bundle, default=None, key="attendx_app")
action_nonce = iframe_action.get("nonce") if isinstance(iframe_action, dict) else None
if action_nonce and action_nonce != st.session_state.get("attendx_last_action_nonce"):
    st.session_state["attendx_last_action_nonce"] = action_nonce
    try:
        persist_iframe_action(iframe_action)
    except Exception as exc:
        st.error(f"Could not save AttendX changes: {exc}")
    else:
        st.toast("Changes saved to the AttendX data files.", icon="✅")
        st.rerun()

# Streamlit's embedded website runs in an isolated browser frame. These native
# controls provide durable server-side editing and downloads for the Streamlit
# deployment instead of pretending that iframe memory/localStorage is storage.
st.divider()
st.title("Manage AttendX data")
st.caption("Changes made here are written to the project data files. Each edit creates a timestamped backup.")

students_tab, roles_tab, reports_tab = st.tabs(["Students", "Roles", "Downloads & reports"])

with students_tab:
    student_rows = read_records("students.txt", 6)
    students_by_roll = {row[0]: row for row in student_rows}
    if not students_by_roll:
        st.info("No students found in data/students.txt.")
    else:
        selected_roll = st.selectbox("Student", list(students_by_roll))
        selected = students_by_roll[selected_roll]
        with st.form("edit_student"):
            name = st.text_input("Name", selected[1])
            section = st.text_input("Section", selected[2])
            email = st.text_input("Email", selected[3])
            phone = st.text_input("Phone", selected[4])
            joined_on = st.text_input("Joined on", selected[5])
            submitted = st.form_submit_button("Save student changes", type="primary")
        if submitted:
            if not name.strip() or not section.strip():
                st.error("Name and section are required.")
            else:
                student_rows = [([selected_roll, name.strip(), section.strip(), email.strip(), phone.strip(), joined_on.strip()] if row[0] == selected_roll else row) for row in student_rows]
                write_records("students.txt", student_rows)
                st.success("Student updated and saved to data/students.txt.")
                st.rerun()

with roles_tab:
    user_rows = read_records("users.txt", 3)
    removable = [row[0] for row in user_rows if row[0].lower() != "admin"]
    if not removable:
        st.info("There are no deletable non-admin accounts.")
    else:
        selected_user = st.selectbox("Account to delete", removable)
        if st.button("Delete selected account", type="primary"):
            write_records("users.txt", [row for row in user_rows if row[0] != selected_user])
            st.success(f"Account {selected_user} deleted and saved.")
            st.rerun()
    st.caption("The protected admin account cannot be deleted.")

with reports_tab:
    st.dataframe(reports_for_export, column_config={
        0: "Roll no", 1: "Name", 2: "Section", 3: "Days", 4: "Present", 5: "Absent", 6: "Late", 7: "Attendance %"
    }, use_container_width=True, hide_index=True)
