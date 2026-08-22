async function checkBackendHealth() {
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const httpCodeVal = document.getElementById('http-code-val');
  const serviceStatusVal = document.getElementById('service-status-val');
  const lastCheckVal = document.getElementById('last-check-val');
  const jsonViewer = document.getElementById('json-viewer');
  const responseLatency = document.getElementById('response-latency');

  if (statusDot) statusDot.className = 'status-dot connecting';
  if (statusText) statusText.textContent = 'Interrogation du backend...';
  if (jsonViewer) jsonViewer.textContent = 'Requête GET /health en cours...';

  const startTime = performance.now();

  try {
    const response = await fetch('/health', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    const elapsedMs = Math.round(performance.now() - startTime);
    const statusCode = response.status;
    const data = await response.json();

    if (httpCodeVal) httpCodeVal.textContent = `${statusCode} ${response.statusText || 'OK'}`;
    if (lastCheckVal) lastCheckVal.textContent = new Date().toLocaleTimeString();
    if (responseLatency) responseLatency.textContent = `${elapsedMs} ms`;

    const isHealthy = response.ok && (data?.status === 'ok' || data?.data?.status === 'ok');

    if (isHealthy) {
      if (statusDot) statusDot.className = 'status-dot connected';
      if (statusText) statusText.textContent = 'Backend Connecté';
      if (serviceStatusVal) {
        serviceStatusVal.textContent = 'OK';
        serviceStatusVal.className = 'metric-value text-success';
      }
    } else {
      if (statusDot) statusDot.className = 'status-dot error';
      if (statusText) statusText.textContent = 'Réponse Inattendue';
      if (serviceStatusVal) {
        serviceStatusVal.textContent = 'DÉGRADÉ';
        serviceStatusVal.className = 'metric-value text-error';
      }
    }

    if (jsonViewer) {
      jsonViewer.textContent = JSON.stringify(data, null, 2);
    }
  } catch (error) {
    const elapsedMs = Math.round(performance.now() - startTime);
    if (httpCodeVal) httpCodeVal.textContent = 'Échec Réseau';
    if (lastCheckVal) lastCheckVal.textContent = new Date().toLocaleTimeString();
    if (responseLatency) responseLatency.textContent = `${elapsedMs} ms`;
    if (statusDot) statusDot.className = 'status-dot error';
    if (statusText) statusText.textContent = 'Backend Déconnecté';
    if (serviceStatusVal) {
      serviceStatusVal.textContent = 'ERREUR';
      serviceStatusVal.className = 'metric-value text-error';
    }
    if (jsonViewer) {
      jsonViewer.textContent = `Erreur lors de l'appel GET /health:\n${error instanceof Error ? error.message : String(error)}`;
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const refreshBtn = document.getElementById('refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      checkBackendHealth();
    });
  }

  checkBackendHealth();
});
