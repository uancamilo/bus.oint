# Transporte 🚍📍

Aplicación móvil para el rastreo y monitoreo en tiempo real de medios de transporte.

## 📌 Descripción

Proyecto orientado a la visualización, seguimiento vía GPS y monitoreo de unidades de transporte público y privado para optimizar la movilidad y el control de rutas.

## 🚀 Características Principales (Roadmap)

- **Seguimiento en tiempo real:** Ubicación geográfica en vivo de los vehículos sobre un mapa.
- **Rutas y paradas:** Consulta detallada de trayectos, paradas programadas y tiempos estimados de llegada.
- **Notificaciones y alertas:** Avisos de novedades, desvíos o incidencias en el trayecto.

## 🛠️ Estado del Proyecto

- **Backend funcional** en [`server/`](server/README.md): rutas y paradas oficiales de Medellín, buses simulados en tiempo real, búsqueda de destinos y planificador de viajes con hasta 2 transbordos. Incluye un mapa de prueba en `/demo`.
- **App móvil (Expo):** en desarrollo; falta conectarla al backend.

## ▶️ Probar el prototipo

```bash
cd server
npm install
npm run dev
```

Abre `http://localhost:3000/demo` en el computador, o la dirección `http://192.168.x.x:3000/demo` que muestra la terminal en un celular conectado a la misma Wi-Fi. Más detalles en [`server/README.md`](server/README.md).
