/**
 * AttendX - Charts Module
 * Dynamic Dark/Light theme adaptation with User Reference Palette:
 * - 1st colour: AQUAMARINE (#0F3F49) - Present Attendance & Primary
 * - 2nd colour: CONCRETE   (#ECE6DF) - Canvas Background & Subtle Borders
 * - 3rd colour: BURGUNDY   (#7F0508) - Absent Attendance & Critical Alerts
 * - Accent:     WARM AMBER (#D97706) - Late / Unresolved Sessions
 */

const Charts = {
  trendChartInstance: null,
  sectionChartInstance: null,
  doughnutChartInstance: null,

  isDarkMode() {
    return document.documentElement.getAttribute('data-theme') === 'dark';
  },

  getColors() {
    const dark = this.isDarkMode();
    return {
      textColor: dark ? '#D7D0C6' : '#27474C',
      titleColor: dark ? '#ECE6DF' : '#0F3F49',
      gridColor: dark ? 'rgba(236, 230, 223, 0.08)' : 'rgba(15, 63, 73, 0.08)',
      cardBg: dark ? '#133339' : '#FFFFFF',
      aquamarine: '#0F3F49',
      aquamarineHover: '#165664',
      aquamarineGlow: 'rgba(15, 63, 73, 0.22)',
      concrete: '#ECE6DF',
      concreteDark: '#D4CCC0',
      burgundy: '#7F0508',
      burgundyHover: '#9E0B0F',
      burgundyGlow: 'rgba(127, 5, 8, 0.18)',
      amber: '#D97706',
      amberHover: '#B45309',
      amberGlow: 'rgba(217, 119, 6, 0.2)'
    };
  },

  /* =========================================================================
   * 1. Attendance Trend Chart (Dual Trajectory: Present vs Absent)
   * ========================================================================= */
  renderTrendChart(canvasId, trendData, daysLimit = 7) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !window.Chart) return;

    const colors = this.getColors();
    const dataSubset = (trendData || []).slice(-daysLimit);

    const labels = dataSubset.map(d => {
      const parts = d.date.split('-');
      return `${parts[1]}/${parts[2]}`;
    });

    // Extract exact percentages with 1-decimal precision
    const presentPcts = dataSubset.map(d => {
      if (d.present_percentage !== undefined) return Number(d.present_percentage.toFixed(1));
      return Number((d.percentage || 0).toFixed(1));
    });

    const absentPcts = dataSubset.map(d => {
      if (d.absent_percentage !== undefined) return Number(d.absent_percentage.toFixed(1));
      const total = (d.present || 0) + (d.absent || 0) + (d.late || 0);
      return total > 0 ? Number(((d.absent / total) * 100).toFixed(1)) : 0;
    });

    // Smoothly update existing chart if already instantiated
    if (this.trendChartInstance && this.trendChartInstance.ctx) {
      this.trendChartInstance.data.labels = labels;
      this.trendChartInstance.data.datasets[0].data = presentPcts;
      this.trendChartInstance.data.datasets[1].data = absentPcts;
      this.trendChartInstance.update();
      return;
    }

    if (this.trendChartInstance) {
      this.trendChartInstance.destroy();
    }

    const ctx = canvas.getContext('2d');

    // Present gradient (Aquamarine)
    const presGradient = ctx.createLinearGradient(0, 0, 0, 260);
    presGradient.addColorStop(0, colors.aquamarineGlow);
    presGradient.addColorStop(1, 'rgba(15, 63, 73, 0.0)');

    // Absent gradient (Burgundy)
    const absGradient = ctx.createLinearGradient(0, 0, 0, 260);
    absGradient.addColorStop(0, colors.burgundyGlow);
    absGradient.addColorStop(1, 'rgba(127, 5, 8, 0.0)');

    this.trendChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Present Rate (%)',
            data: presentPcts,
            borderColor: colors.aquamarine,
            backgroundColor: presGradient,
            borderWidth: 2.5,
            fill: true,
            tension: 0.35,
            pointBackgroundColor: colors.aquamarine,
            pointBorderColor: colors.concrete,
            pointBorderWidth: 1.5,
            pointRadius: 4,
            pointHoverRadius: 6
          },
          {
            label: 'Absent Rate (%)',
            data: absentPcts,
            borderColor: colors.burgundy,
            backgroundColor: absGradient,
            borderWidth: 2,
            borderDash: [4, 4],
            fill: true,
            tension: 0.35,
            pointBackgroundColor: colors.burgundy,
            pointBorderColor: colors.concrete,
            pointBorderWidth: 1.5,
            pointRadius: 3.5,
            pointHoverRadius: 5.5
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            align: 'end',
            labels: {
              boxWidth: 12,
              padding: 12,
              color: colors.textColor,
              font: { size: 11, weight: '600' }
            }
          },
          tooltip: {
            backgroundColor: colors.cardBg,
            titleColor: colors.titleColor,
            bodyColor: colors.textColor,
            borderColor: colors.gridColor,
            borderWidth: 1,
            padding: 10,
            callbacks: {
              label: (context) => ` ${context.dataset.label}: ${context.parsed.y.toFixed(1)}%`
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: colors.textColor, font: { size: 11 } }
          },
          y: {
            min: 0,
            max: 100,
            grid: { color: colors.gridColor },
            ticks: {
              color: colors.textColor,
              font: { size: 11 },
              callback: val => `${val}%`
            }
          }
        }
      }
    });
  },

  /* =========================================================================
   * 2. Section-Wise Performance Chart (Alternating Present & Absent Bars)
   * ========================================================================= */
  renderSectionChart(canvasId, sectionData) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !window.Chart) return;

    if (this.sectionChartInstance) {
      this.sectionChartInstance.destroy();
    }

    const colors = this.getColors();
    const list = sectionData || [];
    const labels = list.map(s => s.section);

    // Exact percentages
    const presentPcts = list.map(s => {
      if (s.present_percentage !== undefined) return Number(s.present_percentage.toFixed(1));
      return Number((s.percentage || 0).toFixed(1));
    });

    const absentPcts = list.map(s => {
      if (s.absent_percentage !== undefined) return Number(s.absent_percentage.toFixed(1));
      return Number(Math.max(0, 100 - (s.percentage || 0)).toFixed(1));
    });

    const ctx = canvas.getContext('2d');
    this.sectionChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Present (%)',
            data: presentPcts,
            backgroundColor: colors.aquamarine,
            hoverBackgroundColor: colors.aquamarineHover,
            borderRadius: 6,
            barPercentage: 0.7,
            categoryPercentage: 0.65
          },
          {
            label: 'Absent (%)',
            data: absentPcts,
            backgroundColor: colors.burgundy,
            hoverBackgroundColor: colors.burgundyHover,
            borderRadius: 6,
            barPercentage: 0.7,
            categoryPercentage: 0.65
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'top',
            align: 'end',
            labels: {
              boxWidth: 12,
              padding: 12,
              color: colors.textColor,
              font: { size: 11, weight: '600' }
            }
          },
          tooltip: {
            backgroundColor: colors.cardBg,
            titleColor: colors.titleColor,
            bodyColor: colors.textColor,
            borderColor: colors.gridColor,
            borderWidth: 1,
            padding: 10,
            callbacks: {
              label: (c) => ` ${c.dataset.label}: ${c.parsed.y.toFixed(1)}%`
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: colors.textColor, font: { weight: '600' } }
          },
          y: {
            min: 0,
            max: 100,
            grid: { color: colors.gridColor },
            ticks: {
              color: colors.textColor,
              callback: val => `${val}%`
            }
          }
        }
      }
    });
  },

  /* =========================================================================
   * 3. Today's Breakdown Doughnut Chart
   * ========================================================================= */
  renderDoughnutChart(canvasId, present, absent, late) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !window.Chart) return;

    if (this.doughnutChartInstance) {
      this.doughnutChartInstance.destroy();
    }

    const colors = this.getColors();
    const ctx = canvas.getContext('2d');

    const p = Number(present) || 0;
    const a = Number(absent) || 0;
    const l = Number(late) || 0;
    const total = p + a + l;

    const dataValues = total > 0 ? [p, a, l] : [1, 0, 0];
    const bgColors = total > 0
      ? [colors.aquamarine, colors.burgundy, colors.amber]
      : [colors.concreteDark];

    this.doughnutChartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Present', 'Absent', 'Late'],
        datasets: [
          {
            data: dataValues,
            backgroundColor: bgColors,
            borderColor: colors.cardBg,
            borderWidth: 2,
            hoverOffset: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 12,
              padding: 16,
              color: colors.textColor,
              font: { size: 12, weight: '600' }
            }
          },
          tooltip: {
            enabled: total > 0,
            backgroundColor: colors.cardBg,
            titleColor: colors.titleColor,
            bodyColor: colors.textColor,
            borderColor: colors.gridColor,
            borderWidth: 1,
            padding: 10,
            callbacks: {
              label: (ctx) => {
                const count = ctx.parsed;
                const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
                return ` ${ctx.label}: ${count} students (${pct}%)`;
              }
            }
          }
        }
      }
    });
  }
};
