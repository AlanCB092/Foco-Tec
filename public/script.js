const API_URL = 'http://localhost:3000';
const ESP32_IP = 'http://192.168.0.114'; // IP de tu ESP32

let estadoActual = 'OFF';
let historialCompleto = [];

// Función para controlar el foco
async function controlarFoco(estado, intensidad = 100) {
    try {
        // Mostrar loading
        mostrarLoading(true);
        
        // 1. Enviar comando al ESP32
        const comando = estado === 'ON' ? 'H' : 'L';
        const esp32Response = await fetch(`${ESP32_IP}/${comando}`);
        
        if (!esp32Response.ok) {
            throw new Error('Error al comunicarse con el ESP32');
        }
        
        // 2. Registrar en Firebase
        const response = await fetch(`${API_URL}/api/control`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                estado: estado,
                ip: await obtenerIPLocal(),
                dispositivo: 'Web Dashboard',
                intensidad: intensidad
            })
        });
        
        if (response.ok) {
            estadoActual = estado;
            actualizarUI();
            await cargarEstadisticas();
            await cargarHistorial();
            mostrarNotificacion(`Foco ${estado === 'ON' ? 'encendido' : 'apagado'} correctamente`, 'success');
        } else {
            throw new Error('Error al registrar en Firebase');
        }
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion(`Error: ${error.message}`, 'error');
    } finally {
        mostrarLoading(false);
    }
}

// Obtener IP pública
async function obtenerIPLocal() {
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        return data.ip;
    } catch (error) {
        return 'IP no disponible';
    }
}

// Cargar estadísticas
async function cargarEstadisticas(dias = 7) {
    try {
        const response = await fetch(`${API_URL}/api/estadisticas/${dias}`);
        const data = await response.json();
        
        if (data.metricas) {
            document.getElementById('totalEventos').textContent = data.metricas.total_eventos || 0;
            document.getElementById('totalEncendidos').textContent = data.metricas.total_encendidos || 0;
            document.getElementById('totalApagados').textContent = data.metricas.total_apagados || 0;
            document.getElementById('porcentajeEncendido').textContent = `${data.metricas.porcentaje_encendido}%`;
            
            // Actualizar estado actual
            if (data.estado_actual) {
                estadoActual = data.estado_actual.estado || 'OFF';
                actualizarUI();
            }
        }
        
        return data;
    } catch (error) {
        console.error('Error cargando estadísticas:', error);
        return null;
    }
}

// Cargar historial
async function cargarHistorial() {
    try {
        const response = await fetch(`${API_URL}/api/historial`);
        historialCompleto = await response.json();
        
        const filtroDias = parseInt(document.getElementById('filtroDias').value);
        const fechaLimite = new Date();
        fechaLimite.setDate(fechaLimite.getDate() - filtroDias);
        
        const historialFiltrado = historialCompleto.filter(reg => {
            const fechaReg = new Date(reg.fecha);
            return fechaReg >= fechaLimite;
        });
        
        actualizarTabla(historialFiltrado);
    } catch (error) {
        console.error('Error cargando historial:', error);
    }
}

// Actualizar tabla
function actualizarTabla(registros) {
    const tbody = document.getElementById('historialBody');
    
    if (!registros || registros.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="loading">No hay registros en este período</td></tr>';
        return;
    }
    
    tbody.innerHTML = registros.map(reg => `
        <tr>
            <td>${new Date(reg.fecha).toLocaleString('es-MX')}</td>
            <td><span class="badge-${reg.estado === 'ON' ? 'on' : 'off'}">${reg.estado === 'ON' ? '🔛 ENCENDIDO' : '⭕ APAGADO'}</span></td>
            <td>${reg.dispositivo || 'Desconocido'}</td>
            <td>${reg.ip || 'N/A'}</td>
            <td>${reg.intensidad || 100}%</td>
        </tr>
    `).join('');
}

// Actualizar UI
function actualizarUI() {
    const bulb = document.getElementById('bulb');
    const estadoTexto = document.getElementById('estadoTexto');
    const statusDot = document.getElementById('statusDot');
    
    if (estadoActual === 'ON') {
        bulb.classList.add('on');
        estadoTexto.textContent = 'ENCENDIDO';
        statusDot.className = 'status-dot on';
    } else {
        bulb.classList.remove('on');
        estadoTexto.textContent = 'APAGADO';
        statusDot.className = 'status-dot off';
    }
}

// Generar reporte
function generarReporte() {
    const filtroDias = parseInt(document.getElementById('filtroDias').value);
    const fechaLimite = new Date();
    fechaLimite.setDate(fechaLimite.getDate() - filtroDias);
    
    const historialFiltrado = historialCompleto.filter(reg => {
        const fechaReg = new Date(reg.fecha);
        return fechaReg >= fechaLimite;
    });
    
    let reporte = '='.repeat(60) + '\n';
    reporte += 'REPORTE DE CONTROL DE FOCO - FOCO TEC\n';
    reporte += '='.repeat(60) + '\n';
    reporte += `Fecha de generación: ${new Date().toLocaleString('es-MX')}\n`;
    reporte += `Período: Últimos ${filtroDias} días\n`;
    reporte += '='.repeat(60) + '\n\n';
    
    reporte += 'RESUMEN DE EVENTOS:\n';
    reporte += '-'.repeat(40) + '\n';
    const encendidos = historialFiltrado.filter(r => r.estado === 'ON').length;
    const apagados = historialFiltrado.filter(r => r.estado === 'OFF').length;
    reporte += `Total encendidos: ${encendidos}\n`;
    reporte += `Total apagados: ${apagados}\n`;
    reporte += `Total eventos: ${historialFiltrado.length}\n\n`;
    
    reporte += 'DETALLE DE EVENTOS:\n';
    reporte += '-'.repeat(40) + '\n';
    historialFiltrado.forEach((reg, index) => {
        reporte += `${index + 1}. ${new Date(reg.fecha).toLocaleString('es-MX')} | `;
        reporte += `${reg.estado === 'ON' ? 'ENCENDIDO' : 'APAGADO'} | `;
        reporte += `IP: ${reg.ip || 'N/A'} | `;
        reporte += `Intensidad: ${reg.intensidad || 100}%\n`;
    });
    
    reporte += '\n' + '='.repeat(60) + '\n';
    reporte += 'Fin del reporte\n';
    
    // Descargar archivo
    const blob = new Blob([reporte], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte_foco_${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    
    mostrarNotificacion('Reporte generado exitosamente', 'success');
}

// Exportar a Excel (CSV)
function exportarExcel() {
    const filtroDias = parseInt(document.getElementById('filtroDias').value);
    const fechaLimite = new Date();
    fechaLimite.setDate(fechaLimite.getDate() - filtroDias);
    
    const historialFiltrado = historialCompleto.filter(reg => {
        const fechaReg = new Date(reg.fecha);
        return fechaReg >= fechaLimite;
    });
    
    let csv = 'Fecha,Hora,Acción,Dispositivo,IP,Intensidad\n';
    
    historialFiltrado.forEach(reg => {
        const fecha = new Date(reg.fecha);
        csv += `"${fecha.toLocaleDateString('es-MX')}","${fecha.toLocaleTimeString('es-MX')}",`;
        csv += `"${reg.estado === 'ON' ? 'ENCENDIDO' : 'APAGADO'}","${reg.dispositivo || 'Desconocido'}","${reg.ip || 'N/A'}","${reg.intensidad || 100}%"\n`;
    });
    
    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `historial_foco_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    
    mostrarNotificacion('Archivo Excel generado', 'success');
}

// Mostrar notificaciones
function mostrarNotificacion(mensaje, tipo) {
    const notification = document.createElement('div');
    notification.textContent = mensaje;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        background: ${tipo === 'success' ? '#28a745' : '#dc3545'};
        color: white;
        border-radius: 10px;
        z-index: 1000;
        animation: slideIn 0.3s ease;
        font-weight: 500;
    `;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

// Mostrar loading
function mostrarLoading(mostrar) {
    if (mostrar) {
        const loader = document.createElement('div');
        loader.id = 'loader';
        loader.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 50px;
            height: 50px;
            border: 5px solid rgba(255,255,255,0.3);
            border-top-color: white;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            z-index: 2000;
        `;
        document.body.appendChild(loader);
    } else {
        const loader = document.getElementById('loader');
        if (loader) loader.remove();
    }
}

// Event Listeners
document.getElementById('btnEncender').addEventListener('click', () => {
    const intensidad = document.getElementById('intensidad').value;
    controlarFoco('ON', intensidad);
});

document.getElementById('btnApagar').addEventListener('click', () => {
    controlarFoco('OFF');
});

document.getElementById('intensidad').addEventListener('input', (e) => {
    document.getElementById('intensidadValor').textContent = `${e.target.value}%`;
});

document.getElementById('filtroDias').addEventListener('change', () => cargarHistorial());
document.getElementById('btnReporte').addEventListener('click', generarReporte);
document.getElementById('btnExcel').addEventListener('click', exportarExcel);

// Auto-refresh cada 10 segundos
setInterval(() => {
    cargarEstadisticas();
    cargarHistorial();
}, 10000);

// Inicializar
async function init() {
    await cargarEstadisticas();
    await cargarHistorial();
    actualizarUI();
}

init();
