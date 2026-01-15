/**
 * LightTrack Chart Renderer
 * Canvas-based chart rendering for analytics
 */

window.LightTrack = window.LightTrack || {};

window.LightTrack.ChartRenderer = {
  /**
   * Draw a bar chart on a canvas element
   */
  drawBarChart(canvasId, data, options = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !data || data.length === 0) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    // Set canvas size accounting for device pixel ratio
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const padding = { top: 20, right: 20, bottom: 40, left: 50 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Find max value
    const maxValue = Math.max(...data.map(d => d.value), 1);

    // Draw axes
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;

    // Y axis
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, height - padding.bottom);
    ctx.stroke();

    // X axis
    ctx.beginPath();
    ctx.moveTo(padding.left, height - padding.bottom);
    ctx.lineTo(width - padding.right, height - padding.bottom);
    ctx.stroke();

    // Draw grid lines and Y labels
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '11px system-ui';
    ctx.textAlign = 'right';

    const gridLines = 5;
    for (let i = 0; i <= gridLines; i++) {
      const y = padding.top + (chartHeight / gridLines) * i;
      const value = maxValue - (maxValue / gridLines) * i;

      // Grid line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();

      // Y label
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.fillText(value.toFixed(1) + 'h', padding.left - 5, y + 4);
    }

    // Draw bars
    const barWidth = Math.min(30, (chartWidth / data.length) * 0.7);
    const gap = (chartWidth - barWidth * data.length) / (data.length + 1);

    data.forEach((d, i) => {
      const x = padding.left + gap + i * (barWidth + gap);
      const barHeight = (d.value / maxValue) * chartHeight;
      const y = height - padding.bottom - barHeight;

      // Bar gradient
      const gradient = ctx.createLinearGradient(x, y, x, height - padding.bottom);
      gradient.addColorStop(0, options.barColor || '#3b82f6');
      gradient.addColorStop(1, options.barColorEnd || '#1d4ed8');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, [4, 4, 0, 0]);
      ctx.fill();

      // X label
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.font = '10px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(d.label, x + barWidth / 2, height - padding.bottom + 15);
    });
  },

  /**
   * Draw a pie chart on a canvas element
   */
  drawPieChart(canvasId, data, options = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !data || data.length === 0) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 2 - 10;

    ctx.clearRect(0, 0, width, height);

    const total = data.reduce((sum, d) => sum + d.value, 0);
    if (total === 0) return;

    const colors = options.colors || [
      '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
      '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1'
    ];

    let startAngle = -Math.PI / 2;

    data.forEach((d, i) => {
      const sliceAngle = (d.value / total) * 2 * Math.PI;
      const endAngle = startAngle + sliceAngle;

      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, startAngle, endAngle);
      ctx.closePath();

      ctx.fillStyle = colors[i % colors.length];
      ctx.fill();

      // Add subtle border
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.lineWidth = 1;
      ctx.stroke();

      startAngle = endAngle;
    });

    // Draw center hole for donut effect
    if (options.donut !== false) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius * 0.5, 0, 2 * Math.PI);
      ctx.fillStyle = options.backgroundColor || '#1e293b';
      ctx.fill();
    }
  },

  /**
   * Get chart colors array
   */
  getColors() {
    return [
      '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
      '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1'
    ];
  }
};

// Export for module compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = window.LightTrack.ChartRenderer;
}
