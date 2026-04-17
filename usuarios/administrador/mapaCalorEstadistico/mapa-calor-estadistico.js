// mapa-calor-estadistico.js - Módulo de análisis estadístico de incidentes
// VERSIÓN ACTUALIZADA - CON BOTÓN PANTALLA COMPLETA Y LEYENDA DE COLORES
// ANALIZA INCIDENCIAS NORMALES + INCIDENCIAS DE RECUPERACIÓN

import { IncidenciaManager } from '/clases/incidencia.js';
import { MercanciaPerdidaManager } from '/clases/incidenciaRecuperacion.js';
import { SucursalManager } from '/clases/sucursal.js';

// =============================================
// VARIABLES GLOBALES
// =============================================
let mapa = null;
let incidenciaManager = null;
let mercanciaManager = null;
let sucursalManager = null;
let organizacionActual = null;

// Datos principales
let incidenciasNormalesFiltradas = [];
let incidenciasRecuperacionFiltradas = [];
let sucursalesCache = [];
let agrupacionActual = 'estado';
let datosPorUbicacion = new Map();

// Gráficas
let charts = {};

// Popup personalizado
let popupDOM = null;

// Colores para niveles
const COLORES_NIVEL = {
    muyAlto: '#ef4444',  // Rojo
    alto: '#f97316',     // Naranja
    normal: '#eab308',   // Amarillo
    bajo: '#10b981'      // Verde
};

// Textos para la leyenda
const LEYENDA_NIVELES = [
    { color: '#ef4444', label: 'Muy alto (Outlier > promedio + 2σ)', nivel: 'muyAlto' },
    { color: '#f97316', label: 'Alto (> promedio + 0.5σ)', nivel: 'alto' },
    { color: '#eab308', label: 'Normal (Cerca del promedio)', nivel: 'normal' },
    { color: '#10b981', label: 'Bajo (< promedio - 0.5σ)', nivel: 'bajo' }
];

const COLORS = {
    critico: '#ef4444',
    alto: '#f97316',
    medio: '#eab308',
    bajo: '#10b981',
    pendiente: '#f59e0b',
    finalizada: '#10b981',
    azul: '#3b82f6',
    morado: '#8b5cf6',
    turquesa: '#14b8a6',
    naranja: '#f97316',
    verde: '#10b981'
};

// Límites de México
const MEXICO_BOUNDS = { north: 32.7, south: 14.5, west: -118.5, east: -86.7 };

// Coordenadas de estados
const ESTADOS_COORDENADAS = {
    'Aguascalientes': [21.885, -102.291],
    'Baja California': [32.000, -115.500],
    'Baja California Sur': [25.000, -111.000],
    'Campeche': [19.830, -90.530],
    'Chiapas': [16.750, -92.630],
    'Chihuahua': [28.630, -106.070],
    'Ciudad de México': [19.432, -99.133],
    'Coahuila': [27.000, -102.000],
    'Colima': [19.240, -103.720],
    'Durango': [24.020, -104.670],
    'Guanajuato': [21.020, -101.260],
    'Guerrero': [17.550, -99.500],
    'Hidalgo': [20.100, -98.750],
    'Jalisco': [20.659, -103.349],
    'México': [19.350, -99.630],
    'Michoacán': [19.700, -101.190],
    'Morelos': [18.680, -99.100],
    'Nayarit': [21.500, -104.890],
    'Nuevo León': [25.670, -100.300],
    'Oaxaca': [17.070, -96.720],
    'Puebla': [19.040, -98.200],
    'Querétaro': [20.590, -100.390],
    'Quintana Roo': [19.600, -87.930],
    'San Luis Potosí': [22.150, -100.980],
    'Sinaloa': [24.800, -107.390],
    'Sonora': [29.300, -110.330],
    'Tabasco': [17.990, -92.920],
    'Tamaulipas': [24.290, -98.560],
    'Tlaxcala': [19.310, -98.240],
    'Veracruz': [19.170, -96.130],
    'Yucatán': [20.970, -89.620],
    'Zacatecas': [22.770, -102.580]
};

// =============================================
// UTILIDADES
// =============================================
function formatearMoneda(valor) {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(valor || 0);
}

function formatearPorcentaje(valor) {
    return `${(valor || 0).toFixed(2)}%`;
}

function setElementText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function escapeHTML(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function obtenerUsuarioActual() {
    try {
        const adminInfo = localStorage.getItem('adminInfo');
        if (adminInfo) {
            const data = JSON.parse(adminInfo);
            return {
                id: data.id || data.uid,
                organizacion: data.organizacion,
                organizacionCamelCase: data.organizacionCamelCase || 'pollosRay'
            };
        }
        const userData = JSON.parse(localStorage.getItem('userData') || '{}');
        return {
            organizacionCamelCase: userData.organizacionCamelCase || 'pollosRay'
        };
    } catch (error) {
        return { organizacionCamelCase: 'pollosRay' };
    }
}

// =============================================
// PANTALLA COMPLETA
// =============================================
function toggleFullscreen() {
    const mapContainer = document.getElementById('mapContainer');
    if (!mapContainer) return;
    
    if (!document.fullscreenElement) {
        mapContainer.requestFullscreen().catch(err => {
            console.error(`Error al entrar en pantalla completa: ${err.message}`);
        });
    } else {
        document.exitFullscreen();
    }
}

function agregarBotonPantallaCompleta() {
    const mapContainer = document.getElementById('mapContainer');
    if (!mapContainer) return;
    
    // Crear botón de pantalla completa
    const fullscreenBtn = document.createElement('button');
    fullscreenBtn.id = 'fullscreen-map-btn';
    fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i> Pantalla completa';
    fullscreenBtn.style.cssText = `
        position: absolute;
        top: 15px;
        left: 15px;
        z-index: 1000;
        background: linear-gradient(145deg, #1a1a1a, #0f0f0f);
        border: 1px solid var(--color-accent-primary, #00cfff);
        border-radius: 8px;
        padding: 8px 16px;
        color: white;
        cursor: pointer;
        font-family: 'Orbitron', sans-serif;
        font-size: 0.7rem;
        font-weight: 600;
        text-transform: uppercase;
        display: flex;
        align-items: center;
        gap: 8px;
        transition: all 0.2s ease;
        backdrop-filter: blur(5px);
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
    `;
    
    fullscreenBtn.addEventListener('mouseenter', () => {
        fullscreenBtn.style.transform = 'translateY(-2px)';
        fullscreenBtn.style.boxShadow = '0 0 15px var(--color-accent-primary, #00cfff)';
    });
    fullscreenBtn.addEventListener('mouseleave', () => {
        fullscreenBtn.style.transform = 'translateY(0px)';
        fullscreenBtn.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.3)';
    });
    fullscreenBtn.addEventListener('click', toggleFullscreen);
    
    mapContainer.style.position = 'relative';
    mapContainer.appendChild(fullscreenBtn);
    
    // Cambiar ícono cuando se entra/sale de pantalla completa
    document.addEventListener('fullscreenchange', () => {
        if (document.fullscreenElement) {
            fullscreenBtn.innerHTML = '<i class="fas fa-compress"></i> Salir';
        } else {
            fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i> Pantalla completa';
        }
    });
}

// =============================================
// LEYENDA DE COLORES
// =============================================
function agregarLeyendaColores() {
    const mapContainer = document.getElementById('mapContainer');
    if (!mapContainer) return;
    
    // Crear contenedor de la leyenda
    const legendContainer = document.createElement('div');
    legendContainer.id = 'map-legend';
    legendContainer.style.cssText = `
        position: absolute;
        bottom: 15px;
        left: 15px;
        right: 15px;
        z-index: 1000;
        background: linear-gradient(135deg, rgba(10, 10, 10, 0.95), rgba(20, 20, 20, 0.95));
        backdrop-filter: blur(10px);
        border-radius: 12px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        padding: 10px 16px;
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 20px;
        font-family: 'Rajdhani', sans-serif;
        font-size: 0.7rem;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
        pointer-events: auto;
    `;
    
    // Título de la leyenda
    const titleSpan = document.createElement('span');
    titleSpan.style.cssText = `
        color: var(--color-text-primary, white);
        font-family: 'Orbitron', sans-serif;
        font-size: 0.65rem;
        text-transform: uppercase;
        letter-spacing: 1px;
        display: flex;
        align-items: center;
        gap: 6px;
        margin-right: 5px;
    `;
    titleSpan.innerHTML = '<i class="fas fa-chart-line"></i> Nivel de riesgo:';
    legendContainer.appendChild(titleSpan);
    
    // Añadir cada nivel de color
    LEYENDA_NIVELES.forEach(nivel => {
        const item = document.createElement('div');
        item.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
            transition: transform 0.2s ease;
            padding: 4px 8px;
            border-radius: 20px;
        `;
        
        item.addEventListener('mouseenter', () => {
            item.style.transform = 'translateY(-2px)';
            item.style.background = 'rgba(255, 255, 255, 0.1)';
        });
        item.addEventListener('mouseleave', () => {
            item.style.transform = 'translateY(0px)';
            item.style.background = 'transparent';
        });
        
        const colorBox = document.createElement('div');
        colorBox.style.cssText = `
            width: 20px;
            height: 20px;
            border-radius: 4px;
            background: ${nivel.color};
            box-shadow: 0 0 8px ${nivel.color};
        `;
        
        const label = document.createElement('span');
        label.style.cssText = `
            color: var(--color-text-secondary, #aaa);
            font-size: 0.7rem;
        `;
        label.textContent = nivel.label;
        
        item.appendChild(colorBox);
        item.appendChild(label);
        legendContainer.appendChild(item);
    });
    
    // Añadir tooltip informativo
    const infoIcon = document.createElement('div');
    infoIcon.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: center;
        margin-left: auto;
        cursor: help;
        color: var(--color-accent-primary, #00cfff);
        font-size: 0.8rem;
    `;
    infoIcon.innerHTML = '<i class="fas fa-info-circle"></i>';
    infoIcon.title = 'Los colores se calculan automáticamente basados en el promedio y desviación estándar de los incidentes por ubicación';
    legendContainer.appendChild(infoIcon);
    
    mapContainer.appendChild(legendContainer);
}

// =============================================
// INICIALIZACIÓN
// =============================================
async function inicializar() {
    try {
        const usuario = obtenerUsuarioActual();
        organizacionActual = {
            nombre: usuario.organizacion || 'Mi Empresa',
            camelCase: usuario.organizacionCamelCase || 'pollosRay'
        };

        incidenciaManager = new IncidenciaManager();
        mercanciaManager = new MercanciaPerdidaManager();
        sucursalManager = new SucursalManager();

        await cargarSucursales();

        const hoy = new Date();
        const hace30Dias = new Date();
        hace30Dias.setDate(hoy.getDate() - 30);
        
        const fechaInicio = document.getElementById('fechaInicio');
        const fechaFin = document.getElementById('fechaFin');
        
        if (fechaInicio) fechaInicio.value = hace30Dias.toISOString().split('T')[0];
        if (fechaFin) fechaFin.value = hoy.toISOString().split('T')[0];

        inicializarMapa();

        document.getElementById('btnAnalizar')?.addEventListener('click', analizarDatos);
        document.getElementById('agrupacion')?.addEventListener('change', (e) => {
            agrupacionActual = e.target.value;
            if (incidenciasNormalesFiltradas.length > 0 || incidenciasRecuperacionFiltradas.length > 0) {
                procesarDatosPorUbicacion();
                actualizarMapa();
                actualizarTabla();
                actualizarGraficoTop();
            }
        });

        await analizarDatos();

    } catch (error) {
        console.error('Error en inicialización:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'No se pudo inicializar el módulo: ' + error.message,
            background: 'var(--color-bg-primary)',
            color: 'white'
        });
    }
}

function cerrarPopup() {
    if (popupDOM && popupDOM.parentNode) {
        popupDOM.parentNode.removeChild(popupDOM);
        popupDOM = null;
    }
}

async function cargarSucursales() {
    try {
        if (organizacionActual.camelCase) {
            sucursalesCache = await sucursalManager.getSucursalesByOrganizacion(organizacionActual.camelCase);
        }
    } catch (error) {
        console.error('Error cargando sucursales:', error);
        sucursalesCache = [];
    }
}

function inicializarMapa() {
    mapa = L.map('mapaCalor').setView([23.6345, -102.5528], 6);
    
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 12,
        minZoom: 5
    }).addTo(mapa);

    const southWest = L.latLng(MEXICO_BOUNDS.south, MEXICO_BOUNDS.west);
    const northEast = L.latLng(MEXICO_BOUNDS.north, MEXICO_BOUNDS.east);
    const mexicoBounds = L.latLngBounds(southWest, northEast);
    
    mapa.setMaxBounds(mexicoBounds);
    
    mapa.on('drag', function() {
        mapa.panInsideBounds(mexicoBounds, { animate: true });
        cerrarPopup();
    });
    
    mapa.on('zoomend', function() {
        if (mapa.getBounds().intersects(mexicoBounds)) return;
        mapa.fitBounds(mexicoBounds);
    });
    
    mapa.on('click', function(e) {
        if (popupDOM) {
            const popupElement = document.querySelector('.dynamic-map-popup');
            if (popupElement && !popupElement.contains(e.originalEvent.target)) {
                cerrarPopup();
            }
        }
    });
    
    // Agregar controles UI al mapa
    setTimeout(() => {
        agregarBotonPantallaCompleta();
        agregarLeyendaColores();
    }, 100);
}

// =============================================
// ANÁLISIS ESTADÍSTICO PRINCIPAL
// =============================================
async function analizarDatos() {
    mostrarLoading(true);
    
    try {
        const fechaInicio = document.getElementById('fechaInicio')?.value;
        const fechaFin = document.getElementById('fechaFin')?.value;
        const tipoEvento = document.getElementById('tipoEvento')?.value;
        
        if (!fechaInicio || !fechaFin) {
            Swal.fire({
                icon: 'warning',
                title: 'Fechas requeridas',
                text: 'Selecciona un rango de fechas para analizar',
                background: 'var(--color-bg-primary)',
                color: 'white'
            });
            mostrarLoading(false);
            return;
        }
        
        const fechaInicioObj = new Date(fechaInicio);
        fechaInicioObj.setHours(0, 0, 0, 0);
        const fechaFinObj = new Date(fechaFin);
        fechaFinObj.setHours(23, 59, 59, 999);
        
        let incidenciasNormales = await incidenciaManager.getIncidenciasByOrganizacion(organizacionActual.camelCase);
        
        incidenciasNormales = incidenciasNormales.filter(inc => {
            const fechaInc = inc.fechaInicio instanceof Date ? inc.fechaInicio : new Date(inc.fechaInicio);
            return fechaInc >= fechaInicioObj && fechaInc <= fechaFinObj;
        });
        
        let incidenciasRecuperacion = await mercanciaManager.getRegistrosByOrganizacion(organizacionActual.camelCase);
        
        incidenciasRecuperacion = incidenciasRecuperacion.filter(r => {
            const fechaReg = r.fecha ? new Date(r.fecha) : null;
            return fechaReg && fechaReg >= fechaInicioObj && fechaReg <= fechaFinObj;
        });
        
        if (tipoEvento !== 'todos') {
            incidenciasRecuperacion = incidenciasRecuperacion.filter(r => r.tipoEvento === tipoEvento);
        }
        
        incidenciasNormalesFiltradas = incidenciasNormales;
        incidenciasRecuperacionFiltradas = incidenciasRecuperacion;
        
        const totalIncidencias = incidenciasNormales.length + incidenciasRecuperacion.length;
        
        if (totalIncidencias === 0) {
            Swal.fire({
                icon: 'info',
                title: 'Sin datos',
                text: 'No hay incidencias en el período seleccionado',
                background: 'var(--color-bg-primary)',
                color: 'white'
            });
            mostrarLoading(false);
            limpiarVisualizacion();
            return;
        }
        
        calcularEstadisticasGenerales(incidenciasNormales, incidenciasRecuperacion);
        procesarDatosPorUbicacion();
        actualizarMapa();
        actualizarGraficas(incidenciasNormales, incidenciasRecuperacion);
        actualizarTabla();
        
        const fechaEl = document.getElementById('fechaActualizacion');
        if (fechaEl) {
            fechaEl.textContent = new Date().toLocaleString('es-MX');
        }
        
    } catch (error) {
        console.error('Error analizando datos:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'No se pudieron analizar los datos: ' + error.message,
            background: 'var(--color-bg-primary)',
            color: 'white'
        });
    } finally {
        mostrarLoading(false);
    }
}

function calcularEstadisticasGenerales(incidenciasNormales, incidenciasRecuperacion) {
    const totalIncidentes = incidenciasNormales.length + incidenciasRecuperacion.length;
    
    const totalPerdido = incidenciasRecuperacion.reduce((sum, r) => sum + (r.montoPerdido || 0), 0);
    const totalRecuperado = incidenciasRecuperacion.reduce((sum, r) => sum + (r.montoRecuperado || 0), 0);
    const tasaRecuperacion = totalPerdido > 0 ? (totalRecuperado / totalPerdido) * 100 : 0;
    const promedioEvento = totalIncidentes > 0 ? totalPerdido / totalIncidentes : 0;
    
    const criticasAltas = incidenciasNormales.filter(i => i.nivelRiesgo === 'critico' || i.nivelRiesgo === 'alto').length;
    
    const incidentesPorEstado = {};
    
    incidenciasNormales.forEach(inc => {
        const sucursal = sucursalesCache.find(s => s.id === inc.sucursalId);
        const estado = sucursal?.estado || 'Desconocido';
        incidentesPorEstado[estado] = (incidentesPorEstado[estado] || 0) + 1;
    });
    
    incidenciasRecuperacion.forEach(rec => {
        const sucursal = sucursalesCache.find(s => s.id === rec.sucursalId);
        const estado = sucursal?.estado || 'Desconocido';
        incidentesPorEstado[estado] = (incidentesPorEstado[estado] || 0) + 1;
    });
    
    let estadoTop = 'Ninguno';
    let maxIncidentes = 0;
    for (const [estado, count] of Object.entries(incidentesPorEstado)) {
        if (count > maxIncidentes) {
            maxIncidentes = count;
            estadoTop = estado;
        }
    }
    
    setElementText('totalIncidentes', totalIncidentes);
    setElementText('totalPerdido', formatearMoneda(totalPerdido));
    setElementText('totalRecuperado', formatearMoneda(totalRecuperado));
    setElementText('tasaRecuperacion', formatearPorcentaje(tasaRecuperacion));
    setElementText('promedioEvento', formatearMoneda(promedioEvento));
    setElementText('estadoTop', estadoTop.length > 15 ? estadoTop.substring(0, 12) + '...' : estadoTop);
    
    window.statsGenerales = {
        totalIncidentes,
        criticasAltas,
        totalPerdido,
        totalRecuperado,
        tasaRecuperacion
    };
}

function procesarDatosPorUbicacion() {
    datosPorUbicacion.clear();
    
    const agrupado = new Map();
    
    for (const incidencia of incidenciasNormalesFiltradas) {
        const sucursal = sucursalesCache.find(s => s.id === incidencia.sucursalId);
        let ubicacionNombre;
        let ubicacionCoordenadas;
        
        if (agrupacionActual === 'estado') {
            ubicacionNombre = sucursal?.estado || 'Desconocido';
            ubicacionCoordenadas = ESTADOS_COORDENADAS[ubicacionNombre] || [23.6345, -102.5528];
        } else {
            ubicacionNombre = sucursal?.nombre || 'Desconocido';
            ubicacionCoordenadas = sucursal?.latitud && sucursal?.longitud ? 
                [parseFloat(sucursal.latitud), parseFloat(sucursal.longitud)] : [23.6345, -102.5528];
        }
        
        if (!agrupado.has(ubicacionNombre)) {
            agrupado.set(ubicacionNombre, {
                nombre: ubicacionNombre,
                coordenadas: ubicacionCoordenadas,
                incidentesNormales: 0,
                incidentesRecuperacion: 0,
                criticasAltas: 0,
                totalPerdido: 0,
                totalRecuperado: 0,
                registrosNormales: [],
                registrosRecuperacion: []
            });
        }
        
        const data = agrupado.get(ubicacionNombre);
        data.incidentesNormales++;
        data.registrosNormales.push(incidencia);
        
        if (incidencia.nivelRiesgo === 'critico' || incidencia.nivelRiesgo === 'alto') {
            data.criticasAltas++;
        }
    }
    
    for (const registro of incidenciasRecuperacionFiltradas) {
        const sucursal = sucursalesCache.find(s => s.id === registro.sucursalId);
        let ubicacionNombre;
        let ubicacionCoordenadas;
        
        if (agrupacionActual === 'estado') {
            ubicacionNombre = sucursal?.estado || 'Desconocido';
            ubicacionCoordenadas = ESTADOS_COORDENADAS[ubicacionNombre] || [23.6345, -102.5528];
        } else {
            ubicacionNombre = sucursal?.nombre || 'Desconocido';
            ubicacionCoordenadas = sucursal?.latitud && sucursal?.longitud ? 
                [parseFloat(sucursal.latitud), parseFloat(sucursal.longitud)] : [23.6345, -102.5528];
        }
        
        if (!agrupado.has(ubicacionNombre)) {
            agrupado.set(ubicacionNombre, {
                nombre: ubicacionNombre,
                coordenadas: ubicacionCoordenadas,
                incidentesNormales: 0,
                incidentesRecuperacion: 0,
                criticasAltas: 0,
                totalPerdido: 0,
                totalRecuperado: 0,
                registrosNormales: [],
                registrosRecuperacion: []
            });
        }
        
        const data = agrupado.get(ubicacionNombre);
        data.incidentesRecuperacion++;
        data.totalPerdido += registro.montoPerdido || 0;
        data.totalRecuperado += registro.montoRecuperado || 0;
        data.registrosRecuperacion.push(registro);
    }
    
    const ubicaciones = Array.from(agrupado.values());
    
    const maxPerdido = Math.max(...ubicaciones.map(u => u.totalPerdido), 1);
    const maxIncidentes = Math.max(...ubicaciones.map(u => u.incidentesNormales + u.incidentesRecuperacion), 1);
    const maxCriticas = Math.max(...ubicaciones.map(u => u.criticasAltas), 1);
    
    for (const ubicacion of ubicaciones) {
        const totalIncidentes = ubicacion.incidentesNormales + ubicacion.incidentesRecuperacion;
        const perdidoNormalizado = ubicacion.totalPerdido / maxPerdido;
        const incidentesNormalizado = totalIncidentes / maxIncidentes;
        const criticasNormalizado = ubicacion.criticasAltas / maxCriticas;
        
        const puntuacion = (incidentesNormalizado * 0.4) + (perdidoNormalizado * 0.3) + (criticasNormalizado * 0.3);
        ubicacion.puntuacion = puntuacion;
    }
    
    const puntuaciones = ubicaciones.map(u => u.puntuacion);
    const promedio = puntuaciones.reduce((a, b) => a + b, 0) / puntuaciones.length;
    const desviacion = Math.sqrt(puntuaciones.map(x => Math.pow(x - promedio, 2)).reduce((a, b) => a + b, 0) / puntuaciones.length);
    
    for (const ubicacion of ubicaciones) {
        const zScore = desviacion > 0 ? (ubicacion.puntuacion - promedio) / desviacion : 0;
        
        let nivel;
        let color;
        
        if (zScore > 1.5) {
            nivel = 'muyAlto';
            color = COLORES_NIVEL.muyAlto;
        } else if (zScore > 0.5) {
            nivel = 'alto';
            color = COLORES_NIVEL.alto;
        } else if (zScore < -0.5) {
            nivel = 'bajo';
            color = COLORES_NIVEL.bajo;
        } else {
            nivel = 'normal';
            color = COLORES_NIVEL.normal;
        }
        
        ubicacion.nivel = nivel;
        ubicacion.color = color;
        ubicacion.zScore = zScore;
        ubicacion.totalIncidentes = ubicacion.incidentesNormales + ubicacion.incidentesRecuperacion;
        ubicacion.tasaRecuperacion = ubicacion.totalPerdido > 0 ? 
            (ubicacion.totalRecuperado / ubicacion.totalPerdido) * 100 : 0;
        ubicacion.perdidaNeta = ubicacion.totalPerdido - ubicacion.totalRecuperado;
        
        datosPorUbicacion.set(ubicacion.nombre, ubicacion);
    }
    
    window.estadisticasGlobales = { promedio, desviacion };
}

// =============================================
// MAPA CON MARCADORES Y POPUP DOM
// =============================================
function actualizarMapa() {
    if (!mapa) return;
    
    mapa.eachLayer(layer => {
        if (layer instanceof L.Marker || layer instanceof L.CircleMarker || layer instanceof L.GeoJSON) {
            mapa.removeLayer(layer);
        }
    });
    
    if (datosPorUbicacion.size === 0) {
        mostrarMensajeSinDatos();
        return;
    }
    
    const bounds = [];
    
    for (const [nombre, datos] of datosPorUbicacion) {
        const [lat, lng] = datos.coordenadas;
        bounds.push([lat, lng]);
        
        const icono = crearIconoPersonalizado(datos.color, datos.totalIncidentes);
        
        const marcador = L.marker([lat, lng], { icon: icono })
            .bindTooltip(`${nombre}<br>Incidentes: ${datos.totalIncidentes}<br>Pérdida: ${formatearMoneda(datos.totalPerdido)}`, {
                className: 'custom-tooltip',
                sticky: true
            })
            .addTo(mapa);
        
        marcador.on('click', (e) => {
            cerrarPopup();
            
            const formatter = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
            
            let nivelTexto = '';
            let nivelColor = '';
            switch (datos.nivel) {
                case 'muyAlto': nivelTexto = 'MUY ALTO (Outlier)'; nivelColor = COLORES_NIVEL.muyAlto; break;
                case 'alto': nivelTexto = 'ALTO (Sobre promedio)'; nivelColor = COLORES_NIVEL.alto; break;
                case 'normal': nivelTexto = 'NORMAL (Cerca del promedio)'; nivelColor = COLORES_NIVEL.normal; break;
                case 'bajo': nivelTexto = 'BAJO (Debajo del promedio)'; nivelColor = COLORES_NIVEL.bajo; break;
            }
            
            const point = mapa.latLngToContainerPoint([lat, lng]);
            const popupWidth = 340;
            const offsetX = 20;
            const offsetY = -40;
            
            let left = point.x + offsetX;
            let top = point.y + offsetY;
            
            const mapContainer = document.getElementById('mapaCalor');
            const mapRect = mapContainer.getBoundingClientRect();
            if (left + popupWidth > mapRect.width) {
                left = point.x - popupWidth - offsetX;
            }
            if (left < 10) left = 10;
            if (top < 10) top = 10;
            
            const popupDiv = document.createElement('div');
            popupDiv.className = 'dynamic-map-popup';
            popupDiv.style.cssText = `
                position: absolute;
                left: ${left}px;
                top: ${top}px;
                z-index: 999999 !important;
                background: linear-gradient(135deg, rgba(10, 10, 10, 0.98), rgba(20, 20, 20, 0.98));
                backdrop-filter: blur(10px);
                border-radius: 20px;
                border: 1px solid ${datos.color};
                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05);
                width: 340px;
                max-width: 85vw;
                font-family: 'Rajdhani', sans-serif;
                overflow: hidden;
                pointer-events: auto;
            `;
            
            popupDiv.innerHTML = `
                <div style="padding: 14px 16px; border-bottom: 1px solid rgba(255, 255, 255, 0.1); background: rgba(0, 0, 0, 0.3);">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <i class="fas fa-map-marker-alt" style="color: ${datos.color}; font-size: 1.2rem;"></i>
                        <span style="font-family: 'Orbitron', sans-serif; font-weight: 600; color: white; letter-spacing: 0.5px;">${escapeHTML(datos.nombre)}</span>
                    </div>
                </div>
                <div style="padding: 16px;">
                    <div style="background: ${datos.color}20; border-radius: 12px; padding: 10px; margin-bottom: 16px; text-align: center;">
                        <strong style="color: ${nivelColor};">📊 ${nivelTexto}</strong>
                        <div style="font-size: 0.7rem; margin-top: 4px; color: #9ca3af;">
                            Puntuación Z: ${datos.zScore.toFixed(2)} | Promedio: ${window.estadisticasGlobales?.promedio?.toFixed(2) || 0}
                        </div>
                    </div>
                    <div style="display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 16px;">
                        <div style="flex: 1; min-width: 70px; text-align: center; padding: 8px 6px; background: rgba(0, 0, 0, 0.4); border-radius: 12px; border-left: 2px solid ${datos.color};">
                            <div style="font-size: 0.6rem; text-transform: uppercase; color: #9ca3af;">Incidentes</div>
                            <div style="font-size: 1rem; font-weight: 700; color: white;">${datos.totalIncidentes}</div>
                        </div>
                        <div style="flex: 1; min-width: 70px; text-align: center; padding: 8px 6px; background: rgba(0, 0, 0, 0.4); border-radius: 12px; border-left: 2px solid #ef4444;">
                            <div style="font-size: 0.6rem; text-transform: uppercase; color: #9ca3af;">Críticas+Altas</div>
                            <div style="font-size: 1rem; font-weight: 700; color: #ef4444;">${datos.criticasAltas}</div>
                        </div>
                        <div style="flex: 1; min-width: 70px; text-align: center; padding: 8px 6px; background: rgba(0, 0, 0, 0.4); border-radius: 12px; border-left: 2px solid #10b981;">
                            <div style="font-size: 0.6rem; text-transform: uppercase; color: #9ca3af;">Recuperación</div>
                            <div style="font-size: 1rem; font-weight: 700; color: #10b981;">${datos.incidentesRecuperacion}</div>
                        </div>
                    </div>
                    <div style="background: rgba(0, 0, 0, 0.3); border-radius: 12px; padding: 12px; margin-bottom: 16px;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                            <span style="color: #9ca3af; font-size: 0.7rem;"><i class="fas fa-dollar-sign"></i> Perdido:</span>
                            <span style="color: #ef4444; font-weight: 600;">${formatter.format(datos.totalPerdido)}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                            <span style="color: #9ca3af; font-size: 0.7rem;"><i class="fas fa-undo-alt"></i> Recuperado:</span>
                            <span style="color: #10b981; font-weight: 600;">${formatter.format(datos.totalRecuperado)}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                            <span style="color: #9ca3af; font-size: 0.7rem;"><i class="fas fa-chart-line"></i> Pérdida neta:</span>
                            <span style="color: ${datos.perdidaNeta > 0 ? '#ef4444' : '#10b981'}; font-weight: 600;">${formatter.format(datos.perdidaNeta)}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span style="color: #9ca3af; font-size: 0.7rem;"><i class="fas fa-percent"></i> Recuperación:</span>
                            <span style="color: #3b82f6; font-weight: 600;">${datos.tasaRecuperacion.toFixed(2)}%</span>
                        </div>
                    </div>
                    <div style="display: flex; justify-content: center;">
                        <button class="close-popup-btn" style="background: linear-gradient(145deg, #1a1a1a, #0f0f0f); border: 1px solid ${datos.color}; border-radius: 10px; padding: 8px 20px; color: white; cursor: pointer; font-family: 'Orbitron', sans-serif; font-size: 0.7rem; font-weight: 600; text-transform: uppercase; transition: all 0.2s ease; width: 100%;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 0 15px ${datos.color}';" onmouseout="this.style.transform='translateY(0px)'; this.style.boxShadow='none';">Cerrar</button>
                    </div>
                </div>
            `;
            
            const mapElement = document.getElementById('mapaCalor');
            mapElement.style.position = 'relative';
            mapElement.appendChild(popupDiv);
            popupDOM = popupDiv;
            
            const closeBtn = popupDiv.querySelector('.close-popup-btn');
            if (closeBtn) {
                closeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    cerrarPopup();
                });
            }
            
            popupDiv.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        });
        
        const radio = Math.min(40 + (datos.totalIncidentes * 2), 120);
        L.circleMarker([lat, lng], {
            radius: radio,
            fillColor: datos.color,
            color: datos.color,
            weight: 1,
            opacity: 0.4,
            fillOpacity: 0.15
        }).addTo(mapa);
    }
    
    if (bounds.length > 0) {
        const group = L.featureGroup(bounds.map(b => L.marker(b)));
        mapa.fitBounds(group.getBounds().pad(0.2));
    }
}

function crearIconoPersonalizado(color, incidentes) {
    const tamanio = Math.min(32 + Math.floor(incidentes / 5), 48);
    const canvas = document.createElement('canvas');
    canvas.width = tamanio;
    canvas.height = tamanio;
    const ctx = canvas.getContext('2d');
    
    const centerX = tamanio / 2;
    const centerY = tamanio / 2;
    const radius = tamanio / 2 - 2;
    
    ctx.clearRect(0, 0, tamanio, tamanio);
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.floor(tamanio / 2.5)}px "Orbitron", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(Math.min(incidentes, 99).toString(), centerX, centerY);
    
    const iconUrl = canvas.toDataURL();
    return L.icon({
        iconUrl: iconUrl,
        iconSize: [tamanio, tamanio],
        iconAnchor: [tamanio / 2, tamanio / 2],
        popupAnchor: [0, -tamanio / 2]
    });
}

function mostrarMensajeSinDatos() {
    const mensaje = L.divIcon({
        html: '<div style="background: rgba(0,0,0,0.8); padding: 10px 20px; border-radius: 20px; color: white;"><i class="fas fa-info-circle"></i> Sin datos para mostrar</div>',
        iconSize: [200, 40],
        className: 'custom-div-icon'
    });
    L.marker([23.6345, -102.5528], { icon: mensaje }).addTo(mapa);
}

// =============================================
// GRÁFICAS
// =============================================
function actualizarGraficas(incidenciasNormales, incidenciasRecuperacion) {
    actualizarGraficoEvolucion(incidenciasNormales, incidenciasRecuperacion);
    actualizarGraficoTipoEvento(incidenciasRecuperacion);
    actualizarGraficoTop();
    actualizarGraficoComparativa(incidenciasRecuperacion);
    actualizarGraficoRiesgo(incidenciasNormales);
}

function actualizarGraficoEvolucion(incidenciasNormales, incidenciasRecuperacion) {
    const canvas = document.getElementById('graficoEvolucion');
    if (!canvas) return;
    
    const meses = {};
    const mesesNombres = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    
    incidenciasNormales.forEach(inc => {
        const fecha = inc.fechaInicio instanceof Date ? inc.fechaInicio : new Date(inc.fechaInicio);
        if (!isNaN(fecha.getTime())) {
            const mesKey = `${fecha.getFullYear()}-${fecha.getMonth() + 1}`;
            const mesNombre = `${mesesNombres[fecha.getMonth()]} ${fecha.getFullYear()}`;
            if (!meses[mesKey]) {
                meses[mesKey] = { nombre: mesNombre, normales: 0, recuperacion: 0 };
            }
            meses[mesKey].normales++;
        }
    });
    
    incidenciasRecuperacion.forEach(rec => {
        const fecha = rec.fecha ? new Date(rec.fecha) : null;
        if (fecha && !isNaN(fecha.getTime())) {
            const mesKey = `${fecha.getFullYear()}-${fecha.getMonth() + 1}`;
            const mesNombre = `${mesesNombres[fecha.getMonth()]} ${fecha.getFullYear()}`;
            if (!meses[mesKey]) {
                meses[mesKey] = { nombre: mesNombre, normales: 0, recuperacion: 0 };
            }
            meses[mesKey].recuperacion++;
        }
    });
    
    const mesesOrdenados = Object.keys(meses).sort();
    const labels = mesesOrdenados.map(m => meses[m].nombre);
    const normalesData = mesesOrdenados.map(m => meses[m].normales);
    const recuperacionData = mesesOrdenados.map(m => meses[m].recuperacion);
    
    const ctx = canvas.getContext('2d');
    
    if (charts.evolucion) {
        charts.evolucion.data.labels = labels;
        charts.evolucion.data.datasets[0].data = normalesData;
        charts.evolucion.data.datasets[1].data = recuperacionData;
        charts.evolucion.update();
    } else {
        charts.evolucion = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    { label: 'Incidencias normales', data: normalesData, borderColor: '#00cfff', backgroundColor: 'rgba(0, 207, 255, 0.1)', tension: 0.4, fill: true, pointBackgroundColor: '#00cfff', pointBorderColor: '#fff', pointRadius: 5 },
                    { label: 'Recuperación', data: recuperacionData, borderColor: '#f97316', backgroundColor: 'rgba(249, 115, 22, 0.1)', tension: 0.4, fill: true, pointBackgroundColor: '#f97316', pointBorderColor: '#fff', pointRadius: 5 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: true,
                plugins: { legend: { labels: { color: 'white' } }, tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.raw}` } } },
                scales: { y: { ticks: { color: '#aaa', stepSize: 1 }, grid: { color: 'rgba(255,255,255,0.05)' } }, x: { ticks: { color: '#aaa', maxRotation: 45 }, grid: { display: false } } }
            }
        });
    }
}

function actualizarGraficoTipoEvento(incidenciasRecuperacion) {
    const canvas = document.getElementById('graficoTipoEvento');
    if (!canvas) return;
    
    const tipos = { 'robo': 0, 'extravio': 0, 'accidente': 0, 'otro': 0 };
    const nombresTipos = { 'robo': 'Robo', 'extravio': 'Extravío', 'accidente': 'Accidente', 'otro': 'Otro' };
    const colores = { 'robo': '#ef4444', 'extravio': '#f97316', 'accidente': '#eab308', 'otro': '#8b5cf6' };
    
    incidenciasRecuperacion.forEach(r => {
        const tipo = r.tipoEvento || 'otro';
        tipos[tipo] = (tipos[tipo] || 0) + 1;
    });
    
    const ctx = canvas.getContext('2d');
    const labels = Object.keys(tipos).map(k => nombresTipos[k]);
    const data = Object.values(tipos);
    const backgroundColors = Object.keys(tipos).map(k => colores[k]);
    
    if (charts.tipoEvento) {
        charts.tipoEvento.data.labels = labels;
        charts.tipoEvento.data.datasets[0].data = data;
        charts.tipoEvento.update();
    } else {
        charts.tipoEvento = new Chart(ctx, {
            type: 'doughnut',
            data: { labels: labels, datasets: [{ data: data, backgroundColor: backgroundColors, borderWidth: 0, hoverOffset: 15, cutout: '65%' }] },
            options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { labels: { color: 'white' }, position: 'bottom' }, tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${ctx.raw} incidentes` } } } }
        });
    }
}

function actualizarGraficoTop() {
    const canvas = document.getElementById('graficoTop');
    if (!canvas) return;
    
    const ubicaciones = Array.from(datosPorUbicacion.values()).sort((a, b) => b.totalIncidentes - a.totalIncidentes).slice(0, 8);
    const labels = ubicaciones.map(u => u.nombre.length > 20 ? u.nombre.substring(0, 17) + '...' : u.nombre);
    const datos = ubicaciones.map(u => u.totalIncidentes);
    const colores = ubicaciones.map(u => u.color);
    
    const ctx = canvas.getContext('2d');
    
    if (charts.top) {
        charts.top.data.labels = labels;
        charts.top.data.datasets[0].data = datos;
        charts.top.data.datasets[0].backgroundColor = colores;
        charts.top.update();
    } else {
        charts.top = new Chart(ctx, {
            type: 'bar',
            data: { labels: labels, datasets: [{ label: 'Total incidentes', data: datos, backgroundColor: colores, borderRadius: 8 }] },
            options: { indexAxis: 'y', responsive: true, maintainAspectRatio: true, plugins: { legend: { labels: { color: 'white' } }, tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.raw}` } } }, scales: { x: { ticks: { color: '#aaa', stepSize: 1 }, grid: { color: 'rgba(255,255,255,0.05)' } }, y: { ticks: { color: '#aaa', font: { size: 10 } }, grid: { display: false } } } }
        });
    }
}

function actualizarGraficoComparativa(incidenciasRecuperacion) {
    const canvas = document.getElementById('graficoComparativa');
    if (!canvas) return;
    
    const totalPerdido = incidenciasRecuperacion.reduce((sum, r) => sum + (r.montoPerdido || 0), 0);
    const totalRecuperado = incidenciasRecuperacion.reduce((sum, r) => sum + (r.montoRecuperado || 0), 0);
    
    const ctx = canvas.getContext('2d');
    
    if (charts.comparativa) {
        charts.comparativa.data.datasets[0].data = [totalPerdido, totalRecuperado];
        charts.comparativa.update();
    } else {
        charts.comparativa = new Chart(ctx, {
            type: 'bar',
            data: { labels: ['Pérdidas', 'Recuperaciones'], datasets: [{ label: 'Monto total', data: [totalPerdido, totalRecuperado], backgroundColor: ['#ef4444', '#10b981'], borderRadius: 12 }] },
            options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { labels: { color: 'white' } }, tooltip: { callbacks: { label: (ctx) => formatearMoneda(ctx.raw) } } }, scales: { y: { ticks: { callback: (v) => formatearMoneda(v), color: '#aaa' }, grid: { color: 'rgba(255,255,255,0.05)' } }, x: { ticks: { color: '#aaa' }, grid: { display: false } } } }
        });
    }
}

function actualizarGraficoRiesgo(incidenciasNormales) {
    const canvas = document.getElementById('graficoRiesgo');
    if (!canvas) return;
    
    const riesgoData = {
        critico: incidenciasNormales.filter(i => i.nivelRiesgo === 'critico').length,
        alto: incidenciasNormales.filter(i => i.nivelRiesgo === 'alto').length,
        medio: incidenciasNormales.filter(i => i.nivelRiesgo === 'medio').length,
        bajo: incidenciasNormales.filter(i => i.nivelRiesgo === 'bajo').length
    };
    
    const total = riesgoData.critico + riesgoData.alto + riesgoData.medio + riesgoData.bajo;
    
    const ctx = canvas.getContext('2d');
    const labels = ['Crítico', 'Alto', 'Medio', 'Bajo'];
    const data = [riesgoData.critico, riesgoData.alto, riesgoData.medio, riesgoData.bajo];
    const colores = ['#ef4444', '#f97316', '#eab308', '#10b981'];
    
    if (charts.riesgo) {
        charts.riesgo.data.datasets[0].data = data;
        charts.riesgo.update();
    } else {
        charts.riesgo = new Chart(ctx, {
            type: 'doughnut',
            data: { labels: labels, datasets: [{ data: data, backgroundColor: colores, borderWidth: 0, hoverOffset: 15, cutout: '65%' }] },
            options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { labels: { color: 'white' }, position: 'bottom' }, tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${ctx.raw} (${total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : 0}%)` } } } }
        });
    }
}

// =============================================
// TABLA DE DATOS
// =============================================
function actualizarTabla() {
    const tbody = document.getElementById('tableBody');
    if (!tbody) return;
    
    const ubicaciones = Array.from(datosPorUbicacion.values()).sort((a, b) => b.totalIncidentes - a.totalIncidentes);
    
    if (ubicaciones.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align: center;">No hay datos para mostrar</td</tr>';
        return;
    }
    
    tbody.innerHTML = ubicaciones.map(u => {
        let nivelTexto = '';
        switch (u.nivel) {
            case 'muyAlto': nivelTexto = 'Muy Alto'; break;
            case 'alto': nivelTexto = 'Alto'; break;
            case 'normal': nivelTexto = 'Normal'; break;
            case 'bajo': nivelTexto = 'Bajo'; break;
        }
        
        return `
            <tr onclick="window.verDetalleUbicacion('${escapeHTML(u.nombre)}')" style="cursor: pointer;">
                <td><div class="color-indicator" style="background: ${u.color};"></div>${escapeHTML(u.nombre)}</td>
                <td><strong>${u.totalIncidentes}</strong> <span style="font-size: 0.6rem;">(Z: ${u.zScore.toFixed(2)})</span></td>
                <td>${u.incidentesNormales}</td>
                <td>${u.incidentesRecuperacion}</td>
                <td>${u.criticasAltas}</td>
                <td>${formatearMoneda(u.totalPerdido)}</td>
                <td>${formatearMoneda(u.totalRecuperado)}</td>
                <td style="color: ${u.perdidaNeta > 0 ? '#ef4444' : '#10b981'}">${formatearMoneda(u.perdidaNeta)}</td>
                <td>${u.tasaRecuperacion.toFixed(2)}%</td>
                <td><span style="background: ${u.color}20; color: ${u.color}; padding: 4px 8px; border-radius: 12px; font-size: 0.65rem;">${nivelTexto}</span></td>
            </tr>
        `;
    }).join('');
}

window.verDetalleUbicacion = function(nombre) {
    const datos = datosPorUbicacion.get(nombre);
    if (!datos) return;
    
    const formatter = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
    
    let nivelTexto = '';
    let nivelColor = '';
    switch (datos.nivel) {
        case 'muyAlto': nivelTexto = 'MUY ALTO'; nivelColor = COLORES_NIVEL.muyAlto; break;
        case 'alto': nivelTexto = 'ALTO'; nivelColor = COLORES_NIVEL.alto; break;
        case 'normal': nivelTexto = 'NORMAL'; nivelColor = COLORES_NIVEL.normal; break;
        case 'bajo': nivelTexto = 'BAJO'; nivelColor = COLORES_NIVEL.bajo; break;
    }
    
    const detallesHtml = `
        <div style="display: flex; flex-direction: column; gap: 16px;">
            <div class="swal-resumen-stats" style="margin-bottom: 0;">
                <div class="swal-stats-grid">
                    <div class="swal-stat-item" style="border-left-color: ${datos.color};"><span class="swal-stat-label">Nivel de riesgo</span><span class="swal-stat-value" style="color: ${nivelColor};">${nivelTexto}</span></div>
                    <div class="swal-stat-item" style="border-left-color: #3b82f6;"><span class="swal-stat-label">Puntuación Z</span><span class="swal-stat-value" style="font-size: 0.9rem;">${datos.zScore.toFixed(2)}</span></div>
                    <div class="swal-stat-item" style="border-left-color: #8b5cf6;"><span class="swal-stat-label">Promedio global</span><span class="swal-stat-value" style="font-size: 0.9rem;">${window.estadisticasGlobales?.promedio?.toFixed(2) || 0}</span></div>
                </div>
            </div>
            <div style="background: rgba(0,0,0,0.4); border-radius: 16px; padding: 16px; border: 1px solid rgba(255,255,255,0.08);">
                <div style="display: flex; flex-wrap: wrap; gap: 20px; justify-content: space-between;">
                    <div><div style="font-size: 0.7rem; text-transform: uppercase; color: #9ca3af;">Total incidentes</div><div style="font-size: 1.2rem; font-weight: 600; margin-top: 4px; color: white;"><i class="fas fa-chart-line"></i> ${datos.totalIncidentes}</div></div>
                    <div><div style="font-size: 0.7rem; text-transform: uppercase; color: #9ca3af;">Críticas + Altas</div><div style="font-size: 1.2rem; font-weight: 600; margin-top: 4px; color: ${COLORS.critico};">${datos.criticasAltas}</div></div>
                    <div><div style="font-size: 0.7rem; text-transform: uppercase; color: #9ca3af;">Incidencias normales</div><div style="font-size: 1.2rem; font-weight: 600; margin-top: 4px;">${datos.incidentesNormales}</div></div>
                    <div><div style="font-size: 0.7rem; text-transform: uppercase; color: #9ca3af;">Recuperación</div><div style="font-size: 1.2rem; font-weight: 600; margin-top: 4px;">${datos.incidentesRecuperacion}</div></div>
                </div>
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 16px;">
                <div style="flex: 1; background: rgba(239, 68, 68, 0.1); border-radius: 16px; padding: 16px; border-left: 3px solid #ef4444;"><div style="font-size: 0.7rem; text-transform: uppercase; color: #9ca3af;">Total perdido</div><div style="font-size: 1.3rem; font-weight: 700; color: #ef4444;">${formatter.format(datos.totalPerdido)}</div></div>
                <div style="flex: 1; background: rgba(16, 185, 129, 0.1); border-radius: 16px; padding: 16px; border-left: 3px solid #10b981;"><div style="font-size: 0.7rem; text-transform: uppercase; color: #9ca3af;">Total recuperado</div><div style="font-size: 1.3rem; font-weight: 700; color: #10b981;">${formatter.format(datos.totalRecuperado)}</div></div>
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 16px;">
                <div style="flex: 1; background: rgba(245, 158, 11, 0.1); border-radius: 16px; padding: 16px; border-left: 3px solid #f59e0b;"><div style="font-size: 0.7rem; text-transform: uppercase; color: #9ca3af;">Pérdida neta</div><div style="font-size: 1.3rem; font-weight: 700; color: ${datos.perdidaNeta > 0 ? '#ef4444' : '#10b981'};">${formatter.format(datos.perdidaNeta)}</div></div>
                <div style="flex: 1; background: rgba(59, 130, 246, 0.1); border-radius: 16px; padding: 16px; border-left: 3px solid #3b82f6;"><div style="font-size: 0.7rem; text-transform: uppercase; color: #9ca3af;">Tasa recuperación</div><div style="font-size: 1.3rem; font-weight: 700; color: #3b82f6;">${datos.tasaRecuperacion.toFixed(2)}%</div></div>
            </div>
        </div>
    `;
    
    Swal.fire({
        title: `<i class="fas fa-map-marker-alt" style="color: ${datos.color};"></i> ${escapeHTML(datos.nombre)}`,
        html: detallesHtml,
        width: '750px',
        background: 'transparent',
        showConfirmButton: true,
        confirmButtonText: '<i class="fas fa-check"></i> Cerrar',
        customClass: { popup: 'swal2-popup-custom', title: 'swal2-title-custom', confirmButton: 'swal2-confirm' },
        backdrop: `rgba(0,0,0,0.8) left top no-repeat`
    });
};

// =============================================
// UTILIDADES GENERALES
// =============================================
function limpiarVisualizacion() {
    setElementText('totalIncidentes', '0');
    setElementText('totalPerdido', formatearMoneda(0));
    setElementText('totalRecuperado', formatearMoneda(0));
    setElementText('tasaRecuperacion', '0%');
    setElementText('promedioEvento', formatearMoneda(0));
    setElementText('estadoTop', '-');
    
    const tbody = document.getElementById('tableBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="9" style="text-align: center;">Selecciona fechas y haz clic en "Analizar"</td</tr>';
    
    if (mapa) {
        mapa.eachLayer(layer => {
            if (layer instanceof L.Marker || layer instanceof L.CircleMarker || layer instanceof L.GeoJSON) {
                mapa.removeLayer(layer);
            }
        });
    }
}

function mostrarLoading(show) {
    const container = document.getElementById('mapContainer');
    if (!container) return;
    
    let overlay = document.querySelector('.loading-overlay');
    
    if (show) {
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'loading-overlay';
            overlay.innerHTML = `<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i><div>Analizando datos...</div></div>`;
            container.style.position = 'relative';
            container.appendChild(overlay);
        }
    } else {
        if (overlay) overlay.remove();
    }
}

// =============================================
// INICIAR
// =============================================
document.addEventListener('DOMContentLoaded', inicializar);