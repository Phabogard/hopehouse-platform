/**
 * HOPEHOUSE Platform - Frontend Foundation
 * Communication Frontend ↔ Backend via GET /health
 */

async function fetchBackendHealth() {
  const indicator = document.getElementById('connection-indicator');
  const statusText = document.getElementById('connection-status-text');
  const metricService = document.getElementById('metric-service-value');
  const metricStatus = document.getElementById('metric-http-status-value');
  const metricLatency = document.getElementById('metric-latency-value');
  const lastCheckText = document.getElementById('last-check-text');
  const rawCodeBlock = document.getElementById('raw-response-code');
  const refreshBtn = document.getElementById('btn-refresh');

  if (refreshBtn) refreshBtn.disabled = true;

  // Set loading state
  if (indicator) {
    indicator.className = 'status-pill status-loading';
  }
  if (statusText) statusText.textContent = 'Connexion en cours...';

  const startTime = performance.now();

  try {
    const response = await fetch('/health', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    const endTime = performance.now();
    const latencyMs = Math.round(endTime - startTime);

    const data = await response.json();

    if (response.ok) {
      if (indicator) indicator.className = 'status-pill status-connected';
      if (statusText) statusText.textContent = '● Connecté';
      if (metricStatus) metricStatus.textContent = `${response.status} OK`;
      
      const serviceName = (data && data.data && data.data.service) || (data && data.service) || 'hopehouse-platform';
      if (metricService) metricService.textContent = serviceName;
      if (metricLatency) metricLatency.textContent = `${latencyMs} ms`;

      if (rawCodeBlock) {
        rawCodeBlock.textContent = JSON.stringify(data, null, 2);
      }
    } else {
      if (indicator) indicator.className = 'status-pill status-error';
      if (statusText) statusText.textContent = '✕ Erreur HTTP';
      if (metricStatus) metricStatus.textContent = `${response.status} ${response.statusText}`;
      if (metricLatency) metricLatency.textContent = `${latencyMs} ms`;
      if (rawCodeBlock) rawCodeBlock.textContent = JSON.stringify(data, null, 2);
    }
  } catch (error) {
    const endTime = performance.now();
    const latencyMs = Math.round(endTime - startTime);

    if (indicator) indicator.className = 'status-pill status-error';
    if (statusText) statusText.textContent = '○ Déconnecté';
    if (metricStatus) metricStatus.textContent = 'Erreur réseau';
    if (metricLatency) metricLatency.textContent = `${latencyMs} ms`;
    if (rawCodeBlock) {
      rawCodeBlock.textContent = JSON.stringify({
        error: error instanceof Error ? error.message : 'Erreur de connexion au backend'
      }, null, 2);
    }
  } finally {
    if (lastCheckText) {
      const now = new Date();
      lastCheckText.textContent = `Dernière vérification : ${now.toLocaleTimeString('fr-FR')}`;
    }
    if (refreshBtn) refreshBtn.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const refreshBtn = document.getElementById('btn-refresh');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      fetchBackendHealth();
    });
  }

  // Initial check
  fetchBackendHealth();
});
