"""
AttendX – Student Attendance Management System (Streamlit Edition)
Palette:
- AQUAMARINE (#0F3F49) - Primary & Present Attendance
- CONCRETE   (#ECE6DF) - Canvas Background
- BURGUNDY   (#7F0508) - Absent Attendance & Critical Alerts
- WARM AMBER (#D97706) - Late Attendance
"""

import os
from datetime import datetime
import pandas as pd
import streamlit as st
import altair as alt

# 1. Page Configuration
st.set_page_config(
    page_title="AttendX – Student Attendance Management System",
    page_icon="🎓",
    layout="wide",
    initial_sidebar_state="expanded"
)

# 2. Inject Concrete (#ECE6DF) & Aquamarine (#0F3F49) Design System
st.markdown("""
<style>
  /* App Background: CONCRETE (#ECE6DF) */
  .stApp {
    background-color: #ECE6DF !important;
    color: #0F3F49 !important;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  }
  
  /* Sidebar Styling */
  [data-testid="stSidebar"] {
    background-color: #F5EFEB !important;
    border-right: 1px solid #D6CCC0;
  }
  
  /* Headers & Accent Text */
  h1, h2, h3, h4, h5, h6 {
    color: #0F3F49 !important;
    font-weight: 700 !important;
  }
  
  /* Metric Card Styling */
  [data-testid="stMetric"] {
    background: #FFFFFF !important;
    border: 1px solid #D6CCC0 !important;
    border-radius: 12px !important;
    padding: 16px 20px !important;
    box-shadow: 0 2px 6px rgba(15, 63, 73, 0.05) !important;
  }
  [data-testid="stMetricValue"] {
    color: #0F3F49 !important;
    font-weight: 800 !important;
    font-size: 2.1rem !important;
  }
  [data-testid="stMetricLabel"] {
    color: #5F7A80 !important;
    font-size: 0.825rem !important;
    font-weight: 700 !important;
    text-transform: uppercase !important;
    letter-spacing: 0.05em !important;
  }
  
  /* Card Container */
  .attendx-card {
    background: #FFFFFF;
    border: 1px solid #D6CCC0;
    border-radius: 12px;
    padding: 20px;
    box-shadow: 0 2px 8px rgba(15, 63, 73, 0.04);
    margin-bottom: 20px;
  }
  
  /* Badges */
  .badge-present {
    background: rgba(15, 63, 73, 0.12);
    color: #0F3F49;
    padding: 4px 10px;
    border-radius: 9999px;
    font-weight: 700;
    font-size: 0.8rem;
    border: 1px solid rgba(15, 63, 73, 0.3);
  }
  .badge-absent {
    background: rgba(127, 5, 8, 0.12);
    color: #7F0508;
    padding: 4px 10px;
    border-radius: 9999px;
    font-weight: 700;
    font-size: 0.8rem;
    border: 1px solid rgba(127, 5, 8, 0.3);
  }
  .badge-late {
    background: rgba(217, 119, 6, 0.12);
    color: #B45309;
    padding: 4px 10px;
    border-radius: 9999px;
    font-weight: 700;
    font-size: 0.8rem;
    border: 1px solid rgba(217, 119, 6, 0.3);
  }
  
  /* Buttons */
  .stButton > button {
    background-color: #0F3F49 !important;
    color: #ECE6DF !important;
    border: none !important;
    border-radius: 8px !important;
    font-weight: 600 !important;
    padding: 8px 18px !important;
    transition: all 0.2s ease !important;
  }
  .stButton > button:hover {
    background-color: #165664 !important;
    transform: translateY(-1px);
    box-shadow: 0 4px 10px rgba(15, 63, 73, 0.25) !important;
  }
  
  /* Tabs */
  .stTabs [data-baseweb="tab-list"] {
    gap: 8px;
    background-color: #E7DFD5;
    padding: 6px;
    border-radius: 10px;
  }
  .stTabs [data-baseweb="tab"] {
    border-radius: 8px;
    color: #0F3F49;
    font-weight: 600;
  }
  .stTabs [aria-selected="true"] {
    background-color: #FFFFFF !important;
    color: #0F3F49 !important;
    box-shadow: 0 2px 4px rgba(15, 63, 73, 0.08);
  }
</style>
""", unsafe_allow_html=True)

# 3. File Paths for Standard C Persistence
STUDENTS_FILE = os.path.join("data", "students.txt")
ATTENDANCE_FILE = os.path.join("data", "attendance.txt")
AUDIT_FILE = os.path.join("data", "audit_log.txt")

# Helper: Load Students from C flatfile
@st.cache_data(ttl=5)
def load_students():
    if not os.path.exists(STUDENTS_FILE):
        return pd.DataFrame(columns=["roll_no", "name", "section", "email", "phone", "joined_on"])
    records = []
    with open(STUDENTS_FILE, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            parts = line.split("|")
            if len(parts) >= 6:
                records.append({
                    "roll_no": parts[0],
                    "name": parts[1],
                    "section": parts[2],
                    "email": parts[3],
                    "phone": parts[4],
                    "joined_on": parts[5]
                })
    return pd.DataFrame(records)

# Helper: Load Attendance from C flatfile
@st.cache_data(ttl=5)
def load_attendance():
    if not os.path.exists(ATTENDANCE_FILE):
        return pd.DataFrame(columns=["date", "roll_no", "status", "remarks"])
    records = []
    with open(ATTENDANCE_FILE, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            parts = line.split("|")
            if len(parts) >= 4:
                records.append({
                    "date": parts[0],
                    "roll_no": parts[1],
                    "status": parts[2],
                    "remarks": parts[3]
                })
    return pd.DataFrame(records)

# Helper: Save Batch Attendance
def save_attendance_batch(records_to_save, target_date):
    existing = []
    if os.path.exists(ATTENDANCE_FILE):
        with open(ATTENDANCE_FILE, "r", encoding="utf-8") as f:
            for line in f:
                l = line.strip()
                if not l:
                    continue
                parts = l.split("|")
                # Exclude records for target date being updated
                if len(parts) >= 4 and parts[0] != target_date:
                    existing.append(l)
    
    # Append new records
    for r in records_to_save:
        existing.append(f"{r['date']}|{r['roll_no']}|{r['status']}|{r['remarks']}")
    
    with open(ATTENDANCE_FILE, "w", encoding="utf-8") as f:
        for item in existing:
            f.write(item + "\n")
            
    # Audit log
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with open(AUDIT_FILE, "a", encoding="utf-8") as f:
        f.write(f"{now_str}|streamlit_user|Recorded attendance batch for date {target_date} ({len(records_to_save)} records)\n")

# Load Data
df_students = load_students()
df_attendance = load_attendance()

# Compute Key Statistics with 1-decimal precision
total_students = len(df_students)
dates = sorted(df_attendance["date"].unique()) if not df_attendance.empty else []
today_date = "2026-11-02" if "2026-11-02" in dates else (dates[-1] if dates else datetime.now().strftime("%Y-%m-%d"))

df_today = df_attendance[df_attendance["date"] == today_date] if not df_attendance.empty else pd.DataFrame()
present_today = len(df_today[df_today["status"] == "Present"])
absent_today = len(df_today[df_today["status"] == "Absent"])
late_today = len(df_today[df_today["status"] == "Late"])
total_marked_today = present_today + absent_today + late_today

# Accurate Overall percentage
total_records = len(df_attendance)
total_present_all = len(df_attendance[df_attendance["status"] == "Present"])
total_late_all = len(df_attendance[df_attendance["status"] == "Late"])
overall_rate = ((total_present_all + total_late_all) / total_records * 100.0) if total_records > 0 else 0.0

# Sidebar Brand
with st.sidebar:
    st.markdown("""
    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 20px;">
      <div style="width: 40px; height: 40px; background: #0F3F49; color: #ECE6DF; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 1.3rem;">A</div>
      <div>
        <div style="font-size: 1.25rem; font-weight: 800; color: #0F3F49;">AttendX</div>
        <div style="font-size: 0.72rem; color: #5F7A80; font-weight: 600;">PURE C FLATFILE BACKEND</div>
      </div>
    </div>
    """, unsafe_allow_html=True)
    
    st.markdown("---")
    nav = st.radio("Navigation", ["📊 Dashboard", "👥 Students Directory", "📝 Mark Attendance", "📈 Analytics & Reports", "⚙️ C Engine Viva Notes"], label_visibility="collapsed")
    
    st.markdown("---")
    st.markdown(f"""
    **Session Information**  
    - **Active Date**: `{today_date}`  
    - **Total Enrolled**: `{total_students}`  
    - **C Flatfile Storage**: `data/*.txt`  
    """)

# =========================================================================
# TAB 1: DASHBOARD
# =========================================================================
if nav == "📊 Dashboard":
    st.title("Dashboard Overview")
    st.caption("Live monitoring of cohort attendance trajectory powered by C standard file I/O.")
    
    # KPI Grid
    col1, col2, col3, col4 = st.columns(4)
    with col1:
        st.metric("Total Enrolled", f"{total_students}", "Active flatfile records")
    with col2:
        pres_pct = (present_today / total_students * 100.0) if total_students > 0 else 0.0
        st.metric("Present Today", f"{present_today}", f"{pres_pct:.1f}% of cohort")
    with col3:
        abs_pct = (absent_today / total_students * 100.0) if total_students > 0 else 0.0
        st.metric("Absent Today", f"{absent_today}", f"-{abs_pct:.1f}% cohort loss", delta_color="inverse")
    with col4:
        st.metric("Overall Rate", f"{overall_rate:.1f}%", "30-day aggregate")
        
    st.markdown("<br>", unsafe_allow_html=True)
    
    # Charts Row
    chart_col1, chart_col2 = st.columns([2, 1])
    
    with chart_col1:
        st.markdown("### 📈 Attendance Trend (Dual Trajectory)")
        if not df_attendance.empty:
            # Aggregate per date
            trend_data = []
            for d in dates[-14:]:
                sub = df_attendance[df_attendance["date"] == d]
                tot = len(sub)
                p = len(sub[sub["status"] == "Present"])
                a = len(sub[sub["status"] == "Absent"])
                trend_data.append({
                    "Date": d[5:],
                    "Present Rate (%)": round((p / tot * 100.0), 1) if tot > 0 else 0.0,
                    "Absent Rate (%)": round((a / tot * 100.0), 1) if tot > 0 else 0.0
                })
            df_trend = pd.DataFrame(trend_data)
            
            # Altair chart with reference colors: Aquamarine (#0F3F49) & Burgundy (#7F0508)
            df_melted = df_trend.melt("Date", var_name="Metric", value_name="Percentage")
            color_scale = alt.Scale(domain=["Present Rate (%)", "Absent Rate (%)"], range=["#0F3F49", "#7F0508"])
            
            line_chart = alt.Chart(df_melted).mark_line(point=True, strokeWidth=2.5).encode(
                x=alt.X("Date:N", title="Calendar Date"),
                y=alt.Y("Percentage:Q", title="Rate (%)", scale=alt.Scale(domain=[0, 100])),
                color=alt.Color("Metric:N", scale=color_scale),
                tooltip=["Date", "Metric", "Percentage"]
            ).properties(height=320)
            
            st.altair_chart(line_chart, use_container_width=True)
        else:
            st.info("No attendance records found.")
            
    with chart_col2:
        st.markdown(f"### 🎯 Today's Breakdown ({today_date})")
        if total_marked_today > 0:
            donut_data = pd.DataFrame([
                {"Status": "Present", "Count": present_today},
                {"Status": "Absent", "Count": absent_today},
                {"Status": "Late", "Count": late_today}
            ])
            donut_scale = alt.Scale(domain=["Present", "Absent", "Late"], range=["#0F3F49", "#7F0508", "#D97706"])
            donut = alt.Chart(donut_data).mark_arc(innerRadius=65).encode(
                theta=alt.Theta("Count:Q"),
                color=alt.Color("Status:N", scale=donut_scale),
                tooltip=["Status", "Count"]
            ).properties(height=320)
            st.altair_chart(donut, use_container_width=True)
        else:
            st.info("No sessions recorded for today.")

    # Section-Wise Performance Row
    st.markdown("### 🏛️ Section-Wise Performance (Present vs Absent)")
    if not df_students.empty and not df_attendance.empty:
        df_merged = df_attendance.merge(df_students, on="roll_no")
        sec_summary = []
        for sec in sorted(df_students["section"].unique()):
            sec_recs = df_merged[df_merged["section"] == sec]
            s_tot = len(sec_recs)
            s_p = len(sec_recs[sec_recs["status"] == "Present"])
            s_a = len(sec_recs[sec_recs["status"] == "Absent"])
            sec_summary.append({"Section": sec, "Status": "Present (%)", "Percentage": round((s_p / s_tot * 100.0), 1) if s_tot > 0 else 0})
            sec_summary.append({"Section": sec, "Status": "Absent (%)", "Percentage": round((s_a / s_tot * 100.0), 1) if s_tot > 0 else 0})
            
        df_sec = pd.DataFrame(sec_summary)
        sec_scale = alt.Scale(domain=["Present (%)", "Absent (%)"], range=["#0F3F49", "#7F0508"])
        sec_bar = alt.Chart(df_sec).mark_bar(cornerRadius=4).encode(
            x=alt.X("Section:N", title="Academic Section"),
            y=alt.Y("Percentage:Q", title="Percentage (%)", scale=alt.Scale(domain=[0, 100])),
            color=alt.Color("Status:N", scale=sec_scale),
            xOffset="Status:N",
            tooltip=["Section", "Status", "Percentage"]
        ).properties(height=260)
        st.altair_chart(sec_bar, use_container_width=True)

# =========================================================================
# TAB 2: STUDENTS DIRECTORY
# =========================================================================
elif nav == "👥 Students Directory":
    st.title("Student Directory")
    st.caption("Active students stored in pipe-delimited C flatfile (`data/students.txt`).")
    
    col_s1, col_s2 = st.columns([3, 1])
    with col_s1:
        search = st.text_input("🔍 Search by Name or Roll No", "")
    with col_s2:
        sec_filter = st.selectbox("Filter Section", ["All Sections"] + sorted(df_students["section"].unique().tolist()))
        
    filtered_df = df_students.copy()
    if search:
        filtered_df = filtered_df[filtered_df["name"].str.contains(search, case=False) | filtered_df["roll_no"].str.contains(search, case=False)]
    if sec_filter != "All Sections":
        filtered_df = filtered_df[filtered_df["section"] == sec_filter]
        
    st.dataframe(
        filtered_df,
        column_config={
            "roll_no": "Roll No",
            "name": "Full Name",
            "section": "Section",
            "email": "Email Address",
            "phone": "Contact Phone",
            "joined_on": "Enrollment Date"
        },
        use_container_width=True,
        hide_index=True
    )
    
    st.markdown("### 📋 Student Profile Inspector")
    selected_roll = st.selectbox("Select Student to Inspect Profile & Heatmap:", df_students["roll_no"].tolist())
    if selected_roll:
        s_info = df_students[df_students["roll_no"] == selected_roll].iloc[0]
        s_att = df_attendance[df_attendance["roll_no"] == selected_roll]
        s_tot = len(s_att)
        s_pres = len(s_att[s_att["status"] == "Present"])
        s_abs = len(s_att[s_att["status"] == "Absent"])
        s_late = len(s_att[s_att["status"] == "Late"])
        s_pct = ((s_pres + s_late) / s_tot * 100.0) if s_tot > 0 else 0.0
        
        pcol1, pcol2, pcol3, pcol4 = st.columns(4)
        pcol1.metric("Student Name", s_info["name"], f"Roll: {selected_roll}")
        pcol2.metric("Attendance Rate", f"{s_pct:.1f}%", "Eligible" if s_pct >= 75 else "At Risk (<75%)", delta_color="normal" if s_pct >= 75 else "inverse")
        pcol3.metric("Present / Total", f"{s_pres} / {s_tot} days")
        pcol4.metric("Absent / Late", f"{s_abs} Abs, {s_late} Late")
        
        st.markdown("**Recent Attendance History:**")
        st.dataframe(s_att.tail(10)[["date", "status", "remarks"]], hide_index=True, use_container_width=True)

# =========================================================================
# TAB 3: MARK ATTENDANCE
# =========================================================================
elif nav == "📝 Mark Attendance":
    st.title("Mark Daily Attendance")
    st.caption("Writes atomic batches directly to `data/attendance.txt` preserving pipe delimiter format.")
    
    col_m1, col_m2 = st.columns([2, 2])
    with col_m1:
        selected_date = st.date_input("Attendance Date", datetime.now()).strftime("%Y-%m-%d")
    with col_m2:
        mark_sec = st.selectbox("Section", ["All Sections"] + sorted(df_students["section"].unique().tolist()))
        
    students_to_mark = df_students.copy()
    if mark_sec != "All Sections":
        students_to_mark = students_to_mark[students_to_mark["section"] == mark_sec]
        
    existing_att = df_attendance[df_attendance["date"] == selected_date].set_index("roll_no")["status"].to_dict()
    
    st.markdown(f"**Marking {len(students_to_mark)} students for {selected_date}:**")
    
    mark_form = st.form(key="mark_attendance_form")
    records_to_commit = []
    
    with mark_form:
        for idx, row in students_to_mark.iterrows():
            rcol1, rcol2, rcol3 = st.columns([2, 2, 3])
            rcol1.write(f"**{row['name']}** ({row['roll_no']})")
            current_st = existing_att.get(row['roll_no'], "Present")
            status_val = rcol2.selectbox(f"Status for {row['roll_no']}", ["Present", "Absent", "Late"], index=["Present", "Absent", "Late"].index(current_st), key=f"st_{row['roll_no']}", label_visibility="collapsed")
            remark_val = rcol3.text_input(f"Remarks for {row['roll_no']}", "Regular attendance", key=f"rem_{row['roll_no']}", label_visibility="collapsed")
            records_to_commit.append({
                "date": selected_date,
                "roll_no": row["roll_no"],
                "status": status_val,
                "remarks": remark_val
            })
            
        submitted = st.form_submit_button("💾 Save Attendance to C Flatfile")
        if submitted:
            save_attendance_batch(records_to_commit, selected_date)
            st.success(f"Attendance recorded for {len(records_to_commit)} students on {selected_date}!")
            st.cache_data.clear()
            st.rerun()

# =========================================================================
# TAB 4: ANALYTICS & REPORTS
# =========================================================================
elif nav == "📈 Analytics & Reports":
    st.title("Attendance Analytics & Reports")
    st.caption("Mathematical summary and cohort metrics with exact floating-point accuracy.")
    
    # Calculate student stats
    report_rows = []
    for _, s in df_students.iterrows():
        s_att = df_attendance[df_attendance["roll_no"] == s["roll_no"]]
        tot = len(s_att)
        p = len(s_att[s_att["status"] == "Present"])
        a = len(s_att[s_att["status"] == "Absent"])
        l = len(s_att[s_att["status"] == "Late"])
        pct = ((p + l) / tot * 100.0) if tot > 0 else 0.0
        report_rows.append({
            "Roll No": s["roll_no"],
            "Name": s["name"],
            "Section": s["section"],
            "Total Sessions": tot,
            "Present": p,
            "Absent": a,
            "Late": l,
            "Attendance Rate (%)": round(pct, 1),
            "Status": "Good Standing" if pct >= 75 else "Warning (<75%)"
        })
    df_rep = pd.DataFrame(report_rows)
    
    st.dataframe(df_rep, use_container_width=True, hide_index=True)
    
    csv_bytes = df_rep.to_csv(index=False).encode('utf-8')
    st.download_button(
        label="📥 Export Report as CSV",
        data=csv_bytes,
        file_name=f"attendx_report_{today_date}.csv",
        mime="text/csv"
    )

# =========================================================================
# TAB 5: VIVA & ARCHITECTURE NOTES
# =========================================================================
elif nav == "⚙️ C Engine Viva Notes":
    st.title("C Backend & Architecture Notes (Viva Ready)")
    
    st.markdown("""
    ### 🏛️ System Architecture Overview
    - **C HTTP Engine**: Mongoose embedded web server (`src/server.c`, `lib/mongoose.c`).
    - **JSON Parsing**: Ultra-lightweight cJSON library (`lib/cJSON.c`).
    - **Data Persistence**: Standard C file handling (`fopen`, `fclose`, `fgets`, `fprintf`, `fread`, `fwrite`).
    - **Safe Atomic Operations**: Writes to temporary file (`data/*_tmp.txt`), takes a binary backup in `/backups`, and calls `rename()` to guarantee atomic state changes.
    - **Password Security**: FIPS 180-2 SHA-256 with custom salt (`utils.c`).
    
    ```c
    // Core file handling pattern in file_handler.c:
    FILE *src = fopen("data/attendance.txt", "r");
    FILE *dst = fopen("data/attendance_tmp.txt", "w");
    // ... write modified records ...
    fclose(src);
    fclose(dst);
    remove("data/attendance.txt");
    rename("data/attendance_tmp.txt", "data/attendance.txt");
    ```
    """)
