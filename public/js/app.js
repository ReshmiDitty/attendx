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
    reportSearch: '',

    // Predictive Analytics state
    predictiveThreshold: 75,
    predictiveLatePolicy: 0.5,
    predictiveRiskFilter: 'all',
    predictiveSearch: '',
    predictiveSectionFilter: 'all',
    predictiveAlertFilter: 'active',
    predictiveList: [],
    reviewedAlerts: JSON.parse(localStorage.getItem('attendx_reviewed_alerts') || '[]')
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
      this.updateTrendCalculations(this.state.trendDays);
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
    try {
      await API.logout();
    } catch (e) {
      console.warn('Logout error:', e);
    }
    this.state.user = null;
    this.showLogin();
    const pwdInput = document.getElementById('login-password');
    if (pwdInput) pwdInput.value = '';
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
        predictive: 'Predictive Attendance Analytics',
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
      case 'predictive': this.loadPredictive(); break;
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

      this.updateTrendCalculations(this.state.trendDays);
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
      const bDays = parseInt(btn.dataset.days);
      btn.classList.toggle('btn-primary', bDays === days);
      btn.classList.toggle('btn-secondary', bDays !== days);
    });
    this.updateTrendCalculations(days);
    this.renderDashboardCharts();
  },

  updateTrendCalculations(days) {
    if (!this.state.summaryData || !this.state.summaryData.trend) return;
    const trend = this.state.summaryData.trend;
    const subset = trend.slice(-days);
    if (subset.length === 0) return;

    let totPres = 0, totAbs = 0, totLate = 0;
    subset.forEach(d => {
      totPres += (d.present || 0);
      totAbs += (d.absent || 0);
      totLate += (d.late || 0);
    });
    const total = totPres + totAbs + totLate;
    const rate = total > 0 ? Number((((totPres + totLate) / total) * 100).toFixed(1)) : 0;

    this.animateCount('kpi-overall-rate', rate, '%', 1);

    const subEl = document.getElementById('kpi-overall-subtext');
    if (subEl) {
      subEl.textContent = (days === 7)
        ? `Across last 7 calendar days (${days}D Avg)`
        : `Across 30 calendar days (${days}D Avg)`;
    }

    const titleSub = document.getElementById('trend-chart-subtitle');
    if (titleSub) {
      titleSub.textContent = `Daily aggregate attendance trajectory (${days} Days View • ${rate}% Avg)`;
    }
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
    if (typeof window.__ATTENDX_DOWNLOAD__ === 'function') {
      window.__ATTENDX_DOWNLOAD__(type);
      this.showToast(`Downloading ${type} CSV...`, 'info');
      return;
    }
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
    document.getElementById('btn-logout')?.addEventListener('click', (e) => {
      if (e) e.preventDefault();
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
  },

  /* =========================================================================
   * Predictive Attendance Analytics Module
   * ========================================================================= */
  async loadPredictive() {
    try {
      const sRes = await API.getStudents();
      const students = sRes.data || [];
      const threshold = this.state.predictiveThreshold;
      const latePolicy = this.state.predictiveLatePolicy;

      // Populate what-if student selector if empty
      const selectEl = document.getElementById('whatif-student-select');
      if (selectEl && selectEl.options.length <= 1) {
        students.forEach(s => {
          const opt = document.createElement('option');
          opt.value = s.roll_no;
          opt.textContent = `${s.roll_no} - ${s.name} (${s.section})`;
          selectEl.appendChild(opt);
        });
      }

      // Compute predictive metrics for all students
      const predictiveList = [];
      let totalConductedCohort = 0;
      let totalPresentCohort = 0;
      let totalAbsentCohort = 0;
      let totalLateCohort = 0;

      for (const s of students) {
        try {
          const r = await API.getStudentReport(s.roll_no);
          const data = r.data || {};
          const total = data.total_days || 0;
          const pres = data.present_days || 0;
          const abs = data.absent_days || 0;
          const late = data.late_days || 0;
          const history = data.history || [];

          totalConductedCohort += total;
          totalPresentCohort += pres;
          totalAbsentCohort += abs;
          totalLateCohort += late;

          // Effective present based on late policy
          const effPresent = pres + (latePolicy * late);
          const currentPct = total > 0 ? (effPresent / total) * 100 : 0.0;

          // Extra consecutive absences cushion
          let maxAbsencesAllowed = 0;
          const threshDec = threshold / 100.0;
          if (total >= 5 && currentPct >= threshold) {
            maxAbsencesAllowed = Math.floor((effPresent - (threshDec * total)) / threshDec);
            if (maxAbsencesAllowed < 0) maxAbsencesAllowed = 0;
          }

          // Historical vs Recent Trend
          const recent10 = history.slice(-10);
          let recentPres = 0;
          recent10.forEach(h => {
            if (h.status === 'Present') recentPres += 1.0;
            else if (h.status === 'Late') recentPres += latePolicy;
          });
          const recentRate = recent10.length > 0 ? (recentPres / recent10.length) : (currentPct / 100.0);
          const histRate = total > 0 ? (effPresent / total) : (currentPct / 100.0);
          const predRate = (0.65 * recentRate) + (0.35 * histRate);

          const upcomingN = 15;
          const predFuturePres = Math.round(predRate * upcomingN);
          const projectedPct = (total + upcomingN) > 0
            ? ((effPresent + predFuturePres) / (total + upcomingN)) * 100
            : currentPct;

          // Risk Category
          let risk = 'low';
          let riskLabel = 'Low Risk';
          let riskBadgeClass = 'badge-present';
          let alertTrigger = null;
          let alertReason = '';
          let alertAction = '';

          // Check declining in last 5
          const last5 = history.slice(-5);
          const missedLast5 = last5.filter(h => h.status === 'Absent' || h.status === 'Late').length;

          if (total < 5) {
            risk = 'insufficient';
            riskLabel = 'Needs Data';
            riskBadgeClass = 'badge-neutral';
            alertTrigger = 'insufficient';
            alertReason = `Only ${total} attendance record(s) on file. Minimum 5 required for statistical confidence.`;
            alertAction = 'Record initial cohort attendance to establish statistical baseline.';
          } else if (currentPct < threshold) {
            risk = 'high';
            riskLabel = 'High Risk';
            riskBadgeClass = 'badge-critical';
            alertTrigger = 'critical';
            alertReason = `Current attendance of ${currentPct.toFixed(1)}% is ${(threshold - currentPct).toFixed(1)}% below the mandatory ${threshold}% threshold.`;
            alertAction = 'Mandate academic advisor counseling and issue formal attendance warning letter.';
          } else if (currentPct < (threshold + 10.0) || maxAbsencesAllowed <= 2) {
            risk = 'moderate';
            riskLabel = 'Moderate Risk';
            riskBadgeClass = 'badge-late';
            alertTrigger = 'approaching';
            alertReason = `Attendance ${currentPct.toFixed(1)}% is within ${maxAbsencesAllowed} absence(s) of breaching the ${threshold}% threshold.`;
            alertAction = 'Issue proactive attendance alert and assign peer study mentor.';
          } else if (missedLast5 >= 3) {
            risk = 'moderate';
            riskLabel = 'Moderate (Declining)';
            riskBadgeClass = 'badge-late';
            alertTrigger = 'declining';
            alertReason = `Recent attendance drop: Missed ${missedLast5} of the last 5 sessions despite overall ${currentPct.toFixed(1)}%.`;
            alertAction = 'Conduct informal check-in to identify potential medical/personal difficulties.';
          } else {
            risk = 'low';
            riskLabel = 'Low Risk';
            riskBadgeClass = 'badge-present';
          }

          // Reliability Level
          let reliability = 'High';
          let reliabilityBadgeClass = 'badge-present';
          if (total < 5) {
            reliability = 'Insufficient Data';
            reliabilityBadgeClass = 'badge-neutral';
          } else if (total < 10) {
            reliability = 'Low';
            reliabilityBadgeClass = 'badge-late';
          } else if (total < 25) {
            reliability = 'Medium';
            reliabilityBadgeClass = 'badge-neutral';
          }

          // Explainable Why text
          let whyText = '';
          if (total < 5) {
            whyText = `Classified as Insufficient Data because the student has only ${total} session(s) recorded. A minimum sample size of 5 conducted classes is required to evaluate moving averages or trend directions with mathematical validity.`;
          } else if (risk === 'high') {
            whyText = `Classified as High Risk because the student's current effective rate of ${currentPct.toFixed(1)}% is below the ${threshold}% requirement. With ${upcomingN} sessions remaining, the projected final rate is ${projectedPct.toFixed(1)}%, requiring immediate intervention to prevent semester debarment.`;
          } else if (risk === 'moderate') {
            whyText = `Classified as Moderate Risk because the student has an absence cushion of ${maxAbsencesAllowed} class(es). A small cluster of absences would quickly push them below the ${threshold}% threshold. Recent 10-session trend slope indicates ${recentRate > histRate ? 'improving' : 'declining'} consistency.`;
          } else {
            whyText = `Classified as Low Risk with a safe attendance rate of ${currentPct.toFixed(1)}% (well above the ${threshold}% threshold). The student has a cushion of ${maxAbsencesAllowed} consecutive missed classes before reaching the warning zone. Historical trajectory remains highly consistent.`;
          }

          let recAction = '';
          if (risk === 'high') recAction = 'Immediate faculty advisor interview & warning notice';
          else if (risk === 'moderate') recAction = 'Proactive monitoring & attendance advisory alert';
          else if (risk === 'insufficient') recAction = 'Collect more session data (5 minimum)';
          else recAction = 'Maintain regular attendance consistency';

          predictiveList.push({
            student: s,
            total,
            present: pres,
            absent: abs,
            late,
            effPresent,
            currentPct,
            projectedPct,
            maxAbsencesAllowed,
            risk,
            riskLabel,
            riskBadgeClass,
            reliability,
            reliabilityBadgeClass,
            whyText,
            recAction,
            alertTrigger,
            alertReason,
            alertAction
          });
        } catch (e) {
          console.warn('Student predictive error:', e);
        }
      }

      this.state.predictiveList = predictiveList;
      this.renderPredictiveFacultyInsights();
      this.renderPredictiveAlerts();
      this.renderPredictiveTable();

      const avgProjected = predictiveList.length > 0
        ? predictiveList.reduce((acc, cur) => acc + cur.projectedPct, 0) / predictiveList.length
        : 85.0;

      const trend = (this.state.summaryData && this.state.summaryData.trend)
        ? this.state.summaryData.trend
        : [];

      Charts.renderPredictiveForecastChart('predictive-forecast-chart', trend, avgProjected, threshold);
      this.runWhatIfCalculation();
    } catch (err) {
      console.error(err);
      this.showToast('Failed to load predictive analytics', 'error');
    }
  },

  renderPredictiveFacultyInsights() {
    const list = this.state.predictiveList || [];
    const total = list.length;
    const high = list.filter(x => x.risk === 'high').length;
    const mod = list.filter(x => x.risk === 'moderate').length;
    const low = list.filter(x => x.risk === 'low').length;

    this.animateCount('pred-kpi-monitored', total);
    this.animateCount('pred-kpi-high-risk', high);
    this.animateCount('pred-kpi-moderate-risk', mod);
    this.animateCount('pred-kpi-low-risk', low);
  },

  renderPredictiveAlerts() {
    const container = document.getElementById('pred-alerts-container');
    if (!container) return;

    const list = this.state.predictiveList;
    const filter = this.state.predictiveAlertFilter;
    const reviewed = new Set(this.state.reviewedAlerts);

    const alerts = [];
    list.forEach(item => {
      if (item.alertTrigger) {
        const alertId = `${item.student.roll_no}_${item.alertTrigger}`;
        alerts.push({
          id: alertId,
          student: item.student,
          pct: item.currentPct,
          risk: item.risk,
          riskLabel: item.riskLabel,
          riskBadgeClass: item.riskBadgeClass,
          type: item.alertTrigger,
          reason: item.alertReason,
          action: item.alertAction,
          isReviewed: reviewed.has(alertId)
        });
      }
    });

    const activeCount = alerts.filter(a => !a.isReviewed).length;
    const reviewedCount = alerts.filter(a => a.isReviewed).length;
    document.getElementById('pred-alerts-active-count').textContent = activeCount;
    document.getElementById('pred-alerts-reviewed-count').textContent = reviewedCount;
    document.getElementById('pred-alerts-all-count').textContent = alerts.length;
    document.getElementById('pred-kpi-active-warnings').textContent = activeCount;

    let displayAlerts = alerts;
    if (filter === 'active') displayAlerts = alerts.filter(a => !a.isReviewed);
    else if (filter === 'reviewed') displayAlerts = alerts.filter(a => a.isReviewed);

    if (displayAlerts.length === 0) {
      container.innerHTML = `<div style="grid-column: 1 / -1; padding: 2rem; text-align: center; color: var(--text-muted);">
        <i data-lucide="check-circle" style="width: 32px; height: 32px; color: var(--success); margin-bottom: 0.5rem;"></i>
        <div>No ${filter} early warning alerts found.</div>
      </div>`;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    let html = '';
    displayAlerts.forEach(a => {
      html += `
        <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-left: 4px solid ${a.risk === 'high' ? 'var(--bordo)' : (a.risk === 'moderate' ? 'var(--warning)' : 'var(--primary)')}; border-radius: 0 var(--radius-lg) var(--radius-lg) 0; padding: 1rem; box-shadow: var(--shadow-sm);">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
            <div>
              <div style="font-weight: 700; font-size: 0.95rem;">${this.escapeHtml(a.student.name)}</div>
              <div style="font-size: 0.75rem; color: var(--text-muted);">${this.escapeHtml(a.student.roll_no)} • ${this.escapeHtml(a.student.section)}</div>
            </div>
            <span class="badge ${a.riskBadgeClass}">${a.pct.toFixed(1)}%</span>
          </div>

          <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.65rem; line-height: 1.4;">
            <strong>Signal:</strong> ${this.escapeHtml(a.reason)}
          </div>

          <div style="font-size: 0.775rem; background: var(--bg-subtle); padding: 0.45rem 0.65rem; border-radius: var(--radius-sm); margin-bottom: 0.75rem;">
            <strong>Intervention:</strong> ${this.escapeHtml(a.action)}
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center;">
            <button class="btn btn-ghost btn-sm" style="font-size: 0.75rem; padding: 0.2rem 0.5rem;" onclick="App.openPredictiveProfile('${a.student.roll_no}')">
              <i data-lucide="eye" style="width: 13px; height: 13px;"></i> View Profile
            </button>
            <button class="btn ${a.isReviewed ? 'btn-secondary' : 'btn-outline'} btn-sm" style="font-size: 0.75rem; padding: 0.2rem 0.65rem;" onclick="App.toggleAlertReviewed('${a.id}')">
              <i data-lucide="${a.isReviewed ? 'check' : 'bookmark'}" style="width: 13px; height: 13px;"></i> ${a.isReviewed ? 'Reviewed' : 'Mark as Reviewed'}
            </button>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
    if (window.lucide) window.lucide.createIcons();
  },

  toggleAlertReviewed(alertId) {
    const list = this.state.reviewedAlerts || [];
    const idx = list.indexOf(alertId);
    if (idx === -1) {
      list.push(alertId);
      this.showToast('Alert marked as reviewed', 'success');
    } else {
      list.splice(idx, 1);
      this.showToast('Alert unmarked', 'info');
    }
    this.state.reviewedAlerts = list;
    localStorage.setItem('attendx_reviewed_alerts', JSON.stringify(list));
    this.renderPredictiveAlerts();
  },

  renderPredictiveTable() {
    const tbody = document.getElementById('pred-table-body');
    if (!tbody) return;

    let list = this.state.predictiveList || [];
    const rf = this.state.predictiveRiskFilter;
    const sec = this.state.predictiveSectionFilter;
    const q = (this.state.predictiveSearch || '').toLowerCase().trim();

    document.getElementById('pred-filter-all-count').textContent = list.length;
    document.getElementById('pred-filter-high-count').textContent = list.filter(x => x.risk === 'high').length;
    document.getElementById('pred-filter-mod-count').textContent = list.filter(x => x.risk === 'moderate').length;
    document.getElementById('pred-filter-low-count').textContent = list.filter(x => x.risk === 'low').length;
    document.getElementById('pred-filter-insuf-count').textContent = list.filter(x => x.risk === 'insufficient').length;

    if (rf !== 'all') {
      list = list.filter(x => x.risk === rf);
    }
    if (sec !== 'all') {
      list = list.filter(x => x.student.section === sec);
    }
    if (q) {
      list = list.filter(x =>
        x.student.name.toLowerCase().includes(q) ||
        x.student.roll_no.toLowerCase().includes(q)
      );
    }

    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="12" class="empty-state">No matching student records found</td></tr>';
      return;
    }

    let html = '';
    list.forEach(item => {
      const s = item.student;
      html += `
        <tr>
          <td><span class="student-roll">${this.escapeHtml(s.roll_no)}</span></td>
          <td style="font-weight: 600;">${this.escapeHtml(s.name)}</td>
          <td><span class="badge badge-section">${this.escapeHtml(s.section)}</span></td>
          <td>${item.total}</td>
          <td style="color: var(--success); font-weight: 600;">${item.present}</td>
          <td style="color: var(--danger); font-weight: 600;">${item.absent}</td>
          <td><span class="badge ${item.riskBadgeClass}" style="font-size: 0.825rem;">${item.currentPct.toFixed(1)}%</span></td>
          <td style="font-weight: 700; color: var(--primary);">${item.projectedPct.toFixed(1)}%</td>
          <td><span class="badge ${item.riskBadgeClass}">${item.riskLabel}</span></td>
          <td><strong>${item.total < 5 ? 'N/A' : item.maxAbsencesAllowed + ' classes'}</strong></td>
          <td style="font-size: 0.8rem; color: var(--text-secondary); max-width: 200px;">${this.escapeHtml(item.recAction)}</td>
          <td>
            <button class="btn btn-ghost btn-sm" onclick="App.openPredictiveProfile('${s.roll_no}')" title="View Detailed Profile">
              <i data-lucide="line-chart"></i> View
            </button>
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
    if (window.lucide) window.lucide.createIcons();
  },

  openPredictiveProfile(rollNo) {
    const item = this.state.predictiveList.find(x => x.student.roll_no === rollNo);
    if (!item) return;

    document.getElementById('pred-modal-student-name').textContent = item.student.name;
    document.getElementById('pred-modal-student-meta').textContent = `${item.student.roll_no} • Section ${item.student.section} • ${item.student.email}`;
    document.getElementById('pred-modal-current-pct').textContent = `${item.currentPct.toFixed(1)}%`;
    document.getElementById('pred-modal-projected-pct').textContent = `${item.projectedPct.toFixed(1)}%`;
    document.getElementById('pred-modal-risk-badge').innerHTML = `<span class="badge ${item.riskBadgeClass}">${item.riskLabel}</span>`;
    document.getElementById('pred-modal-reliability-badge').innerHTML = `<span class="badge ${item.reliabilityBadgeClass}">${item.reliability}</span>`;
    document.getElementById('pred-modal-conducted').textContent = item.total;
    document.getElementById('pred-modal-present').textContent = item.present;
    document.getElementById('pred-modal-absent').textContent = item.absent;
    document.getElementById('pred-modal-late').textContent = item.late;
    document.getElementById('pred-modal-cushion').textContent = `${item.maxAbsencesAllowed} consecutive classes`;
    document.getElementById('pred-modal-why-text').textContent = item.whyText;
    document.getElementById('pred-modal-action-text').innerHTML = `
      <ul style="padding-left: 1.25rem; margin: 0; line-height: 1.6;">
        <li><strong>Primary Action:</strong> ${this.escapeHtml(item.recAction)}</li>
        <li><strong>Early Alert Advisory:</strong> ${this.escapeHtml(item.alertAction || 'Continue routine attendance monitoring.')}</li>
        <li><strong>Threshold Cushion:</strong> Student can afford at most <strong>${item.maxAbsencesAllowed}</strong> more unexcused absence(s) before dropping below the ${this.state.predictiveThreshold}% minimum requirement.</li>
      </ul>
    `;

    this.openModal('modal-predictive-profile');
    if (window.lucide) window.lucide.createIcons();
  },

  handlePredictiveConfigChange() {
    const threshEl = document.getElementById('pred-threshold-select');
    const lateEl = document.getElementById('pred-late-policy-select');
    if (threshEl) this.state.predictiveThreshold = parseFloat(threshEl.value);
    if (lateEl) this.state.predictiveLatePolicy = parseFloat(lateEl.value);

    const lbl = document.getElementById('pred-chart-threshold-label');
    if (lbl) lbl.textContent = `Cutoff: ${this.state.predictiveThreshold}%`;

    this.loadPredictive();
  },

  filterPredictiveRisk(risk) {
    this.state.predictiveRiskFilter = risk;
    document.querySelectorAll('.btn-pred-risk-filter').forEach(btn => {
      btn.classList.toggle('btn-primary', btn.dataset.risk === risk);
      btn.classList.toggle('btn-secondary', btn.dataset.risk !== risk);
    });
    this.renderPredictiveTable();
  },

  handlePredictiveSearch(e) {
    this.state.predictiveSearch = e.target.value;
    this.renderPredictiveTable();
  },

  handlePredictiveSectionFilter(e) {
    this.state.predictiveSectionFilter = e.target.value;
    this.renderPredictiveTable();
  },

  setPredictiveAlertFilter(tab) {
    this.state.predictiveAlertFilter = tab;
    document.querySelectorAll('.btn-pred-alert-tab').forEach(btn => {
      btn.classList.toggle('btn-primary', btn.dataset.tab === tab);
      btn.classList.toggle('btn-secondary', btn.dataset.tab !== tab);
    });
    this.renderPredictiveAlerts();
  },

  handleWhatIfStudentSelected(e) {
    const roll = e.target.value;
    if (!roll) return;
    const item = this.state.predictiveList.find(x => x.student.roll_no === roll);
    if (!item) return;

    document.getElementById('whatif-total').value = item.total;
    document.getElementById('whatif-present').value = item.present;
    document.getElementById('whatif-upcoming').value = 15;
    document.getElementById('whatif-expected').value = Math.min(15, Math.round((item.currentPct / 100) * 15));
    this.runWhatIfCalculation();
  },

  runWhatIfCalculation() {
    const totalInput = document.getElementById('whatif-total');
    const presInput = document.getElementById('whatif-present');
    const upInput = document.getElementById('whatif-upcoming');
    const expInput = document.getElementById('whatif-expected');
    const errEl = document.getElementById('whatif-error');
    const impossibleEl = document.getElementById('whatif-impossible-alert');

    if (!totalInput || !presInput || !upInput || !expInput) return;

    const T = parseInt(totalInput.value, 10);
    const P = parseInt(presInput.value, 10);
    const N = parseInt(upInput.value, 10);
    const F = parseInt(expInput.value, 10);
    const R = this.state.predictiveThreshold || 75;

    let errorMsg = '';
    if (isNaN(T) || isNaN(P) || isNaN(N) || isNaN(F)) {
      errorMsg = 'Please enter valid integer numbers for all fields.';
    } else if (T < 0 || P < 0 || N < 0 || F < 0) {
      errorMsg = 'Negative numbers are not allowed.';
    } else if (P > T) {
      errorMsg = 'Present classes (P) cannot exceed conducted classes (T).';
    } else if (F > N) {
      errorMsg = 'Expected attendance (F) cannot exceed upcoming classes (N).';
    }

    if (errorMsg) {
      if (errEl) { errEl.textContent = errorMsg; errEl.style.display = 'block'; }
      return;
    } else {
      if (errEl) errEl.style.display = 'none';
    }

    const currentPct = T > 0 ? (P / T) * 100 : 0.0;
    const projectedPct = (T + N) > 0 ? ((P + F) / (T + N)) * 100 : 0.0;

    const reqNumerator = (R * (T + N)) - (100 * P);
    const reqClasses = Math.ceil(reqNumerator / 100.0);

    const isMeets = projectedPct >= R;
    const isImpossible = reqClasses > N;

    let maxMissable = 0;
    if (!isImpossible) {
      maxMissable = N - Math.max(0, reqClasses);
    }

    const curEl = document.getElementById('whatif-current-pct');
    if (curEl) curEl.textContent = `${currentPct.toFixed(1)}%`;

    const projEl = document.getElementById('whatif-projected-pct');
    if (projEl) {
      projEl.textContent = `${projectedPct.toFixed(1)}%`;
      projEl.style.color = isMeets ? 'var(--success)' : 'var(--danger)';
    }

    const badgeEl = document.getElementById('whatif-status-badge');
    if (badgeEl) {
      badgeEl.className = `badge ${isMeets ? 'badge-present' : 'badge-critical'}`;
      badgeEl.textContent = isMeets ? `Meets Goal (≥${R}%)` : `Below Goal (<${R}%)`;
    }

    const reqEl = document.getElementById('whatif-req-classes');
    if (reqEl) {
      if (isImpossible) {
        reqEl.textContent = `Impossible (${reqClasses} > ${N})`;
        reqEl.style.color = 'var(--danger)';
      } else if (reqClasses <= 0) {
        reqEl.textContent = '0 (Already secured)';
        reqEl.style.color = 'var(--success)';
      } else {
        reqEl.textContent = `${reqClasses} of ${N} classes`;
        reqEl.style.color = 'var(--text-primary)';
      }
    }

    const missEl = document.getElementById('whatif-max-missable');
    if (missEl) {
      if (isImpossible) {
        missEl.textContent = '0 (Cannot miss any)';
        missEl.style.color = 'var(--danger)';
      } else {
        missEl.textContent = `${maxMissable} class${maxMissable === 1 ? '' : 'es'}`;
        missEl.style.color = maxMissable > 0 ? 'var(--text-primary)' : 'var(--danger)';
      }
    }

    if (impossibleEl) {
      impossibleEl.style.display = isImpossible ? 'block' : 'none';
    }
  },

  exportPredictiveCSV() {
    const list = this.state.predictiveList || [];
    let csv = 'roll_no,name,section,conducted,present,absent,late,current_pct,projected_pct,risk_category,reliability,absence_cushion,alert_reason,recommended_action\n';
    list.forEach(x => {
      csv += `${x.student.roll_no},"${x.student.name}",${x.student.section},${x.total},${x.present},${x.absent},${x.late},${x.currentPct.toFixed(1)},${x.projectedPct.toFixed(1)},${x.riskLabel},${x.reliability},${x.maxAbsencesAllowed},"${(x.alertReason || 'None').replace(/"/g, '""')}","${x.recAction.replace(/"/g, '""')}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `attendx_predictive_analytics_${Date.now()}.csv`;
    link.click();
    this.showToast('Predictive Analytics CSV exported successfully', 'success');
  },

};

// Initialize App when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
