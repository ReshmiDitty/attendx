/**
 * AttendX - Core Frontend Application
 * Handles routing, view rendering, state, events, modals, and charts
 */

const App = {
  state: {
    currentPage: 'dashboard',
    user: null,
    summaryData: null,
    trendDays: 7,

    // Students state
    students: [],
    studentsFiltered: [],
    studentSearch: '',
    studentSectionFilter: 'all',
    studentSortCol: 'roll_no',
    studentSortAsc: true,
    studentPage: 1,
    studentPageSize: 10,

    // Attendance marking state
    attendanceDate: '',
    attendanceSection: 'all',
    attendanceList: [], // array of { roll_no, name, section, status, remarks }
    isAttendanceRecorded: false,

    // Reports state
    reportsList: [],
    reportSectionFilter: 'all',
    reportSearch: ''
  },

  init() {
    this.initTheme();
    this.initAuth();
    this.bindEvents();

    if (API.isAuthenticated()) {
      this.state.user = API.getUser();
      this.updateUserUI();
      this.showApp();
      this.navigateTo('dashboard');
    } else {
      this.showLogin();
    }
  },

  /* =========================================================================
   * Theme Management (Light / Dark)
   * ========================================================================= */
  initTheme() {
    const savedTheme = localStorage.getItem('attendx_theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    this.updateThemeButton(savedTheme);
  },

  toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('attendx_theme', next);
    this.updateThemeButton(next);

    // Re-render charts with new theme colors
    if (this.state.currentPage === 'dashboard' && this.state.summaryData) {
      this.renderDashboardCharts();
    }
  },

  updateThemeButton(theme) {
    const btn = document.getElementById('theme-toggle-btn');
    if (!btn) return;
    btn.innerHTML = theme === 'dark'
      ? '<i data-lucide="sun"></i>'
      : '<i data-lucide="moon"></i>';
    if (window.lucide) window.lucide.createIcons();
  },

  /* =========================================================================
   * Authentication & View Switching
   * ========================================================================= */
  initAuth() {
    window.addEventListener('attendx:unauthorized', () => {
      this.showToast('Session expired. Please log in again.', 'error');
      this.showLogin();
    });
  },

  showLogin() {
    document.getElementById('login-view').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
  },

  showApp() {
    document.getElementById('login-view').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
  },

  updateUserUI() {
    const u = this.state.user || { username: 'Guest', role: 'teacher' };
    const nameEl = document.getElementById('sidebar-user-name');
    const roleEl = document.getElementById('sidebar-user-role');
    const avatarEl = document.getElementById('sidebar-user-avatar');

    if (nameEl) nameEl.textContent = u.username;
    if (roleEl) roleEl.textContent = u.role.toUpperCase();
    if (avatarEl) avatarEl.textContent = u.username.charAt(0).toUpperCase();

    // Hide admin-only menu items for teacher role
    const adminNav = document.getElementById('nav-settings');
    if (adminNav) {
      adminNav.style.display = (u.role === 'admin') ? 'flex' : 'none';
    }
  },

  async handleLogin(username, password) {
    try {
      const res = await API.login(username, password);
      this.state.user = res.data.user;
      this.updateUserUI();
      this.showApp();
      this.navigateTo('dashboard');
      this.showToast(`Welcome back, ${this.state.user.username}!`, 'success');
    } catch (err) {
      this.showToast(err.message || 'Login failed', 'error');
    }
  },

  async handleLogout() {
    await API.logout();
    this.showToast('You have been logged out', 'info');
  },

  /* =========================================================================
   * Navigation & Routing
   * ========================================================================= */
  navigateTo(page) {
    this.state.currentPage = page;

    // Update sidebar active link
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.toggle('active', link.dataset.page === page);
    });

    // Update view containers
    document.querySelectorAll('.page-view').forEach(view => {
      view.classList.toggle('active', view.id === `page-${page}`);
    });

    // Update topbar breadcrumb
    const breadcrumb = document.getElementById('page-title');
    if (breadcrumb) {
      const titles = {
        dashboard: 'Dashboard Overview',
        students: 'Student Directory',
        attendance: 'Mark Attendance',
        reports: 'Attendance Analytics & Reports',
        settings: 'System & Admin Settings'
      };
      breadcrumb.textContent = titles[page] || page;
    }

    // Close mobile sidebar if open
    document.querySelector('.sidebar')?.classList.remove('open');

    // Trigger page load handler
    switch (page) {
      case 'dashboard': this.loadDashboard(); break;
      case 'students': this.loadStudents(); break;
      case 'attendance': this.loadAttendancePage(); break;
      case 'reports': this.loadReports(); break;
      case 'settings': this.loadSettings(); break;
    }

    if (window.lucide) window.lucide.createIcons();
  },

  /* =========================================================================
   * Dashboard View
   * ========================================================================= */
  async loadDashboard() {
    try {
      const res = await API.getSummary();
      this.state.summaryData = res.data;
      const kpi = res.data.kpi || {};

      // Animate KPI numbers with exact 1-decimal precision
      this.animateCount('kpi-total-students', kpi.total_students || 0);
      this.animateCount('kpi-present-today', kpi.present_today || 0);
      this.animateCount('kpi-absent-today', kpi.absent_today || 0);
      this.animateCount('kpi-overall-rate', Number(kpi.overall_percentage || 0), '%', 1);

      // Enhance KPI subtext with precise cohort percentages
      const presentEl = document.getElementById('kpi-present-today');
      if (presentEl && presentEl.parentElement) {
        const sub = presentEl.parentElement.querySelector('.kpi-subtext');
        if (sub) {
          const pct = (kpi.present_today_pct !== undefined)
            ? kpi.present_today_pct
            : (kpi.total_students ? ((kpi.present_today || 0) / kpi.total_students) * 100 : 0);
          sub.innerHTML = `<span style="color: var(--success); font-weight: 600;">${pct.toFixed(1)}%</span> of enrolled cohort`;
        }
      }

      const absentEl = document.getElementById('kpi-absent-today');
      if (absentEl && absentEl.parentElement) {
        const sub = absentEl.parentElement.querySelector('.kpi-subtext');
        if (sub) {
          const pct = (kpi.absent_today_pct !== undefined)
            ? kpi.absent_today_pct
            : (kpi.total_students ? ((kpi.absent_today || 0) / kpi.total_students) * 100 : 0);
          sub.innerHTML = `<span style="color: var(--danger); font-weight: 600;">${pct.toFixed(1)}%</span> of enrolled cohort`;
        }
      }

      this.renderDashboardCharts();
      this.renderLowAttendanceAlerts(res.data.low_attendance_alerts || []);
      this.renderActivityFeed(res.data.activity_feed || []);
    } catch (err) {
      this.showToast('Failed to load dashboard data', 'error');
    }
  },

  renderDashboardCharts() {
    if (!this.state.summaryData) return;
    const { trend, sections, kpi } = this.state.summaryData;

    // 1. Trend chart
    Charts.renderTrendChart('trend-chart', trend, this.state.trendDays);

    // 2. Section chart
    Charts.renderSectionChart('section-chart', sections);

    // 3. Doughnut chart
    Charts.renderDoughnutChart('doughnut-chart', kpi.present_today, kpi.absent_today, kpi.late_today);
  },

  renderLowAttendanceAlerts(alerts) {
    const container = document.getElementById('low-attendance-container');
    if (!container) return;

    if (!alerts || alerts.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding: 1.5rem;">
          <i data-lucide="check-circle" style="color: var(--success); font-size: 2rem;"></i>
          <p style="font-size: 0.9rem; margin-top: 0.5rem;">All students are maintaining healthy attendance (≥ 75%)</p>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    let html = '<div style="display: flex; flex-direction: column; gap: 0.75rem;">';
    alerts.forEach(s => {
      html += `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem; border-radius: var(--radius-md); background: var(--bg-subtle); border: 1px solid var(--border-color);">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <div class="student-avatar" style="background: var(--danger); font-size: 0.75rem;">${s.name.charAt(0)}</div>
            <div>
              <div style="font-weight: 600; font-size: 0.875rem;">${this.escapeHtml(s.name)}</div>
              <div style="font-size: 0.75rem; color: var(--text-muted);">${s.roll_no} • ${s.section}</div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <span class="badge badge-critical">${s.percentage.toFixed(1)}%</span>
            <button class="btn btn-secondary btn-sm" onclick="App.viewStudentProfile('${s.roll_no}')">
              View Profile
            </button>
          </div>
        </div>
      `;
    });
    html += '</div>';
    container.innerHTML = html;
    if (window.lucide) window.lucide.createIcons();
  },

  renderActivityFeed(feed) {
    const container = document.getElementById('activity-feed-container');
    if (!container) return;

    if (!feed || feed.length === 0) {
      container.innerHTML = '<div class="empty-state" style="padding: 1.5rem;">No recent activities logged</div>';
      return;
    }

    let html = '<div class="activity-feed">';
    feed.forEach(item => {
      html += `
        <div class="activity-item">
          <div class="activity-dot"></div>
          <div class="activity-details">
            <div class="activity-text">${this.escapeHtml(item.action)}</div>
            <div class="activity-time">${this.escapeHtml(item.timestamp)} by <b>${this.escapeHtml(item.user)}</b></div>
          </div>
        </div>
      `;
    });
    html += '</div>';
    container.innerHTML = html;
  },

  setTrendDays(days) {
    this.state.trendDays = days;
    document.querySelectorAll('.btn-trend-toggle').forEach(btn => {
      btn.classList.toggle('btn-primary', parseInt(btn.dataset.days) === days);
      btn.classList.toggle('btn-secondary', parseInt(btn.dataset.days) !== days);
    });
    this.renderDashboardCharts();
  },

  /* =========================================================================
   * Students Management View
   * ========================================================================= */
  async loadStudents() {
    try {
      const res = await API.getStudents();
      this.state.students = res.data || [];
      this.filterAndRenderStudents();
      this.populateSectionDropdowns();
    } catch (err) {
      this.showToast('Failed to load students directory', 'error');
    }
  },

  populateSectionDropdowns() {
    const sections = Array.from(new Set(this.state.students.map(s => s.section))).filter(Boolean);
    const selects = [
      document.getElementById('students-section-filter'),
      document.getElementById('mark-section-select'),
      document.getElementById('reports-section-filter')
    ];

    selects.forEach(select => {
      if (!select) return;
      const currentVal = select.value;
      let html = '<option value="all">All Sections</option>';
      sections.forEach(sec => {
        html += `<option value="${sec}">${sec}</option>`;
      });
      select.innerHTML = html;
      if (sections.includes(currentVal)) select.value = currentVal;
    });
  },

  filterAndRenderStudents() {
    let list = [...this.state.students];

    // Section filter
    if (this.state.studentSectionFilter !== 'all') {
      list = list.filter(s => s.section === this.state.studentSectionFilter);
    }

    // Search query (name, roll, email)
    if (this.state.studentSearch) {
      const q = this.state.studentSearch.toLowerCase();
      list = list.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.roll_no.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q)
      );
    }

    // Sorting
    const col = this.state.studentSortCol;
    const asc = this.state.studentSortAsc;
    list.sort((a, b) => {
      const valA = (a[col] || '').toString().toLowerCase();
      const valB = (b[col] || '').toString().toLowerCase();
      return asc ? valA.localeCompare(valB) : valB.localeCompare(valA);
    });

    this.state.studentsFiltered = list;
    this.renderStudentsTable();
  },

  sortStudents(column) {
    if (this.state.studentSortCol === column) {
      this.state.studentSortAsc = !this.state.studentSortAsc;
    } else {
      this.state.studentSortCol = column;
      this.state.studentSortAsc = true;
    }
    this.filterAndRenderStudents();
  },

  renderStudentsTable() {
    const tbody = document.getElementById('students-table-body');
    const paginationEl = document.getElementById('students-pagination');
    if (!tbody) return;

    const list = this.state.studentsFiltered;
    const total = list.length;
    const pageSize = this.state.studentPageSize;
    const totalPages = Math.ceil(total / pageSize) || 1;

    if (this.state.studentPage > totalPages) this.state.studentPage = totalPages;
    if (this.state.studentPage < 1) this.state.studentPage = 1;

    const start = (this.state.studentPage - 1) * pageSize;
    const pageItems = list.slice(start, start + pageSize);

    if (pageItems.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7">
            <div class="empty-state">
              <i data-lucide="users"></i>
              <h3>No students found</h3>
              <p>Try clearing your search filters or click "Add Student" above.</p>
            </div>
          </td>
        </tr>
      `;
      if (paginationEl) paginationEl.innerHTML = '';
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    const isAdmin = this.state.user && this.state.user.role === 'admin';

    let html = '';
    pageItems.forEach(s => {
      html += `
        <tr>
          <td><span class="student-roll">${this.escapeHtml(s.roll_no)}</span></td>
          <td>
            <div class="student-meta">
              <div class="student-avatar">${s.name.charAt(0)}</div>
              <div class="student-info-text">
                <span class="student-name">${this.escapeHtml(s.name)}</span>
                <span style="font-size: 0.75rem; color: var(--text-muted);">${this.escapeHtml(s.email || 'No email')}</span>
              </div>
            </div>
          </td>
          <td><span class="badge badge-section">${this.escapeHtml(s.section)}</span></td>
          <td>${this.escapeHtml(s.phone || '-')}</td>
          <td>${this.escapeHtml(s.joined_on || '-')}</td>
          <td>
            <div style="display: flex; gap: 0.35rem;">
              <button class="btn btn-secondary btn-sm" onclick="App.viewStudentProfile('${s.roll_no}')" title="Profile & Heatmap">
                <i data-lucide="bar-chart-2" style="width: 14px; height: 14px;"></i> Profile
              </button>
              <button class="btn btn-secondary btn-sm" onclick="App.openEditStudentModal('${s.roll_no}')" title="Edit">
                <i data-lucide="edit-2" style="width: 14px; height: 14px;"></i>
              </button>
              ${isAdmin ? `
                <button class="btn btn-ghost btn-sm" style="color: var(--danger);" onclick="App.confirmDeleteStudent('${s.roll_no}', '${this.escapeHtml(s.name)}')" title="Delete">
                  <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                </button>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    });
    tbody.innerHTML = html;

    // Render pagination
    if (paginationEl) {
      paginationEl.innerHTML = `
        <div>Showing <b>${total > 0 ? start + 1 : 0}</b> to <b>${Math.min(start + pageSize, total)}</b> of <b>${total}</b> students</div>
        <div class="pagination-buttons">
          <button class="btn btn-secondary btn-sm" ${this.state.studentPage <= 1 ? 'disabled' : ''} onclick="App.setStudentPage(${this.state.studentPage - 1})">
            Previous
          </button>
          <span style="display: flex; align-items: center; padding: 0 0.5rem; font-weight: 600;">
            Page ${this.state.studentPage} of ${totalPages}
          </span>
          <button class="btn btn-secondary btn-sm" ${this.state.studentPage >= totalPages ? 'disabled' : ''} onclick="App.setStudentPage(${this.state.studentPage + 1})">
            Next
          </button>
        </div>
      `;
    }

    if (window.lucide) window.lucide.createIcons();
  },

  setStudentPage(page) {
    this.state.studentPage = page;
    this.renderStudentsTable();
  },

  /* Add / Edit / Delete Student Modals */
  openAddStudentModal() {
    document.getElementById('modal-student-title').textContent = 'Add New Student';
    document.getElementById('student-form-mode').value = 'add';
    document.getElementById('student-roll').value = '';
    document.getElementById('student-roll').removeAttribute('readonly');
    document.getElementById('student-name').value = '';
    document.getElementById('student-section').value = 'CS-A';
    document.getElementById('student-email').value = '';
    document.getElementById('student-phone').value = '';
    this.openModal('modal-student');
  },

  openEditStudentModal(roll) {
    const s = this.state.students.find(x => x.roll_no === roll);
    if (!s) return;

    document.getElementById('modal-student-title').textContent = `Edit Student: ${s.roll_no}`;
    document.getElementById('student-form-mode').value = 'edit';
    document.getElementById('student-roll').value = s.roll_no;
    document.getElementById('student-roll').setAttribute('readonly', 'true');
    document.getElementById('student-name').value = s.name;
    document.getElementById('student-section').value = s.section;
    document.getElementById('student-email').value = s.email;
    document.getElementById('student-phone').value = s.phone;
    this.openModal('modal-student');
  },

  async handleStudentFormSubmit(e) {
    e.preventDefault();
    const mode = document.getElementById('student-form-mode').value;
    const roll = document.getElementById('student-roll').value.trim();
    const name = document.getElementById('student-name').value.trim();
    const section = document.getElementById('student-section').value.trim();
    const email = document.getElementById('student-email').value.trim();
    const phone = document.getElementById('student-phone').value.trim();

    if (!roll || !name) {
      this.showToast('Roll number and Name are required', 'error');
      return;
    }

    const payload = { roll_no: roll, name, section, email, phone };

    try {
      if (mode === 'add') {
        await API.addStudent(payload);
        this.showToast(`Student ${name} added successfully!`, 'success');
      } else {
        await API.updateStudent(roll, payload);
        this.showToast(`Student ${roll} updated successfully!`, 'success');
      }
      this.closeModal('modal-student');
      this.loadStudents();
    } catch (err) {
      this.showToast(err.message || 'Operation failed', 'error');
    }
  },

  confirmDeleteStudent(roll, name) {
    document.getElementById('delete-student-roll').value = roll;
    document.getElementById('delete-student-name').textContent = `${name} (${roll})`;
    this.openModal('modal-delete-student');
  },

  async handleDeleteStudentConfirmed() {
    const roll = document.getElementById('delete-student-roll').value;
    if (!roll) return;

    try {
      await API.deleteStudent(roll);
      this.showToast(`Student ${roll} deleted successfully (Backup created in /backups)`, 'success');
      this.closeModal('modal-delete-student');
      this.loadStudents();
    } catch (err) {
      this.showToast(err.message || 'Delete failed', 'error');
    }
  },

  /* =========================================================================
   * Student Profile & Heatmap View Modal (with Inline Details & Editing)
   * ========================================================================= */
  async viewStudentProfile(roll) {
    try {
      const res = await API.getStudentReport(roll);
      const data = res.data;
      const s = data.student;

      // Store in state for inline editing
      this.state.currentProfileStudent = s;
      this.state.currentProfileRoll = roll;

      // Header info
      document.getElementById('profile-student-name').textContent = s.name;
      document.getElementById('profile-student-meta').textContent = `Roll No: ${s.roll_no} • Section: ${s.section} • Joined: ${s.joined_on}`;

      // Populate Student Details Card (View Mode)
      document.getElementById('profile-val-roll').textContent = s.roll_no;
      document.getElementById('profile-val-name').textContent = s.name;
      document.getElementById('profile-val-section').textContent = s.section;
      document.getElementById('profile-val-email').textContent = s.email || 'None provided';
      document.getElementById('profile-val-phone').textContent = s.phone || 'None provided';
      document.getElementById('profile-val-joined').textContent = s.joined_on || '-';

      // Status Badge (< 75% or Good Standing)
      const statusBadge = document.getElementById('profile-status-badge');
      if (statusBadge) {
        if (data.percentage < 75.0 && data.total_days > 0) {
          statusBadge.className = 'badge badge-critical';
          statusBadge.textContent = `Attendance Warning (${data.percentage.toFixed(1)}%)`;
        } else {
          statusBadge.className = 'badge badge-present';
          statusBadge.textContent = `Good Standing (${data.percentage.toFixed(1)}%)`;
        }
      }

      // Populate Edit Form Inputs
      document.getElementById('profile-edit-name').value = s.name;
      document.getElementById('profile-edit-section').value = s.section;
      document.getElementById('profile-edit-email').value = s.email || '';
      document.getElementById('profile-edit-phone').value = s.phone || '';

      // Reset to view mode initially
      this.toggleProfileEditMode(false);

      // KPI Numbers
      document.getElementById('profile-rate').textContent = `${data.percentage.toFixed(1)}%`;
      document.getElementById('profile-total-classes').textContent = data.total_days;
      document.getElementById('profile-present-count').textContent = data.present_days;
      document.getElementById('profile-absent-count').textContent = data.absent_days;

      // Render Heatmap Matrix
      this.renderHeatmap('profile-heatmap', data.history || []);

      // Render History Table
      const histBody = document.getElementById('profile-history-body');
      if (histBody) {
        if (!data.history || data.history.length === 0) {
          histBody.innerHTML = '<tr><td colspan="3" class="empty-state">No attendance logs yet</td></tr>';
        } else {
          let hHtml = '';
          data.history.forEach(h => {
            const badgeClass = h.status === 'Present' ? 'badge-present' : (h.status === 'Absent' ? 'badge-absent' : 'badge-late');
            hHtml += `
              <tr>
                <td style="font-family: var(--font-mono); font-size: 0.85rem;">${h.date}</td>
                <td><span class="badge ${badgeClass}">${h.status}</span></td>
                <td style="color: var(--text-muted); font-size: 0.85rem;">${this.escapeHtml(h.remarks || '-')}</td>
              </tr>
            `;
          });
          histBody.innerHTML = hHtml;
        }
      }

      this.openModal('modal-profile');
      if (window.lucide) window.lucide.createIcons();
    } catch (err) {
      this.showToast('Could not load student profile', 'error');
    }
  },

  toggleProfileEditMode(forceState) {
    const viewCard = document.getElementById('profile-details-view');
    const editCard = document.getElementById('profile-details-edit');
    const btnText = document.getElementById('btn-edit-profile-text');
    if (!viewCard || !editCard) return;

    let isEditing;
    if (forceState !== undefined) {
      isEditing = forceState;
    } else {
      isEditing = (editCard.style.display === 'none');
    }

    if (isEditing) {
      viewCard.style.display = 'none';
      editCard.style.display = 'block';
      if (btnText) btnText.textContent = 'Cancel Edit';
    } else {
      viewCard.style.display = 'block';
      editCard.style.display = 'none';
      if (btnText) btnText.textContent = 'Edit Details';
    }
    if (window.lucide) window.lucide.createIcons();
  },

  async saveProfileInlineEdit(event) {
    if (event) event.preventDefault();
    const roll = this.state.currentProfileRoll;
    if (!roll) return;

    const name = document.getElementById('profile-edit-name').value.trim();
    const section = document.getElementById('profile-edit-section').value.trim();
    const email = document.getElementById('profile-edit-email').value.trim();
    const phone = document.getElementById('profile-edit-phone').value.trim();

    if (!name || !section) {
      this.showToast('Name and Section are required', 'error');
      return;
    }

    const payload = { roll_no: roll, name, section, email, phone };

    try {
      await API.updateStudent(roll, payload);
      this.showToast(`Details for ${name} (${roll}) updated successfully!`, 'success');

      // Update state and view card directly
      document.getElementById('profile-student-name').textContent = name;
      document.getElementById('profile-student-meta').textContent = `Roll No: ${roll} • Section: ${section}`;
      document.getElementById('profile-val-name').textContent = name;
      document.getElementById('profile-val-section').textContent = section;
      document.getElementById('profile-val-email').textContent = email || 'None provided';
      document.getElementById('profile-val-phone').textContent = phone || 'None provided';

      // Switch back to view mode
      this.toggleProfileEditMode(false);

      // Refresh student list and summary in background
      this.loadStudents();
      if (this.state.currentPage === 'dashboard') {
        this.loadDashboard();
      }
    } catch (err) {
      this.showToast(err.message || 'Failed to update student details', 'error');
    }
  },

  renderHeatmap(containerId, history) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Build a map of date -> status
    const dateMap = {};
    history.forEach(h => {
      dateMap[h.date] = h.status;
    });

    // Generate past 35 calendar days
    const days = [];
    const today = new Date();
    for (let i = 34; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const iso = d.toISOString().split('T')[0];
      const isSunday = d.getDay() === 0;
      days.push({
        date: iso,
        status: isSunday ? 'Sunday' : (dateMap[iso] || 'No Class')
      });
    }

    let html = '<div class="heatmap-grid">';
    days.forEach(d => {
      let cls = 'empty';
      let title = `${d.date}: ${d.status}`;
      if (d.status === 'Present') cls = 'present';
      else if (d.status === 'Absent') cls = 'absent';
      else if (d.status === 'Late') cls = 'late';

      const shortDay = d.date.split('-')[2];
      html += `<div class="heatmap-day ${cls}" title="${title}">${shortDay}</div>`;
    });
    html += '</div>';

    html += `
      <div style="display: flex; gap: 1rem; align-items: center; margin-top: 0.75rem; font-size: 0.75rem; color: var(--text-muted);">
        <span style="display: flex; align-items: center; gap: 4px;"><span class="heatmap-day present" style="width: 14px; height: 14px; font-size: 0;"></span> Present</span>
        <span style="display: flex; align-items: center; gap: 4px;"><span class="heatmap-day absent" style="width: 14px; height: 14px; font-size: 0;"></span> Absent</span>
        <span style="display: flex; align-items: center; gap: 4px;"><span class="heatmap-day late" style="width: 14px; height: 14px; font-size: 0;"></span> Late</span>
        <span style="display: flex; align-items: center; gap: 4px;"><span class="heatmap-day empty" style="width: 14px; height: 14px; font-size: 0;"></span> No Record</span>
      </div>
    `;

    container.innerHTML = html;
  },

  /* =========================================================================
   * Mark Attendance View
   * ========================================================================= */
  loadAttendancePage() {
    const dateInput = document.getElementById('attendance-date-picker');
    const todayStr = new Date().toISOString().split('T')[0];
    if (dateInput) {
      dateInput.max = todayStr; // Block future dates
      if (!this.state.attendanceDate) {
        this.state.attendanceDate = todayStr;
        dateInput.value = todayStr;
      }
    }
    this.fetchAttendanceForMarking();
  },

  async fetchAttendanceForMarking() {
    const date = this.state.attendanceDate;
    const sec = this.state.attendanceSection;
    if (!date) return;

    try {
      const res = await API.getAttendance(date, sec);
      const data = res.data;
      this.state.isAttendanceRecorded = data.is_recorded;
      this.state.attendanceList = (data.records || []).map(r => ({
        roll_no: r.roll_no,
        name: r.name,
        section: r.section,
        status: (r.status === 'Unmarked') ? 'Present' : r.status, // Default to Present for ease
        remarks: r.remarks || ''
      }));

      // Update Recorded Notice Banner
      const noticeBanner = document.getElementById('attendance-notice-banner');
      if (noticeBanner) {
        if (data.is_recorded) {
          noticeBanner.style.display = 'block';
          noticeBanner.innerHTML = `
            <i data-lucide="info" style="color: var(--primary);"></i>
            <span>Attendance for <b>${date}</b> has already been saved. Modifying values below will safely <b>update</b> the records and create an automatic backup in <code>/backups</code>.</span>
          `;
        } else {
          noticeBanner.style.display = 'none';
        }
      }

      this.renderAttendanceList();
      if (window.lucide) window.lucide.createIcons();
    } catch (err) {
      this.showToast('Failed to load attendance list', 'error');
    }
  },

  renderAttendanceList() {
    const container = document.getElementById('attendance-marking-container');
    if (!container) return;

    const list = this.state.attendanceList;
    if (list.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i data-lucide="users"></i>
          <h3>No students in selected section</h3>
          <p>Please select a different section or add students to this section first.</p>
        </div>
      `;
      this.updateAttendanceCounters();
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    let html = '<div class="attendance-grid">';
    list.forEach((item, idx) => {
      const isPresent = item.status === 'Present';
      const isAbsent  = item.status === 'Absent';
      const isLate    = item.status === 'Late';

      html += `
        <div class="attendance-row">
          <div style="display: flex; align-items: center; gap: 0.85rem; min-width: 220px;">
            <div class="student-avatar" style="${isAbsent ? 'background: var(--danger);' : ''}">${item.name.charAt(0)}</div>
            <div>
              <div style="font-weight: 600; font-size: 0.95rem;">${this.escapeHtml(item.name)}</div>
              <div style="font-size: 0.775rem; color: var(--text-muted); font-family: var(--font-mono);">${item.roll_no} • <span class="badge badge-section" style="padding: 1px 5px; font-size: 0.7rem;">${item.section}</span></div>
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;">
            <div class="toggle-group">
              <button type="button" class="toggle-btn ${isPresent ? 'active-present' : ''}" onclick="App.setStudentStatus(${idx}, 'Present')">
                <i data-lucide="check" style="width: 14px; height: 14px;"></i> Present
              </button>
              <button type="button" class="toggle-btn ${isAbsent ? 'active-absent' : ''}" onclick="App.setStudentStatus(${idx}, 'Absent')">
                <i data-lucide="x" style="width: 14px; height: 14px;"></i> Absent
              </button>
              <button type="button" class="toggle-btn ${isLate ? 'active-late' : ''}" onclick="App.setStudentStatus(${idx}, 'Late')">
                <i data-lucide="clock" style="width: 14px; height: 14px;"></i> Late
              </button>
            </div>

            <input type="text" class="form-control remarks-input" placeholder="Remarks (optional)" value="${this.escapeHtml(item.remarks)}" onchange="App.setStudentRemarks(${idx}, this.value)" />
          </div>
        </div>
      `;
    });
    html += '</div>';
    container.innerHTML = html;

    this.updateAttendanceCounters();
    if (window.lucide) window.lucide.createIcons();
  },

  setStudentStatus(index, status) {
    if (this.state.attendanceList[index]) {
      this.state.attendanceList[index].status = status;
      this.renderAttendanceList();
    }
  },

  setStudentRemarks(index, val) {
    if (this.state.attendanceList[index]) {
      this.state.attendanceList[index].remarks = val;
    }
  },

  markAllStatus(status) {
    this.state.attendanceList.forEach(item => {
      item.status = status;
    });
    this.renderAttendanceList();
  },

  updateAttendanceCounters() {
    let p = 0, a = 0, l = 0;
    this.state.attendanceList.forEach(item => {
      if (item.status === 'Present') p++;
      else if (item.status === 'Absent') a++;
      else if (item.status === 'Late') l++;
    });

    const total = this.state.attendanceList.length;
    document.getElementById('att-count-total').textContent = total;
    document.getElementById('att-count-present').textContent = p;
    document.getElementById('att-count-absent').textContent = a;
    document.getElementById('att-count-late').textContent = l;
  },

  async handleSaveAttendance() {
    const date = this.state.attendanceDate;
    if (!date) {
      this.showToast('Please select a valid date', 'error');
      return;
    }

    const records = this.state.attendanceList.map(item => ({
      roll_no: item.roll_no,
      status: item.status,
      remarks: item.remarks
    }));

    if (records.length === 0) {
      this.showToast('No students to save attendance for', 'warning');
      return;
    }

    const saveBtn = document.getElementById('btn-save-attendance');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<span class="spinner"></span> Saving to C Backend...';
    }

    try {
      await API.saveAttendance(date, records);
      this.showToast(`Attendance for ${date} saved successfully! (Backup archived)`, 'success');
      this.fetchAttendanceForMarking();
    } catch (err) {
      this.showToast(err.message || 'Failed to save attendance', 'error');
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i data-lucide="check"></i> Submit Attendance';
        if (window.lucide) window.lucide.createIcons();
      }
    }
  },

  /* =========================================================================
   * Reports & Analytics View
   * ========================================================================= */
  async loadReports() {
    try {
      const res = await API.getSummary();
      const sRes = await API.getStudents();
      const students = sRes.data || [];

      // Fetch individual report stats for every student
      const reports = [];
      for (const s of students) {
        try {
          const r = await API.getStudentReport(s.roll_no);
          reports.push(r.data);
        } catch {}
      }

      this.state.reportsList = reports;
      this.renderReportsTable();
    } catch (err) {
      this.showToast('Failed to generate reports', 'error');
    }
  },

  renderReportsTable() {
    const tbody = document.getElementById('reports-table-body');
    if (!tbody) return;

    let list = [...this.state.reportsList];
    const secFilter = this.state.reportSectionFilter;
    const q = this.state.reportSearch.toLowerCase();

    if (secFilter !== 'all') {
      list = list.filter(item => item.student.section === secFilter);
    }
    if (q) {
      list = list.filter(item =>
        item.student.name.toLowerCase().includes(q) ||
        item.student.roll_no.toLowerCase().includes(q)
      );
    }

    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No matching student reports</td></tr>';
      return;
    }

    let html = '';
    list.forEach(item => {
      const s = item.student;
      const pct = item.percentage;
      const isCritical = pct < 75.0;

      html += `
        <tr>
          <td><span class="student-roll">${this.escapeHtml(s.roll_no)}</span></td>
          <td style="font-weight: 600;">${this.escapeHtml(s.name)}</td>
          <td><span class="badge badge-section">${this.escapeHtml(s.section)}</span></td>
          <td>${item.total_days}</td>
          <td style="color: var(--success); font-weight: 600;">${item.present_days}</td>
          <td style="color: var(--danger); font-weight: 600;">${item.absent_days}</td>
          <td style="color: var(--warning); font-weight: 600;">${item.late_days}</td>
          <td>
            <span class="badge ${isCritical ? 'badge-critical' : 'badge-present'}" style="font-size: 0.85rem;">
              ${pct.toFixed(1)}%
            </span>
          </td>
        </tr>
      `;
    });
    tbody.innerHTML = html;
  },

  /* =========================================================================
   * Settings (Admin Only) View
   * ========================================================================= */
  async loadSettings() {
    this.switchSettingsTab('tab-general');
    this.loadTeachersList();
    this.loadSettingsAuditLog();
  },

  switchSettingsTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    document.querySelectorAll('.tab-pane').forEach(pane => {
      pane.classList.toggle('active', pane.id === tabId);
    });
  },

  async loadTeachersList() {
    try {
      const res = await API.getUsers();
      const users = res.data || [];
      const tbody = document.getElementById('users-table-body');
      if (!tbody) return;

      let html = '';
      users.forEach(u => {
        html += `
          <tr>
            <td style="font-weight: 600;">${this.escapeHtml(u.username)}</td>
            <td><span class="badge badge-section">${u.role.toUpperCase()}</span></td>
            <td>
              ${u.username !== 'admin' ? `
                <button class="btn btn-ghost btn-sm" style="color: var(--danger);" onclick="App.handleDeleteUser('${u.username}')">
                  <i data-lucide="trash-2"></i> Delete
                </button>
              ` : '<span style="font-size: 0.8rem; color: var(--text-muted);">Protected Root Admin</span>'}
            </td>
          </tr>
        `;
      });
      tbody.innerHTML = html;
      if (window.lucide) window.lucide.createIcons();
    } catch {}
  },

  async handleAddUser(e) {
    e.preventDefault();
    const usr = document.getElementById('new-user-username').value.trim();
    const pass = document.getElementById('new-user-password').value.trim();
    const role = document.getElementById('new-user-role').value;

    if (!usr || !pass) {
      this.showToast('Username and password are required', 'error');
      return;
    }

    try {
      await API.addUser(usr, pass, role);
      this.showToast(`User ${usr} created successfully`, 'success');
      document.getElementById('form-add-user').reset();
      this.loadTeachersList();
    } catch (err) {
      this.showToast(err.message || 'Failed to create user', 'error');
    }
  },

  async handleDeleteUser(username) {
    if (!confirm(`Are you sure you want to delete account "${username}"?`)) return;
    try {
      await API.deleteUser(username);
      this.showToast(`User ${username} deleted`, 'success');
      this.loadTeachersList();
    } catch (err) {
      this.showToast(err.message || 'Delete user failed', 'error');
    }
  },

  async handleChangePassword(e) {
    e.preventDefault();
    const curr = document.getElementById('pwd-current').value;
    const newp = document.getElementById('pwd-new').value;
    const conf = document.getElementById('pwd-confirm').value;

    if (newp !== conf) {
      this.showToast('New passwords do not match', 'error');
      return;
    }

    try {
      await API.changePassword(curr, newp);
      this.showToast('Password changed successfully!', 'success');
      document.getElementById('form-change-password').reset();
    } catch (err) {
      this.showToast(err.message || 'Password update failed', 'error');
    }
  },

  async handleManualBackup() {
    try {
      const res = await API.createBackup();
      this.showToast('Full system backup generated successfully in /backups', 'success');
      this.loadSettingsAuditLog();
    } catch (err) {
      this.showToast('Backup creation failed', 'error');
    }
  },

  async loadSettingsAuditLog() {
    try {
      const res = await API.getAuditLog();
      const logs = res.data || [];
      const tbody = document.getElementById('settings-audit-body');
      if (!tbody) return;

      let html = '';
      logs.slice(0, 30).forEach(l => {
        html += `
          <tr>
            <td style="font-family: var(--font-mono); font-size: 0.8rem;">${l.timestamp}</td>
            <td style="font-weight: 600;">${this.escapeHtml(l.user)}</td>
            <td>${this.escapeHtml(l.action)}</td>
          </tr>
        `;
      });
      tbody.innerHTML = html;
    } catch {}
  },

  /* =========================================================================
   * CSV Import & Export
   * ========================================================================= */
  triggerCSVExport(type) {
    const url = API.getExportUrl(type);
    window.open(url, '_blank');
    this.showToast(`Exporting ${type} CSV...`, 'info');
  },

  openCSVImportModal() {
    document.getElementById('csv-file-input').value = '';
    document.getElementById('csv-preview-text').textContent = 'No file selected yet.';
    document.getElementById('csv-import-results').style.display = 'none';
    this.openModal('modal-import-csv');
  },

  handleCSVFileSelected(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      this.state.pendingCSV = event.target.result;
      const preview = document.getElementById('csv-preview-text');
      const lines = this.state.pendingCSV.split('\n').filter(Boolean);
      preview.textContent = `Ready to import ${lines.length} lines. First line:\n${lines[0] || ''}`;
    };
    reader.readAsText(file);
  },

  async executeCSVImport() {
    if (!this.state.pendingCSV) {
      this.showToast('Please select a CSV file first', 'warning');
      return;
    }

    try {
      const res = await API.importCSV(this.state.pendingCSV);
      const data = res.data;
      const resEl = document.getElementById('csv-import-results');
      resEl.style.display = 'block';
      resEl.innerHTML = `
        <div style="padding: 0.75rem; border-radius: var(--radius-md); background: var(--success-light); color: var(--success-text); font-weight: 600;">
          Import Completed: ${data.imported} added, ${data.skipped} skipped (duplicates or invalid).
        </div>
      `;
      this.showToast(`Imported ${data.imported} students!`, 'success');
      this.loadStudents();
    } catch (err) {
      this.showToast(err.message || 'CSV Import failed', 'error');
    }
  },

  /* =========================================================================
   * UI Utilities: Modals, Toasts, Counter Animation
   * ========================================================================= */
  openModal(modalId) {
    document.getElementById(modalId)?.classList.add('active');
  },

  closeModal(modalId) {
    document.getElementById(modalId)?.classList.remove('active');
  },

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let icon = 'info';
    if (type === 'success') icon = 'check-circle';
    if (type === 'error') icon = 'alert-triangle';

    toast.innerHTML = `
      <i data-lucide="${icon}"></i>
      <span style="flex: 1;">${this.escapeHtml(message)}</span>
    `;

    container.appendChild(toast);
    if (window.lucide) window.lucide.createIcons();

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(16px)';
      setTimeout(() => toast.remove(), 250);
    }, 3500);
  },

  animateCount(elementId, target, suffix = '', decimals = 0) {
    const el = document.getElementById(elementId);
    if (!el) return;

    const numTarget = typeof target === 'number' ? target : parseFloat(target) || 0;
    let start = 0;
    const duration = 750;
    const stepTime = 25;
    const steps = duration / stepTime;
    const increment = (numTarget - start) / steps;

    const timer = setInterval(() => {
      start += increment;
      if ((increment >= 0 && start >= numTarget) || (increment < 0 && start <= numTarget)) {
        el.textContent = `${decimals > 0 ? numTarget.toFixed(decimals) : Math.round(numTarget)}${suffix}`;
        clearInterval(timer);
      } else {
        el.textContent = `${decimals > 0 ? start.toFixed(decimals) : Math.round(start)}${suffix}`;
      }
    }, stepTime);
  },

  escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  /* =========================================================================
   * DOM Event Bindings
   * ========================================================================= */
  bindEvents() {
    // Navigation
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', () => {
        this.navigateTo(link.dataset.page);
      });
    });

    // Mobile sidebar toggle
    document.getElementById('menu-toggle-btn')?.addEventListener('click', () => {
      document.querySelector('.sidebar')?.classList.toggle('open');
    });

    // Theme toggle
    document.getElementById('theme-toggle-btn')?.addEventListener('click', () => {
      this.toggleTheme();
    });

    // Logout
    document.getElementById('btn-logout')?.addEventListener('click', () => {
      this.handleLogout();
    });

    // Login Form Submit
    document.getElementById('login-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const u = document.getElementById('login-username').value.trim();
      const p = document.getElementById('login-password').value.trim();
      this.handleLogin(u, p);
    });

    // Demo Login Chips
    document.getElementById('btn-demo-admin')?.addEventListener('click', () => {
      document.getElementById('login-username').value = 'admin';
      document.getElementById('login-password').value = 'admin123';
      this.handleLogin('admin', 'admin123');
    });

    document.getElementById('btn-demo-teacher')?.addEventListener('click', () => {
      document.getElementById('login-username').value = 'teacher';
      document.getElementById('login-password').value = 'teacher123';
      this.handleLogin('teacher', 'teacher123');
    });

    // Students Search & Filters
    document.getElementById('students-search-input')?.addEventListener('input', (e) => {
      this.state.studentSearch = e.target.value;
      this.state.studentPage = 1;
      this.filterAndRenderStudents();
    });

    document.getElementById('students-section-filter')?.addEventListener('change', (e) => {
      this.state.studentSectionFilter = e.target.value;
      this.state.studentPage = 1;
      this.filterAndRenderStudents();
    });

    // Student Form
    document.getElementById('student-form')?.addEventListener('submit', (e) => {
      this.handleStudentFormSubmit(e);
    });

    // Attendance Date & Section change
    document.getElementById('attendance-date-picker')?.addEventListener('change', (e) => {
      this.state.attendanceDate = e.target.value;
      this.fetchAttendanceForMarking();
    });

    document.getElementById('mark-section-select')?.addEventListener('change', (e) => {
      this.state.attendanceSection = e.target.value;
      this.fetchAttendanceForMarking();
    });

    // Reports Search & Filters
    document.getElementById('reports-section-filter')?.addEventListener('change', (e) => {
      this.state.reportSectionFilter = e.target.value;
      this.renderReportsTable();
    });

    document.getElementById('reports-search-input')?.addEventListener('input', (e) => {
      this.state.reportSearch = e.target.value;
      this.renderReportsTable();
    });

    // Settings
    document.getElementById('form-add-user')?.addEventListener('submit', (e) => {
      this.handleAddUser(e);
    });

    document.getElementById('form-change-password')?.addEventListener('submit', (e) => {
      this.handleChangePassword(e);
    });

    // Close modal on ESC key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
      }
    });

    // Close modal when clicking outside dialog
    document.querySelectorAll('.modal-overlay').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
      });
    });
  }
};

// Initialize App when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
