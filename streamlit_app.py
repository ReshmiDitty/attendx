import os
import json
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
    height: 100vh !important;
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
            {"roll_no": "CS201", "name": "Ishaan Roy", "section": "CS-B", "email": "ishaan.roy@attendx.edu", "phone": "+91 98765 43220", "joined_on": "2026-08-01"},
            {"roll_no": "CS202", "name": "Sneha Nair", "section": "CS-B", "email": "sneha.nair@attendx.edu", "phone": "+91 98765 43221", "joined_on": "2026-08-01"},
            {"roll_no": "CS203", "name": "Vikram Malhotra", "section": "CS-B", "email": "vikram.m@attendx.edu", "phone": "+91 98765 43222", "joined_on": "2026-08-01"},
            {"roll_no": "CS204", "name": "Pooja Reddy", "section": "CS-B", "email": "pooja.reddy@attendx.edu", "phone": "+91 98765 43223", "joined_on": "2026-08-01"},
            {"roll_no": "CS205", "name": "Aditya Joshi", "section": "CS-B", "email": "aditya.j@attendx.edu", "phone": "+91 98765 43224", "joined_on": "2026-08-01"},
            {"roll_no": "IT301", "name": "Meera Kulkarni", "section": "IT-A", "email": "meera.k@attendx.edu", "phone": "+91 98765 43230", "joined_on": "2026-08-01"},
            {"roll_no": "IT302", "name": "Devendra Sen", "section": "IT-A", "email": "dev.sen@attendx.edu", "phone": "+91 98765 43231", "joined_on": "2026-08-01"},
            {"roll_no": "IT303", "name": "Tanya Gupta", "section": "IT-A", "email": "tanya.gupta@attendx.edu", "phone": "+91 98765 43232", "joined_on": "2026-08-01"},
            {"roll_no": "IT304", "name": "Farhan Sheikh", "section": "IT-A", "email": "farhan.s@attendx.edu", "phone": "+91 98765 43233", "joined_on": "2026-08-01"},
            {"roll_no": "IT305", "name": "Rhea D'Souza", "section": "IT-A", "email": "rhea.dsouza@attendx.edu", "phone": "+91 98765 43234", "joined_on": "2026-08-01"}
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

    return {
        "students": students,
        "attendance": attendance,
        "summary": summary
    }

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

# Inject CSS directly into the HTML head
html_bundle = html_template.replace(
    '<link rel="stylesheet" href="css/style.css">',
    f'<style>\n{css_content}\n</style>'
)

# Inline client-side mock API that resolves from project_data
mock_api_script = f"""
<script>
window.__ATTENDX_DATA__ = {data_json};

// Pre-authenticate as admin so dashboard loads immediately
if (!localStorage.getItem('attendx_auth_token')) {{
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
    this.setToken('session_' + Date.now());
    this.setUser(user);
    return {{ success: true, message: 'Logged in successfully', data: {{ token: this.getToken(), user }} }};
  }},

  async logout() {{
    this.setToken(null);
    this.setUser(null);
    window.location.reload();
  }},

  async getSummary() {{
    return {{ success: true, message: 'Summary loaded', data: window.__ATTENDX_DATA__.summary }};
  }},

  async getStudents() {{
    return {{ success: true, message: 'Students retrieved', data: window.__ATTENDX_DATA__.students }};
  }},

  async addStudent(s) {{
    window.__ATTENDX_DATA__.students.push(s);
    return {{ success: true, message: 'Student added successfully', data: s }};
  }},

  async updateStudent(roll, s) {{
    const idx = window.__ATTENDX_DATA__.students.findIndex(x => x.roll_no === roll);
    if (idx !== -1) {{
      window.__ATTENDX_DATA__.students[idx] = {{ ...window.__ATTENDX_DATA__.students[idx], ...s }};
    }}
    return {{ success: true, message: 'Student updated successfully' }};
  }},

  async deleteStudent(roll) {{
    window.__ATTENDX_DATA__.students = window.__ATTENDX_DATA__.students.filter(x => x.roll_no !== roll);
    return {{ success: true, message: 'Student deleted successfully' }};
  }},

  async getAttendance(params = {{}}) {{
    let list = [...window.__ATTENDX_DATA__.attendance];
    if (params.date) list = list.filter(r => r.date === params.date);
    if (params.roll_no) list = list.filter(r => r.roll_no === params.roll_no);
    return {{ success: true, data: list }};
  }},

  async saveAttendance(date, records) {{
    const existing = window.__ATTENDX_DATA__.attendance.filter(r => r.date !== date);
    records.forEach(r => existing.push({{ date, roll_no: r.roll_no, status: r.status, remarks: r.remarks || '' }}));
    window.__ATTENDX_DATA__.attendance = existing;
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
      data: [
        {{ username: 'admin', role: 'admin' }},
        {{ username: 'teacher', role: 'teacher' }}
      ]
    }};
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

# Render the exact AttendX website natively inside Streamlit
components.html(html_bundle, height=1050, scrolling=True)
