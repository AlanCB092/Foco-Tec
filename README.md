# 💡 SmartControl IoT - Foco Inteligente

Sistema completo para controlar un foco/LED mediante ESP32, con dashboard web, estadísticas en tiempo real y almacenamiento en Firebase.

## ✨ Características

- 📱 Control desde cualquier dispositivo (laptop, teléfono, tablet)
- 🌐 Acceso local y remoto (con ngrok)
- 📊 Dashboard con gráficas de actividad
- 📋 Historial de eventos con IP real del dispositivo
- ⏱️ Tiempo promedio de encendido
- 🏆 Día más activo
- 🔄 Reportes periódicos cada 15 minutos
- 🌙 Modo oscuro/claro
- 📍 Zona horaria México (CDMX)

## 🛠️ Tecnologías

| Capa | Tecnología |
|------|------------|
| Hardware | ESP32 |
| Backend | Node.js + Express |
| Base de Datos | Firebase Realtime Database |
| Frontend | HTML5, CSS3, JavaScript |
| Gráficas | Chart.js |
| Túneles | ngrok |

## 📦 Instalación

### 1. Clonar repositorio
```bash
git clone https://github.com/tu-usuario/foco-iot.git
cd foco-iot
