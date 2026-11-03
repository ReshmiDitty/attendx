/**
 * AttendX - Frontend API Client
 * Wraps fetch() calls to the backend C server (/api/...)
 */

const API = {
  TOKEN_KEY: 'attendx_auth_token',
  USER_KEY: 'attendx_user',

  getToken() {
    return localStorage.getItem(this.TOKEN_KEY);
  },

  setToken(token) {
    if (token) localStorage.setItem(this.TOKEN_KEY, token);
    else localStorage.removeItem(this.TOKEN_KEY);
  },

  getUser() {
    try {
      const u = localStorage.getItem(this.USER_KEY);
      return u ? JSON.parse(u) : null;
    } catch {
      return null;
    }
  },

  setUser(user) {
    if (user) localStorage.setItem(this.USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(this.USER_KEY);
  },

  isAuthenticated() {
    return !!this.getToken();
  },

  async request(endpoint, options = {}) {
    const url = new URL(endpoint, window.location.origin);
    if (options.params) {
      Object.entries(options.params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
          url.searchParams.append(k, v);
        }
      });
    }

    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const config = {
      method: options.method || 'GET',
      headers,
      ...options
    };

    if (options.body && typeof options.body === 'object') {
      config.body = JSON.stringify(options.body);
    }

    try {
      const res = await fetch(url.toString(), config);

      if (res.status === 401 && !endpoint.includes('/api/login')) {
        this.setToken(null);
        this.setUser(null);
        window.dispatchEvent(new CustomEvent('attendx:unauthorized'));
        throw new Error('Session expired. Please log in again.');
      }

      // Handle raw CSV downloads
      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('text/csv')) {
        return await res.text();
      }

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || `Request failed with status ${res.status}`);
      }

      return data;
    } catch (err) {
      console.error(`[API Error] ${options.method || 'GET'} ${endpoint}:`, err);
      throw err;
    }
  },

  // Auth Endpoints
  async login(username, password) {
    const res = await this.request('/api/login', {
      method: 'POST',
      body: { username, password }
    });
    if (res.data && res.data.token) {
      this.setToken(res.data.token);
      this.setUser(res.data.user);
    }
    return res;
  },

  async logout() {
    try {
      await this.request('/api/logout', { method: 'POST' });
    } catch (e) {
      console.warn('Logout notification error:', e);
    } finally {
      this.setToken(null);
      this.setUser(null);
    }
  },

  async getMe() {
    return await this.request('/api/me');
  },

  // Students Endpoints
  async getStudents(params = {}) {
    return await this.request('/api/students', { params });
  },

  async getStudent(roll) {
    return await this.request(`/api/students/${encodeURIComponent(roll)}`);
  },

  async addStudent(student) {
    return await this.request('/api/students', {
      method: 'POST',
      body: student
    });
  },

  async updateStudent(roll, student) {
    return await this.request(`/api/students/${encodeURIComponent(roll)}`, {
      method: 'PUT',
      body: student
    });
  },

  async deleteStudent(roll) {
    return await this.request(`/api/students/${encodeURIComponent(roll)}`, {
      method: 'DELETE'
    });
  },

  // Attendance Endpoints
  async getAttendance(date, section = '') {
    return await this.request('/api/attendance', {
      params: { date, section }
    });
  },

  async saveAttendance(date, records) {
    return await this.request('/api/attendance', {
      method: 'POST',
      body: { date, records }
    });
  },

  // Reports & Summary Endpoints
  async getSummary() {
    return await this.request('/api/reports/summary');
  },

  async getStudentReport(roll) {
    return await this.request(`/api/reports/student/${encodeURIComponent(roll)}`);
  },

  // CSV Export & Import
  getExportUrl(type = 'students') {
    const token = this.getToken();
    return `/api/export/csv?type=${type}&token=${encodeURIComponent(token || '')}`;
  },

  async importCSV(csvData) {
    return await this.request('/api/import/csv', {
      method: 'POST',
      body: { csv: csvData }
    });
  },

  // Settings & Admin
  async getAuditLog() {
    return await this.request('/api/audit-log');
  },

  async createBackup() {
    return await this.request('/api/settings/backup', {
      method: 'POST'
    });
  },

  async changePassword(current_password, new_password) {
    return await this.request('/api/settings/password', {
      method: 'POST',
      body: { current_password, new_password }
    });
  },

  async getUsers() {
    return await this.request('/api/users');
  },

  async addUser(username, password, role) {
    return await this.request('/api/users', {
      method: 'POST',
      body: { username, password, role }
    });
  },

  async deleteUser(username) {
    return await this.request(`/api/users/${encodeURIComponent(username)}`, {
      method: 'DELETE'
    });
  }
};
