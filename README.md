# 📱 MetroBús Medellín — App Móvil Nativa (Expo Go SDK 58) 🚌

Aplicación móvil nativa creada con **React Native + Expo SDK 58** e inspirada en la experiencia de usuario y diseño minimalista de **Uber**, adaptada a las rutas y telemetría de buses en tiempo real en **Medellín, Colombia**.

---

## 🚀 Cómo Iniciar en tu Celular

1. **Abre tu terminal en la carpeta del proyecto**:
   ```bash
   cd c:\Users\Usuario\Desktop\BusesApp
   ```

2. **Ejecuta el servidor de desarrollo de Expo con caché limpia**:
   ```bash
   npx expo start -c
   ```

3. **Escanea el código QR**:
   - **En iPhone (iOS)**: Abre la aplicación nativa de **Cámara** y enfoca el código QR. Toca la notificación superior para abrirlo directamente en **Expo Go**.
   - **En Android**: Abre la app **Expo Go** y toca **"Scan QR code"**.

> 💡 **Nota de conexión**: Asegúrate de que tu celular y tu computador estén conectados a la **misma red Wi-Fi**. Si estás usando datos móviles o una red con aislamiento, puedes iniciar con `npx expo start --tunnel`.

---

## 🛠️ Stack Tecnológico Nativo (SDK 58)

* **Expo SDK 58.0.0**: Totalmente compatible con la versión más reciente de la app Expo Go en iOS y Android.
* **React 19 & React Native 0.88**: Rendimiento nativo fluido a 60 FPS.
* **`react-native-maps`**: Renderizado vectorial acelerado por hardware para Google Maps y Apple Maps.
* **`expo-location`**: Integración con el sensor GPS real del dispositivo móvil.
* **`@expo/vector-icons`**: Iconografía vectorial estilizada (`Ionicons`, `FontAwesome5`).
* **Estilos personalizados Uber**:
  * `UBER_MAP_STYLE`: Cartografía clara, minimalista y de alto contraste.
  * `UBER_DARK_MAP_STYLE`: Modo nocturno monocromático ("Uber Black").

---

## 📍 Características y Funcionalidades Móviles

1. **Geolocalización en Medellín**:
   - Mapa centrado en el Valle de Aburrá (`[6.2442, -75.5812]`).
   - Marcador dinámico del usuario (`UserMarker`) con pulso azul y radio de precisión GPS.

2. **Rutas Reales Georreferenciadas**:
   - **304 - Circular Coonatra**: San Javier, Laureles, UPB, La 70, San Juan, Centro.
   - **130 - Poblado**: Aguacatala, Milla de Oro, Parque Lleras, San Diego, Oriental.
   - **315 - Santra**: Belén Rincón, Parque de Belén, Calle 30, Exposiciones, Alpujarra.
   - **190 - Laureles**: Los Colores, Estadio Girardot, Av. Nutibara, Parques de Laureles.

3. **Telemetría y Simulación GPS en Tiempo Real**:
   - **Rumbo dinámico (*bearing*)**: La flecha del marcador del bus rota suavemente siguiendo el ángulo real de la calle o curva por la que avanza.
   - **Velocidad satelital variable**: Oscilación realista entre 20 y 48 km/h.
   - **Indicador de ocupación**: Código de color en vivo (Verde: Baja, Amarillo: Media, Rojo: Alta).
   - **ETA dinámico**: Tiempo estimado en minutos a la siguiente parada.

4. **Experiencia de Usuario Móvil (UI/UX Estilo Uber)**:
   - **Barra flotante superior**: Búsqueda por placa (`TPM-482`, `STN-719`, etc.) o por ruta, selector rápido de chips horizontales y botón de recentrado con brújula.
   - **Bottom Sheet de Detalles**: Tarjeta emergente con métricas, lista desplegable de paradas con transferencias al **Metro de Medellín** y botón **"Seguir bus"** que bloquea la cámara y la desplaza en tiempo real acompañando al vehículo.
   - **Controles flotantes laterales**: Botón para alternar a **Modo Oscuro**, pausar/reanudar telemetría y selector de velocidad (1x, 2x, 4x).
