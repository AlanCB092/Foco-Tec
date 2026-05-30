const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

const FIREBASE_URL = 'https://foco-tec-default-rtdb.firebaseio.com';
const PORT = 3001;

process.env.TZ = 'America/Mexico_City';

console.log('\n=========================================');
console.log('   SERVIDOR FOCO IoT - CONTROL INTELIGENTE');
console.log('=========================================\n');
console.log(`✅ Servidor: http://192.168.0.185:${PORT}`);
console.log(`💡 Hora local: ${new Date().toLocaleString('es-MX')}\n`);

// Endpoint para el ESP32
app.post('/api/control', async (req, res) => {
    const { estado, ip, dispositivo, intensidad } = req.body;
    
    const ahora = new Date();
    const fechaLocal = ahora.toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
    
    const registro = {
        estado: estado || 'OFF',
        ip: ip || 'desconocida',
        dispositivo: dispositivo || 'ESP32_Foco',
        intensidad: intensidad || 0,
        fecha: ahora.toISOString(),
        fecha_local: fechaLocal,
        timestamp: Date.now()
    };
    
    try {
        await axios.post(`${FIREBASE_URL}/historial.json`, registro);
        await axios.patch(`${FIREBASE_URL}/estado_actual.json`, {
            ultimo_estado: estado,
            ultima_ip: ip,
            ultima_fecha: fechaLocal
        });
        
        console.log(`✅ ${estado} desde ${ip} - ${fechaLocal}`);
        res.json({ success: true });
    } catch (error) {
        console.error(`❌ Error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// Endpoint para la web
app.post('/api/web-control', async (req, res) => {
    let clientIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    if (clientIP && clientIP.includes('::ffff:')) clientIP = clientIP.replace('::ffff:', '');
    if (clientIP === '::1' || clientIP === '127.0.0.1') clientIP = 'localhost';
    
    const { estado } = req.body;
    console.log(`🌐 Control desde: ${clientIP}`);
    
    try {
        const comando = estado === 'ON' ? 'H' : 'L';
        await axios.get(`http://192.168.0.200/${comando}?ip=${encodeURIComponent(clientIP)}`);
        res.json({ success: true, ip: clientIP });
    } catch (error) {
        console.error(`❌ Error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/ip-local', (req, res) => {
    let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    if (ip && ip.includes('::ffff:')) ip = ip.replace('::ffff:', '');
    if (ip === '::1' || ip === '127.0.0.1') ip = 'localhost';
    res.json({ ip: ip });
});

app.get('/api/estado', async (req, res) => {
    try {
        const response = await axios.get(`${FIREBASE_URL}/estado_actual.json`);
        res.json(response.data || { ultimo_estado: 'OFF' });
    } catch (error) {
        res.json({ ultimo_estado: 'OFF' });
    }
});

app.get('/api/estadisticas/:dias', async (req, res) => {
    const dias = parseInt(req.params.dias) || 7;
    
    try {
        const response = await axios.get(`${FIREBASE_URL}/historial.json`);
        const data = response.data || {};
        let registros = Object.values(data);
        
        const fechaLimite = new Date();
        fechaLimite.setDate(fechaLimite.getDate() - dias);
        
        const filtrados = registros.filter(r => new Date(r.fecha) >= fechaLimite);
        const encendidos = filtrados.filter(r => r.estado === 'ON').length;
        const apagados = filtrados.filter(r => r.estado === 'OFF').length;
        
        let tiempoPromedio = 0;
        let tiemposEncendido = [];
        let ultimoEncendido = null;
        
        const ordenados = [...filtrados].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
        for (const registro of ordenados) {
            if (registro.estado === 'ON') {
                ultimoEncendido = new Date(registro.fecha);
            } else if (registro.estado === 'OFF' && ultimoEncendido) {
                const duracion = (new Date(registro.fecha) - ultimoEncendido) / 1000 / 60;
                tiemposEncendido.push(duracion);
                ultimoEncendido = null;
            }
        }
        
        if (tiemposEncendido.length > 0) {
            tiempoPromedio = (tiemposEncendido.reduce((a, b) => a + b, 0) / tiemposEncendido.length).toFixed(1);
        }
        
        const eventosPorDia = {};
        filtrados.forEach(r => {
            const dia = new Date(r.fecha).toISOString().split('T')[0];
            if (!eventosPorDia[dia]) eventosPorDia[dia] = { on: 0, off: 0 };
            if (r.estado === 'ON') eventosPorDia[dia].on++;
            else eventosPorDia[dia].off++;
        });
        
        res.json({
            metricas: {
                total_encendidos: encendidos,
                total_apagados: apagados,
                total_eventos: filtrados.length,
                porcentaje_encendido: filtrados.length > 0 ? ((encendidos / filtrados.length) * 100).toFixed(1) : 0,
                tiempo_promedio_encendido: tiempoPromedio,
                eventos_por_dia: eventosPorDia
            }
        });
    } catch (error) {
        res.json({ metricas: { total_encendidos: 0, total_apagados: 0, total_eventos: 0, porcentaje_encendido: 0, tiempo_promedio_encendido: 0, eventos_por_dia: {} } });
    }
});

app.get('/api/historial', async (req, res) => {
    try {
        const response = await axios.get(`${FIREBASE_URL}/historial.json`);
        const data = response.data || {};
        
        const registros = Object.keys(data)
            .map(key => ({ id: key, ...data[key] }))
            .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
            .slice(0, 30);
        
        res.json(registros);
    } catch (error) {
        res.json([]);
    }
});

app.get('/api/test', (req, res) => {
    res.json({ success: true, message: 'Servidor funcionando' });
});

// Dashboard web
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>SmartControl - IoT Dashboard</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        :root {
            --bg-primary: #1a1a2e;
            --card-bg: rgba(255,255,255,0.1);
            --text-primary: #ffffff;
            --success: #4CAF50;
            --danger: #f44336;
        }
        body {
            font-family: 'Segoe UI', sans-serif;
            background: var(--bg-primary);
            padding: 20px;
            color: var(--text-primary);
        }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { text-align: center; margin-bottom: 30px; }
        .header h1 { font-size: 2em; background: linear-gradient(135deg, #667eea, #764ba2); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 20px; margin-bottom: 20px; }
        .card { background: var(--card-bg); backdrop-filter: blur(10px); border-radius: 20px; padding: 25px; }
        .status { font-size: 2em; padding: 20px; border-radius: 15px; text-align: center; margin: 20px 0; }
        .status.on { background: linear-gradient(135deg, var(--success), #45a049); animation: pulse 2s infinite; }
        .status.off { background: linear-gradient(135deg, var(--danger), #da190b); }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.8; } }
        .button-group { display: flex; gap: 15px; justify-content: center; margin: 20px 0; }
        .btn { padding: 15px 40px; font-size: 18px; font-weight: bold; border: none; border-radius: 50px; cursor: pointer; transition: transform 0.2s; }
        .btn:hover { transform: scale(1.05); }
        .btn-on { background: var(--success); color: white; }
        .btn-off { background: var(--danger); color: white; }
        .stats-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin-top: 20px; }
        .stat-item { text-align: center; padding: 15px; background: rgba(0,0,0,0.2); border-radius: 10px; }
        .stat-value { font-size: 1.8em; font-weight: bold; display: block; }
        .stat-label { font-size: 0.85em; opacity: 0.8; margin-top: 5px; }
        canvas { max-height: 300px; margin-top: 20px; }
        .toast { position: fixed; bottom: 20px; right: 20px; padding: 12px 24px; border-radius: 8px; color: white; animation: slideIn 0.3s ease; z-index: 1000; }
        .toast.success { background: var(--success); }
        .toast.error { background: var(--danger); }
        @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        .ip-info { font-size: 12px; opacity: 0.7; margin-top: 15px; padding: 8px; background: rgba(0,0,0,0.2); border-radius: 8px; text-align: center; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 8px; text-align: left; border-bottom: 1px solid rgba(255,255,255,0.1); }
        .refresh-btn { background: #667eea; color: white; border: none; padding: 5px 10px; border-radius: 5px; cursor: pointer; margin-left: 10px; }
        .badge-web { background: #2196F3; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px; margin-left: 5px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>💡 SmartControl IoT Dashboard</h1>
            <p>Hora local: <span id="horaLocal"></span></p>
        </div>
        <div class="grid">
            <div class="card">
                <h2>🎮 Control del Foco</h2>
                <div class="status off" id="statusDisplay"><span id="statusText">Cargando...</span></div>
                <div class="button-group">
                    <button class="btn btn-on" id="btnOn">🔛 ENCENDER</button>
                    <button class="btn btn-off" id="btnOff">⭕ APAGAR</button>
                </div>
                <div class="ip-info" id="ipInfo">🌐 Obteniendo tu IP...</div>
            </div>
            <div class="card">
                <h2>📊 Estadísticas (últimos 7 días)</h2>
                <div class="stats-grid">
                    <div class="stat-item"><span class="stat-value" id="encendidos">0</span><span class="stat-label">🔛 Encendidos</span></div>
                    <div class="stat-item"><span class="stat-value" id="apagados">0</span><span class="stat-label">⭕ Apagados</span></div>
                    <div class="stat-item"><span class="stat-value" id="total">0</span><span class="stat-label">📊 Total Eventos</span></div>
                    <div class="stat-item"><span class="stat-value" id="porcentaje">0%</span><span class="stat-label">📈 Tasa Encendido</span></div>
                    <div class="stat-item"><span class="stat-value" id="tiempoPromedio">0</span><span class="stat-label">⏱️ Promedio (min)</span></div>
                    <div class="stat-item"><span class="stat-value" id="mejorDia">-</span><span class="stat-label">🏆 Día más activo</span></div>
                </div>
            </div>
        </div>
        <div class="grid">
            <div class="card">
                <h2>📈 Actividad por Día</h2>
                <canvas id="activityChart"></canvas>
            </div>
            <div class="card">
                <h2>📋 Últimos Eventos <button class="refresh-btn" onclick="cargarHistorial()">🔄</button></h2>
                <div style="max-height: 300px; overflow-y: auto;">
                    <table style="width: 100%;">
                        <thead><tr><th>Hora Local</th><th>Acción</th><th>IP</th><th>Origen</th></tr></thead>
                        <tbody id="eventosLista"><tr><td colspan="4">Cargando...</td></tr></tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>
    <script>
        const API_URL = window.location.origin;
        let miIP = '';
        let activityChart = null;

        function actualizarHoraLocal() {
            const ahora = new Date();
            document.getElementById('horaLocal').innerHTML = ahora.toLocaleString('es-MX');
        }
        setInterval(actualizarHoraLocal, 1000);
        actualizarHoraLocal();

        async function obtenerMiIP() {
            try {
                const response = await fetch(API_URL + '/api/ip-local');
                const data = await response.json();
                miIP = data.ip;
                document.getElementById('ipInfo').innerHTML = '🌐 Tu IP: ' + miIP;
            } catch(e) { miIP = 'desconocida'; }
        }

        function mostrarToast(mensaje, tipo) {
            const toast = document.createElement('div');
            toast.className = 'toast ' + tipo;
            toast.textContent = mensaje;
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);
        }

        async function controlar(estado) {
            const btnOn = document.getElementById('btnOn');
            const btnOff = document.getElementById('btnOff');
            btnOn.disabled = btnOff.disabled = true;
            try {
                const response = await fetch(API_URL + '/api/web-control', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ estado: estado })
                });
                if (response.ok) {
                    const data = await response.json();
                    mostrarToast('✅ Foco ' + (estado === 'ON' ? 'encendido' : 'apagado') + ' desde ' + (data.ip || miIP), 'success');
                    setTimeout(() => { cargarEstado(); cargarEstadisticas(); cargarHistorial(); }, 1000);
                } else throw new Error();
            } catch(e) { mostrarToast('❌ Error al controlar', 'error'); }
            finally { btnOn.disabled = btnOff.disabled = false; }
        }

        async function cargarEstado() {
            try {
                const response = await fetch(API_URL + '/api/estado');
                const data = await response.json();
                const estado = data.ultimo_estado === 'ON' ? 'ENCENDIDO 💡' : 'APAGADO 🌙';
                const statusDiv = document.getElementById('statusDisplay');
                statusDiv.innerHTML = '<span id="statusText">Estado: ' + estado + '</span>';
                statusDiv.className = data.ultimo_estado === 'ON' ? 'status on' : 'status off';
            } catch(e) {}
        }

        async function cargarEstadisticas() {
            try {
                const response = await fetch(API_URL + '/api/estadisticas/7');
                const data = await response.json();
                document.getElementById('encendidos').textContent = data.metricas.total_encendidos || 0;
                document.getElementById('apagados').textContent = data.metricas.total_apagados || 0;
                document.getElementById('total').textContent = data.metricas.total_eventos || 0;
                document.getElementById('porcentaje').textContent = (data.metricas.porcentaje_encendido || 0) + '%';
                document.getElementById('tiempoPromedio').textContent = (data.metricas.tiempo_promedio_encendido || 0) + ' min';
                
                const eventosPorDia = data.metricas.eventos_por_dia || {};
                let mejorDia = '-', maxEventos = 0;
                for (const [dia, eventos] of Object.entries(eventosPorDia)) {
                    if ((eventos.on + eventos.off) > maxEventos) {
                        maxEventos = eventos.on + eventos.off;
                        mejorDia = dia;
                    }
                }
                document.getElementById('mejorDia').textContent = mejorDia;
                actualizarGrafica(eventosPorDia);
            } catch(e) {}
        }

        function actualizarGrafica(eventosPorDia) {
            const dias = Object.keys(eventosPorDia).slice(-7);
            const encendidos = dias.map(d => eventosPorDia[d]?.on || 0);
            const apagados = dias.map(d => eventosPorDia[d]?.off || 0);
            const ctx = document.getElementById('activityChart').getContext('2d');
            if (activityChart) activityChart.destroy();
            activityChart = new Chart(ctx, {
                type: 'bar',
                data: { labels: dias, datasets: [
                    { label: 'Encendidos', data: encendidos, backgroundColor: 'rgba(76,175,80,0.7)' },
                    { label: 'Apagados', data: apagados, backgroundColor: 'rgba(244,67,54,0.7)' }
                ]},
                options: { responsive: true, maintainAspectRatio: true }
            });
        }

        async function cargarHistorial() {
            try {
                const response = await fetch(API_URL + '/api/historial');
                const registros = await response.json();
                const tbody = document.getElementById('eventosLista');
                tbody.innerHTML = '';
                if (registros.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="4">No hay eventos. Usa los botones.</td></tr>';
                    return;
                }
                registros.forEach(reg => {
                    const row = tbody.insertRow();
                    let horaMostrar = reg.fecha_local || new Date(reg.fecha).toLocaleString('es-MX');
                    row.insertCell(0).innerHTML = horaMostrar;
                    row.insertCell(1).innerHTML = reg.estado === 'ON' ? '🔛 Encendido' : '⭕ Apagado';
                    row.insertCell(2).innerHTML = reg.ip;
                    row.insertCell(3).innerHTML = '<span class="badge-web">🌐 Web</span>';
                });
            } catch(e) { console.error(e); }
        }

        document.getElementById('btnOn').onclick = () => controlar('ON');
        document.getElementById('btnOff').onclick = () => controlar('OFF');
        obtenerMiIP();
        cargarEstado();
        cargarEstadisticas();
        cargarHistorial();
        setInterval(cargarEstado, 5000);
        setInterval(cargarEstadisticas, 10000);
        setInterval(cargarHistorial, 5000);
    </script>
</body>
</html>
    `);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`📍 Dashboard: http://192.168.0.185:${PORT}`);
    console.log(`🎮 ESP32: http://192.168.0.200`);
    console.log(`\n🔥 Sistema listo. Esperando comandos...\n`);
});

process.on('SIGINT', () => {
    console.log('\n👋 Servidor detenido');
    process.exit();
});
