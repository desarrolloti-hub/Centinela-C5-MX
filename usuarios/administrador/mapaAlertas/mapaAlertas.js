// mapaAlertas.js - VERSIÓN COMPLETA CON MODAL FULLSCREEN, VISOR DE PDF, ID EN NOTIFICACIONES, PANEL CERRADO Y HEATMAP
// CON REGISTRO DE BITÁCORA - VERSIÓN CON CONSOLA LIMPIA

import { SucursalManager } from '/clases/sucursal.js';
import { RegionManager } from '/clases/region.js';
import { IncidenciaManager } from '/clases/incidencia.js';
import { generadorIPH } from '/components/iph-generator.js';

let historialManager = null;
let accesoVistaRegistrado = false;

// =============================================
// CONFIGURACIÓN DEL MAPA
// =============================================
const CONFIG = {
    centro: [23.6345, -102.5528],
    zoom: 6,
    zoomMin: 5,
    zoomMax: 18,
    bounds: {
        north: 32.718,
        south: 14.532,
        west: -118.365,
        east: -86.711
    },
    colores: {
        critico: '#ff4444',
        alto: '#ff8844',
        medio: '#ffbb33',
        bajo: '#00C851'
    },
    nivelesRiesgo: {
        'critico': { color: '#ff4444', icono: 'fa-skull-crossbones', texto: 'CRÍTICO', peso: 4 },
        'alto': { color: '#ff8844', icono: 'fa-exclamation-triangle', texto: 'ALTO', peso: 3 },
        'medio': { color: '#ffbb33', icono: 'fa-exclamation-circle', texto: 'MEDIO', peso: 2 },
        'bajo': { color: '#00C851', icono: 'fa-info-circle', texto: 'BAJO', peso: 1 }
    },
    heatmapConfig: {
        radius: 25,
        blur: 15,
        maxZoom: 17,
        minOpacity: 0.3,
        gradient: {
            0.0: '#00C851',
            0.33: '#ffbb33',
            0.66: '#ff8844',
            1.0: '#ff4444'
        }
    }
};

// Estado global
let mapa = null;
let incidencias = [];
let sucursales = [];
let regiones = [];
let sucursalesMap = new Map();
let marcadores = {
    incidencias: {},
    sucursales: {}
};
let filtros = {
    zona: '',
    regionId: null,
    regionNombre: null
};
let sucursalManager = null;
let regionManager = null;
let incidenciaManager = null;
let usuarioActual = null;
let unsubscribeIncidencias = null;
let isFirstSnapshot = true;

// Variables para Heatmap
let heatmapLayer = null;
let heatmapVisible = false;
let puntosHeatmap = [];

// Cache de datos para el generador IPH
let organizacionActual = null;
let sucursalesCache = [];
let categoriasCache = [];
let subcategoriasCache = [];
let usuariosCache = [];
let authToken = null;

// Variable para el modal de PDF
let pdfModal = null;

// =============================================
// INICIALIZACIÓN
// =============================================
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await inicializarHistorial();

        if (!inicializarMapa()) return;
        await cargarUsuario();
        sucursalManager = new SucursalManager();
        regionManager = new RegionManager();
        incidenciaManager = new IncidenciaManager();
      
        await cargarRegiones();
        await cargarSucursales();
        await cargarDatosParaPDF();
        await cargarRegionesEnSelector();
        await cargarRegionesEnLista();
        await iniciarListenerIncidenciasReales();
        configurarEventos();
        configurarPaneles();
        configurarSelectorRegion();
        agregarBotonHeatmap();

        await registrarAccesoMapaAlertas();

    } catch (error) {
        console.error('Error:', error);
        mostrarError(error.message);
    }
});

async function inicializarHistorial() {
    try {
        const { HistorialUsuarioManager } = await import('/clases/historialUsuario.js');
        historialManager = new HistorialUsuarioManager();
    } catch (error) {
        // Error silencioso
    }
}

function obtenerUsuarioActual() {
    try {
        const adminInfo = localStorage.getItem('adminInfo');
        if (adminInfo) {
            const data = JSON.parse(adminInfo);
            return {
                id: data.id || data.uid,
                uid: data.uid || data.id,
                nombreCompleto: data.nombreCompleto || 'Administrador',
                organizacion: data.organizacion,
                organizacionCamelCase: data.organizacionCamelCase || 'pollosRay',
                correoElectronico: data.correoElectronico || ''
            };
        }

        const userData = JSON.parse(localStorage.getItem('userData') || '{}');
        if (userData && Object.keys(userData).length > 0) {
            return {
                id: userData.uid || userData.id,
                uid: userData.uid || userData.id,
                nombreCompleto: userData.nombreCompleto || userData.nombre || 'Usuario',
                organizacion: userData.organizacion,
                organizacionCamelCase: userData.organizacionCamelCase || 'pollosRay',
                correoElectronico: userData.correo || userData.email || ''
            };
        }

        return null;
    } catch (error) {
        console.error('Error obteniendo usuario actual:', error);
        return null;
    }
}

async function registrarAccesoMapaAlertas() {
    if (!historialManager) return;
    if (accesoVistaRegistrado) return;

    try {
        const usuario = obtenerUsuarioActual();
        if (!usuario) return;

        await historialManager.registrarActividad({
            usuario: usuario,
            tipo: 'leer',
            modulo: 'mapa',
            descripcion: 'Accedió al mapa de alertas',
            detalles: {
                totalSucursales: sucursales.length,
                totalRegiones: regiones.length,
                totalIncidencias: incidencias.length,
                incidenciasCriticas: incidencias.filter(i => i.nivelRiesgo === 'critico').length,
                organizacion: organizacionActual?.nombre
            }
        });
        accesoVistaRegistrado = true;
    } catch (error) {
        console.error('Error registrando acceso al mapa:', error);
    }
}

async function registrarVisualizacionIncidencia(incidencia, sucursal) {
    if (!historialManager) return;

    try {
        const usuario = obtenerUsuarioActual();
        if (!usuario) return;

        const nivel = CONFIG.nivelesRiesgo[incidencia.nivelRiesgo] || CONFIG.nivelesRiesgo.bajo;

        await historialManager.registrarActividad({
            usuario: usuario,
            tipo: 'leer',
            modulo: 'mapa',
            descripcion: `Visualizó incidencia en mapa: ${incidencia.id}`,
            detalles: {
                incidenciaId: incidencia.id,
                titulo: incidencia.titulo,
                nivelRiesgo: incidencia.nivelRiesgo,
                nivelTexto: nivel.texto,
                estado: incidencia.estado,
                sucursalId: sucursal?.id,
                sucursalNombre: sucursal?.nombre,
                ubicacion: sucursal ? `${sucursal.ciudad}, ${sucursal.estado}` : null,
                fecha: incidencia.fecha
            }
        });
    } catch (error) {
        console.error('Error registrando visualización de incidencia:', error);
    }
}

async function registrarGeneracionPDF(incidenciaId, tipo, incidencia) {
    if (!historialManager) return;

    try {
        const usuario = obtenerUsuarioActual();
        if (!usuario) return;

        await historialManager.registrarActividad({
            usuario: usuario,
            tipo: 'leer',
            modulo: 'mapa',
            descripcion: `Generó/visualizó PDF de incidencia: ${incidenciaId}`,
            detalles: {
                incidenciaId: incidenciaId,
                titulo: incidencia?.titulo || 'Sin título',
                nivelRiesgo: incidencia?.nivelRiesgo || 'No especificado',
                tipo: tipo,
                origen: 'mapa_alertas',
                fecha: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('Error registrando generación de PDF:', error);
    }
}

async function registrarActivacionHeatmap(activado, puntos) {
    if (!historialManager) return;

    try {
        const usuario = obtenerUsuarioActual();
        if (!usuario) return;

        await historialManager.registrarActividad({
            usuario: usuario,
            tipo: 'leer',
            modulo: 'mapa',
            descripcion: activado ? 'Activó el mapa de calor' : 'Desactivó el mapa de calor',
            detalles: {
                accion: activado ? 'activar' : 'desactivar',
                puntosHeatmap: activado ? puntos.length : 0,
                fecha: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('Error registrando heatmap:', error);
    }
}

async function registrarFiltroRegion(regionId, regionNombre, sucursalesMostradas) {
    if (!historialManager) return;

    try {
        const usuario = obtenerUsuarioActual();
        if (!usuario) return;

        await historialManager.registrarActividad({
            usuario: usuario,
            tipo: 'leer',
            modulo: 'mapa',
            descripcion: `Filtró mapa por región: ${regionNombre}`,
            detalles: {
                regionId: regionId,
                regionNombre: regionNombre,
                sucursalesMostradas: sucursalesMostradas,
                fechaFiltro: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('Error registrando filtro por región:', error);
    }
}

// =============================================
// AGREGAR BOTÓN DE HEATMAP AL PANEL DE CONTROL
// =============================================
function agregarBotonHeatmap() {
    const controlPanel = document.querySelector('.control-panel');
    if (!controlPanel) return;

    if (document.getElementById('btnHeatmap')) return;

    const btnHeatmap = document.createElement('button');
    btnHeatmap.id = 'btnHeatmap';
    btnHeatmap.className = 'control-btn';
    btnHeatmap.innerHTML = '<i class="fas fa-fire"></i><span>Mapa de Calor</span>';
    btnHeatmap.style.background = 'linear-gradient(135deg, #ff4444, #ff8844)';
    btnHeatmap.style.border = 'none';
    btnHeatmap.onclick = toggleHeatmap;

    controlPanel.appendChild(btnHeatmap);
}

// =============================================
// GENERAR PUNTOS PARA HEATMAP
// =============================================
function generarPuntosHeatmap() {
    puntosHeatmap = [];

    incidencias.forEach(inc => {
        const sucursal = sucursalesMap.get(inc.sucursalId);
        if (sucursal && sucursal.latitud && sucursal.longitud) {
            const peso = CONFIG.nivelesRiesgo[inc.nivelRiesgo]?.peso || 1;
            let pesoFinal = peso;
            const fechaInc = new Date(inc.fecha);
            const ahora = new Date();
            const horasDiff = (ahora - fechaInc) / (1000 * 60 * 60);
            if (horasDiff < 24) {
                pesoFinal = peso * 1.5;
            }

            puntosHeatmap.push({
                lat: parseFloat(sucursal.latitud),
                lng: parseFloat(sucursal.longitud),
                intensity: pesoFinal
            });
        }
    });
}

// =============================================
// CREAR CAPA DE HEATMAP
// =============================================
function crearHeatmapLayer() {
    if (typeof L.heatLayer === 'undefined') {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet.heat/0.2.0/leaflet-heat.js';
            script.onload = () => {
                const layer = L.heatLayer(puntosHeatmap, CONFIG.heatmapConfig);
                resolve(layer);
            };
            script.onerror = () => {
                reject();
            };
            document.head.appendChild(script);
        });
    }

    return L.heatLayer(puntosHeatmap, CONFIG.heatmapConfig);
}

// =============================================
// ALTERNAR VISIBILIDAD DEL HEATMAP
// =============================================
async function toggleHeatmap() {
    const btn = document.getElementById('btnHeatmap');

    if (!heatmapVisible) {
        if (puntosHeatmap.length === 0) {
            generarPuntosHeatmap();
        }

        if (puntosHeatmap.length === 0) {
            Swal.fire({
                icon: 'info',
                title: 'Sin datos',
                text: 'No hay incidencias para mostrar en el mapa de calor',
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 3000,
                background: 'var(--color-bg-secondary)',
                color: 'var(--color-text-primary)'
            });
            return;
        }

        try {
            if (!heatmapLayer) {
                heatmapLayer = await crearHeatmapLayer();
            }

            if (heatmapLayer) {
                heatmapLayer.addTo(mapa);
                heatmapVisible = true;
                btn.style.background = 'linear-gradient(135deg, #ff8844, #ff4444)';
                btn.style.boxShadow = '0 0 15px rgba(255, 68, 68, 0.5)';
                btn.innerHTML = '<i class="fas fa-fire"></i><span>Ocultar Calor</span>';

                await registrarActivacionHeatmap(true, puntosHeatmap);

                Swal.fire({
                    icon: 'success',
                    title: 'Mapa de Calor Activado',
                    text: `Mostrando ${puntosHeatmap.length} zonas de calor`,
                    toast: true,
                    position: 'top-end',
                    showConfirmButton: false,
                    timer: 2000,
                    background: 'var(--color-bg-secondary)',
                    color: 'var(--color-text-primary)'
                });
            }
        } catch (error) {
            console.error('Error activando heatmap:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'No se pudo cargar el mapa de calor',
                background: 'var(--color-bg-secondary)',
                color: 'var(--color-text-primary)'
            });
        }

    } else {
        if (heatmapLayer && mapa.hasLayer(heatmapLayer)) {
            mapa.removeLayer(heatmapLayer);
        }
        heatmapVisible = false;
        btn.style.background = 'linear-gradient(135deg, #ff4444, #ff8844)';
        btn.style.boxShadow = 'none';
        btn.innerHTML = '<i class="fas fa-fire"></i><span>Mapa de Calor</span>';

        await registrarActivacionHeatmap(false, []);

        Swal.fire({
            icon: 'info',
            title: 'Mapa de Calor Oculto',
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 1500,
            background: 'var(--color-bg-secondary)',
            color: 'var(--color-text-primary)'
        });
    }
}

// =============================================
// ACTUALIZAR HEATMAP CUANDO CAMBIAN INCIDENCIAS
// =============================================
function actualizarHeatmap() {
    if (!heatmapVisible) return;

    generarPuntosHeatmap();

    if (heatmapLayer && mapa.hasLayer(heatmapLayer)) {
        mapa.removeLayer(heatmapLayer);
        if (typeof L.heatLayer !== 'undefined') {
            heatmapLayer = L.heatLayer(puntosHeatmap, CONFIG.heatmapConfig);
            heatmapLayer.addTo(mapa);
        }
    }
}







// =============================================
// INICIALIZAR MAPA
// =============================================
function inicializarMapa() {
    try {
        if (typeof L === 'undefined') {
            console.error('Leaflet no cargado');
            return false;
        }

        const mapaElement = document.getElementById('mapa');
        if (!mapaElement) {
            console.error('Elemento #mapa no encontrado');
            return false;
        }

        mapa = L.map('mapa', {
            center: CONFIG.centro,
            zoom: CONFIG.zoom,
            minZoom: CONFIG.zoomMin,
            maxZoom: CONFIG.zoomMax,
            maxBounds: [
                [CONFIG.bounds.south, CONFIG.bounds.west],
                [CONFIG.bounds.north, CONFIG.bounds.east]
            ],
            maxBoundsViscosity: 1.0
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap | Centinela-MX'
        }).addTo(mapa);

        return true;

    } catch (error) {
        console.error('Error mapa:', error);
        return false;
    }
}

// =============================================
// CARGAR USUARIO
// =============================================
async function cargarUsuario() {
    try {
        const adminInfo = localStorage.getItem('adminInfo');
        if (adminInfo) {
            const data = JSON.parse(adminInfo);
            usuarioActual = {
                id: data.id,
                nombreCompleto: data.nombreCompleto,
                organizacion: data.organizacion,
                organizacionCamelCase: data.organizacionCamelCase || 'pollosRay'
            };
            organizacionActual = {
                nombre: data.organizacion,
                camelCase: data.organizacionCamelCase || 'pollosRay'
            };
        } else {
            const userData = JSON.parse(localStorage.getItem('userData') || '{}');
            if (userData && userData.organizacionCamelCase) {
                usuarioActual = {
                    id: userData.uid || userData.id,
                    nombreCompleto: userData.nombreCompleto || 'Usuario',
                    organizacion: userData.organizacion,
                    organizacionCamelCase: userData.organizacionCamelCase
                };
                organizacionActual = {
                    nombre: userData.organizacion,
                    camelCase: userData.organizacionCamelCase
                };
            } else {
                usuarioActual = { organizacionCamelCase: 'pollosRay' };
                organizacionActual = { nombre: 'Mi Empresa', camelCase: 'pollosRay' };
            }
        }
        await obtenerTokenAuth();

    } catch (error) {
        console.error('Error cargando usuario:', error);
        usuarioActual = { organizacionCamelCase: 'pollosRay' };
        organizacionActual = { nombre: 'Mi Empresa', camelCase: 'pollosRay' };
    }
}

async function obtenerTokenAuth() {
    try {
        if (window.firebase && firebase.auth) {
            const user = firebase.auth().currentUser;
            if (user) {
                authToken = await user.getIdToken();
            }
        }
        if (!authToken) {
            const token = localStorage.getItem('firebaseToken') ||
                localStorage.getItem('authToken') ||
                localStorage.getItem('token');
            if (token) {
                authToken = token;
            }
        }
    } catch (error) {
        // Error silencioso
        authToken = null;
    }
}

// =============================================
// CARGAR DATOS PARA PDF
// =============================================
async function cargarDatosParaPDF() {
    try {
        const data = await sucursalManager.getSucursalesByOrganizacion(usuarioActual.organizacionCamelCase);
        if (data?.length) {
            sucursalesCache = data;
        }

        try {
            const { CategoriaManager } = await import('/clases/categoria.js');
            const categoriaManager = new CategoriaManager();
            categoriasCache = await categoriaManager.obtenerTodasCategorias();
        } catch (error) {
            categoriasCache = [];
        }

        try {
            const modulo = await import('/clases/subcategoria.js').catch(() => null);
            if (modulo) {
                const SubcategoriaManager = modulo.SubcategoriaManager || modulo.default;
                if (SubcategoriaManager) {
                    const subcategoriaManager = new SubcategoriaManager();
                    subcategoriasCache = await subcategoriaManager.obtenerSubcategoriasPorOrganizacion?.(usuarioActual.organizacionCamelCase) || [];
                }
            }
        } catch (error) {
            subcategoriasCache = [];
        }

        if (generadorIPH && typeof generadorIPH.configurar === 'function') {
            generadorIPH.configurar({
                organizacionActual,
                sucursalesCache,
                categoriasCache,
                subcategoriasCache,
                usuariosCache,
                authToken
            });
        }

    } catch (error) {
        console.error('Error cargando datos para PDF:', error);
    }
}

// =============================================
// CARGAR REGIONES
// =============================================
async function cargarRegiones() {
    try {
        regiones = await regionManager.getRegionesByOrganizacion(
            usuarioActual.organizacionCamelCase,
            usuarioActual
        );
    } catch (error) {
        console.error('Error cargando regiones:', error);
        regiones = [];
    }
}

// =============================================
// CARGAR SUCURSALES
// =============================================
async function cargarSucursales() {
    try {
        const data = await sucursalManager.getSucursalesByOrganizacion(
            usuarioActual.organizacionCamelCase
        );

        if (data?.length) {
            sucursales = data;
            sucursales.forEach(s => {
                sucursalesMap.set(s.id, s);
            });

            for (const sucursal of sucursales) {
                if (sucursal.latitud && sucursal.longitud) {
                    const lat = parseFloat(sucursal.latitud);
                    const lng = parseFloat(sucursal.longitud);

                    if (lat >= CONFIG.bounds.south && lat <= CONFIG.bounds.north &&
                        lng >= CONFIG.bounds.west && lng <= CONFIG.bounds.east) {
                        const region = await sucursal.getRegion();
                        agregarSucursalAlMapa(sucursal, region);
                    }
                }
            }
        }

        actualizarStats();

    } catch (error) {
        console.error('Error cargando sucursales:', error);
    }
}

// =============================================
// AGREGAR SUCURSAL AL MAPA
// =============================================
function agregarSucursalAlMapa(sucursal, region) {
    if (!mapa) return;

    const colorRegion = region?.color || '#2f8cff';
    const nombreRegion = region?.nombre || 'Sin región';
    const regionId = region?.id || null;

    sucursal.regionId = regionId;
    sucursal.regionNombre = nombreRegion;
    sucursal.regionColor = colorRegion;

    const icono = L.divIcon({
        className: 'marcador-sucursal',
        html: `<i class="fas fa-store" style="color: ${colorRegion}; font-size: 2rem; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));"></i>`,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32]
    });

    const direccion = [sucursal.direccion, sucursal.ciudad, sucursal.estado].filter(Boolean).join(', ') || 'Dirección no disponible';
    const telefono = sucursal.contacto ? sucursal.contacto.replace(/\D/g, '').replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3') : 'No disponible';

    const popupContent = `
        <div style="min-width: 250px;">
            <div style="border-bottom: 2px solid ${colorRegion}; padding-bottom: 5px; margin-bottom: 8px;">
                <i class="fas fa-store" style="color: ${colorRegion};"></i>
                <strong style="color: ${colorRegion};"> ${escapeHTML(sucursal.nombre)}</strong>
            </div>
            <div style="background: ${colorRegion}20; padding: 4px 8px; border-radius: 12px; font-size: 0.7rem; margin-bottom: 8px;">
                <i class="fas fa-globe"></i> ${escapeHTML(nombreRegion)}
            </div>
            <div><i class="fas fa-map-pin"></i> ${escapeHTML(direccion)}</div>
            <div><i class="fas fa-phone"></i> ${escapeHTML(telefono)}</div>
            <div><i class="fas fa-tag"></i> ${escapeHTML(sucursal.tipo || 'SUCURSAL')}</div>
        </div>
    `;

    const marcador = L.marker([sucursal.latitud, sucursal.longitud], { icon: icono })
        .bindPopup(popupContent)
        .addTo(mapa);

    marcadores.sucursales[sucursal.id] = marcador;
}

// =============================================
// INICIAR LISTENER DE INCIDENCIAS REALES
// =============================================
async function iniciarListenerIncidenciasReales() {
    try {
        const { collection, query, orderBy, limit, onSnapshot } = await import("https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js");
        const { db } = await import('/config/firebase-config.js');

        const collectionName = `incidencias_${usuarioActual.organizacionCamelCase}`;

        const incidenciasRef = collection(db, collectionName);
        const q = query(
            incidenciasRef,
            orderBy("fechaCreacion", "desc"),
            limit(20)
        );

        unsubscribeIncidencias = onSnapshot(q, async (snapshot) => {
            const nuevasIncidencias = [];

            snapshot.forEach(doc => {
                const data = doc.data();
                const fecha = data.fechaCreacion?.toDate?.() || new Date(data.fechaCreacion) || new Date();

                nuevasIncidencias.push({
                    id: doc.id,
                    sucursalId: data.sucursalId,
                    titulo: data.detalles?.substring(0, 60) || 'Incidencia sin título',
                    descripcion: data.detalles || '',
                    nivelRiesgo: data.nivelRiesgo || 'bajo',
                    estado: data.estado || 'pendiente',
                    fecha: fecha,
                    fechaCreacion: fecha,
                    categoriaId: data.categoriaId,
                    subcategoriaId: data.subcategoriaId,
                    imagenes: data.imagenes || [],
                    pdfUrl: data.pdfUrl || ''
                });
            });

            const incidenciasAnteriores = [...incidencias];
            incidencias = nuevasIncidencias;

            if (heatmapVisible) {
                actualizarHeatmap();
            }

            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                    const data = change.doc.data();
                    const fecha = data.fechaCreacion?.toDate?.() || new Date(data.fechaCreacion) || new Date();

                    const nuevaIncidencia = {
                        id: change.doc.id,
                        sucursalId: data.sucursalId,
                        titulo: data.detalles?.substring(0, 60) || 'Incidencia sin título',
                        descripcion: data.detalles || '',
                        nivelRiesgo: data.nivelRiesgo || 'bajo',
                        estado: data.estado || 'pendiente',
                        fecha: fecha
                    };

                    const yaExiste = incidenciasAnteriores.some(inc => inc.id === change.doc.id);

                    if (!yaExiste && !isFirstSnapshot) {
                        const sucursal = sucursalesMap.get(nuevaIncidencia.sucursalId);
                        if (sucursal) {
                            mostrarNotificacionIncidencia(nuevaIncidencia, sucursal);
                            centrarEnSucursal(sucursal.id);
                        }
                    }
                }
            });

            if (isFirstSnapshot) {
                isFirstSnapshot = false;
                generarPuntosHeatmap();
            }

            actualizarListaUltimasIncidencias();
            actualizarStats();

        }, (error) => {
            console.error('Error en listener de incidencias:', error);
        });

    } catch (error) {
        console.error('Error iniciando listener:', error);
    }
}

// =============================================
// ACTUALIZAR LISTA DE ÚLTIMAS 5 INCIDENCIAS
// =============================================
function actualizarListaUltimasIncidencias() {
    const container = document.getElementById('listaIncidencias');
    if (!container) return;

    const ultimasIncidencias = incidencias.slice(0, 5);

    if (!ultimasIncidencias.length) {
        container.innerHTML = `
            <div class="no-incidencias">
                <i class="fas fa-check-circle"></i> No hay incidencias registradas
            </div>
        `;
        const badge = document.getElementById('incidenciasBadge');
        if (badge) badge.textContent = '0';
        return;
    }

    const badge = document.getElementById('incidenciasBadge');
    if (badge) badge.textContent = ultimasIncidencias.length;

    container.innerHTML = ultimasIncidencias.map(inc => {
        const nivel = CONFIG.nivelesRiesgo[inc.nivelRiesgo] || CONFIG.nivelesRiesgo.bajo;
        const sucursal = sucursalesMap.get(inc.sucursalId);
        const sucursalNombre = sucursal?.nombre || 'Sucursal desconocida';
        const estadoTexto = inc.estado === 'finalizada' ? 'Finalizada' : 'Pendiente';
        const estadoClass = inc.estado === 'finalizada' ? 'finalizada' : 'pendiente';

        return `
            <div class="incidencia-item ${inc.nivelRiesgo}">
                <div class="incidencia-header">
                    <i class="fas ${nivel.icono}" style="color: ${nivel.color};"></i>
                    <span class="incidencia-nivel" style="color: ${nivel.color};">${nivel.texto}</span>
                    <span class="incidencia-fecha">${formatearFecha(inc.fecha)}</span>
                </div>
                <div class="incidencia-titulo">${escapeHTML(inc.titulo)}</div>
                <div class="incidencia-descripcion">${escapeHTML(inc.descripcion.substring(0, 80))}${inc.descripcion.length > 80 ? '...' : ''}</div>
                <div class="incidencia-meta">
                    <span><i class="fas fa-store"></i> ${escapeHTML(sucursalNombre)}</span>
                    <span class="incidencia-estado ${estadoClass}">${estadoTexto}</span>
                </div>
                <div class="incidencia-actions" style="display: flex; gap: 8px; margin-top: 10px; justify-content: flex-end;">
                    <button class="btn-pdf-mini" onclick="window.verPDFIncidencia('${inc.id}')" title="Ver PDF" style="
                        background: linear-gradient(135deg, #2c3e50, #1a2632);
                        border: none;
                        color: white;
                        padding: 5px 12px;
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 0.7rem;
                        display: flex;
                        align-items: center;
                        gap: 5px;
                        transition: all 0.2s ease;
                    " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                        <i class="fas fa-file-pdf" style="color: #c0392b;"></i> PDF
                    </button>
                    <button class="btn-ver-mapa-mini" onclick="window.centrarEnSucursal('${inc.sucursalId}')" title="Ver en mapa" style="
                        background: linear-gradient(135deg, #2c3e50, #1a2632);
                        border: none;
                        color: white;
                        padding: 5px 12px;
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 0.7rem;
                        display: flex;
                        align-items: center;
                        gap: 5px;
                        transition: all 0.2s ease;
                    " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                        <i class="fas fa-map-marker-alt" style="color: #00cfff;"></i> Mapa
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// =============================================
// FUNCIÓN PARA VER PDF EN MODAL CON ID
// =============================================
window.verPDFIncidencia = async function (incidenciaId) {
    try {
        const incidencia = incidencias.find(i => i.id === incidenciaId);

        if (!incidencia) {
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'No se encontró la incidencia',
                background: 'var(--color-bg-secondary)',
                color: 'var(--color-text-primary)'
            });
            return;
        }

        Swal.fire({
            title: 'Generando PDF...',
            html: '<div class="spinner-border text-primary" role="status"><span class="visually-hidden">Cargando...</span></div><p style="margin-top: 12px;">Por favor espere</p>',
            allowOutsideClick: false,
            showConfirmButton: false,
            background: 'var(--color-bg-secondary)',
            color: 'var(--color-text-primary)'
        });

        const incidenciaCompleta = {
            id: incidencia.id,
            sucursalId: incidencia.sucursalId,
            detalles: incidencia.descripcion,
            nivelRiesgo: incidencia.nivelRiesgo,
            estado: incidencia.estado,
            fechaCreacion: incidencia.fecha,
            fechaInicio: incidencia.fecha,
            categoriaId: incidencia.categoriaId,
            subcategoriaId: incidencia.subcategoriaId,
            imagenes: incidencia.imagenes || [],
            pdfUrl: incidencia.pdfUrl,
            getNivelRiesgoTexto: function () {
                const niveles = { 'bajo': 'Bajo', 'medio': 'Medio', 'alto': 'Alto', 'critico': 'Crítico' };
                return niveles[this.nivelRiesgo] || 'Bajo';
            },
            getEstadoTexto: function () {
                const estados = { 'pendiente': 'Pendiente', 'finalizada': 'Finalizada' };
                return estados[this.estado] || 'Pendiente';
            },
            getSeguimientosArray: function () {
                return [];
            }
        };

        let pdfBlob = null;

        if (incidencia.pdfUrl) {
            Swal.close();
            const result = await Swal.fire({
                title: 'PDF Disponible',
                text: 'Esta incidencia ya tiene un PDF generado. ¿Qué deseas hacer?',
                icon: 'question',
                confirmButtonText: 'Ver PDF existente',
                cancelButtonText: 'Generar nuevo',
                showCancelButton: true,
                background: 'var(--color-bg-secondary)',
                color: 'var(--color-text-primary)'
            });

            if (result.isConfirmed) {
                await registrarGeneracionPDF(incidenciaId, 'existente', incidencia);
                // Abrir en nueva pestaña con visor nativo
                window.open(incidencia.pdfUrl, '_blank');
                return;
            }
        }
        
        try {
            pdfBlob = await generadorIPH.generarIPH(incidenciaCompleta, {
                mostrarAlerta: false,
                returnBlob: true
            });

            if (pdfBlob) {
                const url = URL.createObjectURL(pdfBlob);
                await registrarGeneracionPDF(incidenciaId, 'nuevo', incidencia);
                // Abrir en nueva pestaña con visor nativo
                window.open(url, '_blank');
                window.currentPDFBlob = pdfBlob;
                window.currentPDFUrl = url;
                Swal.close();
            } else {
                throw new Error('No se pudo generar el PDF');
            }

        } catch (genError) {
            console.error('Error generando PDF con IPH:', genError);

            Swal.update({
                html: '<div class="spinner-border text-primary" role="status"><span class="visually-hidden">Generando PDF simple...</span></div><p style="margin-top: 12px;">Generando PDF básico...</p>'
            });

            const pdfSimpleBlob = await generarPDFSimple(incidencia);
            if (pdfSimpleBlob) {
                const url = URL.createObjectURL(pdfSimpleBlob);
                await registrarGeneracionPDF(incidenciaId, 'simple', incidencia);
                // Abrir en nueva pestaña con visor nativo
                window.open(url, '_blank');
                window.currentPDFBlob = pdfSimpleBlob;
                window.currentPDFUrl = url;
                Swal.close();
            } else {
                throw new Error('No se pudo generar el PDF');
            }
        }

    } catch (error) {
        console.error('Error generando PDF:', error);
        Swal.close();
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: error.message || 'No se pudo generar el PDF',
            background: 'var(--color-bg-secondary)',
            color: 'var(--color-text-primary)'
        });
    }
};

// =============================================
// GENERAR PDF SIMPLE (FALLBACK)
// =============================================
async function generarPDFSimple(incidencia) {
    try {
        const { jsPDF } = window.jspdf || await import('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
        const doc = new jsPDF();

        const sucursal = sucursalesMap.get(incidencia.sucursalId);
        const nivel = CONFIG.nivelesRiesgo[incidencia.nivelRiesgo] || CONFIG.nivelesRiesgo.bajo;

        doc.setFontSize(18);
        doc.setTextColor(0, 82, 155);
        doc.text('INFORME DE INCIDENCIA', 105, 20, { align: 'center' });

        doc.setFontSize(12);
        doc.setTextColor(0, 0, 0);
        doc.text(`ID: ${incidencia.id}`, 20, 35);
        doc.text(`Sucursal: ${sucursal?.nombre || 'Desconocida'}`, 20, 45);
        doc.text(`Nivel de Riesgo: ${nivel.texto}`, 20, 55);
        doc.text(`Estado: ${incidencia.estado === 'finalizada' ? 'Finalizada' : 'Pendiente'}`, 20, 65);
        doc.text(`Fecha: ${formatearFecha(incidencia.fecha)}`, 20, 75);

        doc.setFontSize(11);
        doc.setFont(undefined, 'bold');
        doc.text('Descripción:', 20, 95);
        doc.setFont(undefined, 'normal');
        const descripcionLines = doc.splitTextToSize(incidencia.descripcion || 'Sin descripción', 170);
        doc.text(descripcionLines, 20, 103);

        return doc.output('blob');

    } catch (error) {
        console.error('Error en PDF simple:', error);
        return null;
    }
}

// =============================================
// MOSTRAR NOTIFICACIÓN DE NUEVA INCIDENCIA CON ID
// =============================================
function mostrarNotificacionIncidencia(incidencia, sucursal) {
    const nivel = CONFIG.nivelesRiesgo[incidencia.nivelRiesgo] || CONFIG.nivelesRiesgo.bajo;

    try {
        const audio = new Audio('/assets/sounds/notificacion.mp3');
        audio.play().catch(e => { });
    } catch (e) { }

    Swal.fire({
        title: '🚨 NUEVA INCIDENCIA',
        html: `
            <div style="text-align: left;">
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px;">
                    <i class="fas ${nivel.icono}" style="color: ${nivel.color}; font-size: 2rem;"></i>
                    <div>
                        <span style="background: ${nivel.color}20; color: ${nivel.color}; padding: 4px 12px; border-radius: 20px; font-size: 0.7rem; font-weight: bold;">
                            ${nivel.texto}
                        </span>
                    </div>
                </div>
                <div style="background: rgba(0, 207, 255, 0.1); padding: 8px 12px; border-radius: 8px; margin-bottom: 12px; border-left: 3px solid #00cfff;">
                    <i class="fas fa-hashtag" style="color: #00cfff; font-size: 0.8rem;"></i>
                    <strong style="color: #00cfff; font-family: monospace; font-size: 0.85rem;"> ID: ${incidencia.id}</strong>
                </div>
                <div style="font-size: 1rem; font-weight: bold; margin-bottom: 8px;">
                    ${escapeHTML(incidencia.titulo)}
                </div>
                <div style="color: #aaa; margin-bottom: 12px;">
                    ${escapeHTML(incidencia.descripcion.substring(0, 100))}${incidencia.descripcion.length > 100 ? '...' : ''}
                </div>
                <div style="border-top: 1px solid var(--color-border-light); padding-top: 10px;">
                    <div><i class="fas fa-store"></i> <strong>Sucursal:</strong> ${escapeHTML(sucursal?.nombre || 'Desconocida')}</div>
                    <div><i class="fas fa-map-pin"></i> <strong>Ubicación:</strong> ${escapeHTML(sucursal?.ciudad || '')}, ${escapeHTML(sucursal?.estado || '')}</div>
                    <div><i class="fas fa-clock"></i> <strong>Hora:</strong> ${formatearFecha(incidencia.fecha)}</div>
                </div>
            </div>
        `,
        icon: 'warning',
        showConfirmButton: true,
        confirmButtonText: 'VER EN MAPA',
        showCancelButton: true,
        cancelButtonText: 'VER PDF',
        confirmButtonColor: nivel.color,
        cancelButtonColor: '#c0392b',
        background: 'var(--color-bg-secondary)',
        color: 'var(--color-text-primary)',
        customClass: {
            popup: 'notification-swal'
        }
    }).then(async (result) => {
        if (result.isConfirmed && sucursal) {
            centrarEnSucursal(sucursal.id);
            await registrarVisualizacionIncidencia(incidencia, sucursal);
        } else if (result.dismiss === Swal.DismissReason.cancel) {
            window.verPDFIncidencia(incidencia.id);
        }
    });

    Swal.fire({
        title: `${nivel.texto} - Nueva incidencia`,
        html: `<strong style="font-family: monospace; color: #00cfff;">📎 ID: ${incidencia.id}</strong><br>${incidencia.titulo}<br><small>📍 ${sucursal?.nombre || 'sucursal desconocida'}</small>`,
        icon: 'warning',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 5000,
        timerProgressBar: true,
        background: 'var(--color-bg-secondary)',
        color: 'var(--color-text-primary)'
    });
}

// =============================================
// CENTRAR EN SUCURSAL
// =============================================
function centrarEnSucursal(sucursalId) {
    const sucursal = sucursalesMap.get(sucursalId);
    if (sucursal && marcadores.sucursales[sucursalId]) {
        mapa.setView([sucursal.latitud, sucursal.longitud], 16);
        marcadores.sucursales[sucursalId].openPopup();

        const marker = marcadores.sucursales[sucursalId];
        const originalIcon = marker.getIcon();

        const highlightIcon = L.divIcon({
            className: 'marcador-sucursal highlight',
            html: `<i class="fas fa-store" style="color: ${sucursal.regionColor}; font-size: 2.5rem; filter: drop-shadow(0 0 15px ${sucursal.regionColor});"></i>`,
            iconSize: [32, 32],
            iconAnchor: [16, 32],
            popupAnchor: [0, -32]
        });

        marker.setIcon(highlightIcon);
        setTimeout(() => {
            marker.setIcon(originalIcon);
        }, 2000);

    } else {
        // Silencioso
    }
}

window.centrarEnSucursal = centrarEnSucursal;
window.verPDFIncidencia = window.verPDFIncidencia;

// =============================================
// ACTUALIZAR ESTADÍSTICAS
// =============================================
function actualizarStats() {
    const criticas = incidencias.filter(i => i.nivelRiesgo === 'critico').length;
    const altas = incidencias.filter(i => i.nivelRiesgo === 'alto').length;
    const medias = incidencias.filter(i => i.nivelRiesgo === 'medio').length;
    const bajas = incidencias.filter(i => i.nivelRiesgo === 'bajo').length;

    const totalAltas = criticas + altas;

    const altasMini = document.getElementById('statAltasMini');
    const mediasMini = document.getElementById('statMediasMini');
    const bajasMini = document.getElementById('statBajasMini');
    const sucursalesMini = document.getElementById('statSucursalesMini');

    if (altasMini) altasMini.textContent = totalAltas;
    if (mediasMini) mediasMini.textContent = medias;
    if (bajasMini) bajasMini.textContent = bajas;
    if (sucursalesMini) sucursalesMini.textContent = sucursales.length;
}

// =============================================
// CARGAR REGIONES EN SELECTOR
// =============================================
async function cargarRegionesEnSelector() {
    const container = document.getElementById('regionList');
    if (!container) return;

    if (!regiones.length) {
        container.innerHTML = '<div class="loading-regions">No hay regiones disponibles</div>';
        return;
    }

    const sucursalesPorRegion = {};
    sucursales.forEach(s => {
        if (s.regionId) {
            sucursalesPorRegion[s.regionId] = (sucursalesPorRegion[s.regionId] || 0) + 1;
        }
    });

    container.innerHTML = regiones.map(region => {
        const count = sucursalesPorRegion[region.id] || 0;
        return `
            <div class="region-option" data-region-id="${region.id}" data-region-name="${escapeHTML(region.nombre)}" data-region-color="${region.color}">
                <div class="region-color-dot" style="background-color: ${region.color};"></div>
                <span class="region-option-name">${escapeHTML(region.nombre)}</span>
                <span class="region-option-count">${count} sucursales</span>
            </div>
        `;
    }).join('');

    document.querySelectorAll('.region-option').forEach(opt => {
        opt.addEventListener('click', () => {
            const regionId = opt.dataset.regionId;
            const regionName = opt.dataset.regionName;
            const regionColor = opt.dataset.regionColor;
            filtrarPorRegion(regionId, regionName, regionColor);
            cerrarDropdown();
        });
    });
}

// =============================================
// CARGAR REGIONES EN LISTA LATERAL
// =============================================
async function cargarRegionesEnLista() {
    const container = document.getElementById('regionesList');
    if (!container) return;

    if (!regiones.length) {
        container.innerHTML = '<div class="no-incidencias" style="padding: 15px;">No hay regiones</div>';
        return;
    }

    const sucursalesPorRegion = {};
    sucursales.forEach(s => {
        if (s.regionId) {
            sucursalesPorRegion[s.regionId] = (sucursalesPorRegion[s.regionId] || 0) + 1;
        }
    });

    container.innerHTML = regiones.map(region => {
        const count = sucursalesPorRegion[region.id] || 0;
        return `
            <div class="region-item">
                <div class="region-color" style="background-color: ${region.color};"></div>
                <span class="region-name">${escapeHTML(region.nombre)}</span>
                <span class="region-count">${count} suc.</span>
            </div>
        `;
    }).join('');
}

// =============================================
// FILTRAR POR REGIÓN
// =============================================
async function filtrarPorRegion(regionId, regionName, regionColor) {
    filtros.regionId = regionId;
    filtros.regionNombre = regionName;

    const btn = document.getElementById('btnSeleccionarRegion');
    if (btn) {
        btn.innerHTML = `
            <i class="fas fa-map-marker-alt"></i>
            <span style="background: ${regionColor}20; padding: 2px 8px; border-radius: 20px; color: ${regionColor};">
                ${escapeHTML(regionName)}
            </span>
            <i class="fas fa-chevron-down"></i>
        `;
    }

    mostrarBadgeRegionActiva(regionName, regionColor);

    let sucursalesMostradas = 0;
    Object.keys(marcadores.sucursales).forEach(id => {
        const s = sucursales.find(x => x.id === id);
        if (s) {
            if (s.regionId === regionId) {
                if (!mapa.hasLayer(marcadores.sucursales[id])) {
                    marcadores.sucursales[id].addTo(mapa);
                }
                sucursalesMostradas++;
            } else {
                if (mapa.hasLayer(marcadores.sucursales[id])) {
                    mapa.removeLayer(marcadores.sucursales[id]);
                }
            }
        }
    });

    await registrarFiltroRegion(regionId, regionName, sucursalesMostradas);

    const sucursalesRegion = Object.values(marcadores.sucursales).filter((m, idx) => {
        const s = sucursales.find(x => x.id === Object.keys(marcadores.sucursales)[idx]);
        return s && s.regionId === regionId;
    });

    if (sucursalesRegion.length > 0) {
        const grupo = L.featureGroup(sucursalesRegion);
        mapa.fitBounds(grupo.getBounds().pad(0.2));
    }
}

function mostrarTodasLasSucursales() {
    filtros.regionId = null;
    filtros.regionNombre = null;

    const btn = document.getElementById('btnSeleccionarRegion');
    if (btn) {
        btn.innerHTML = `
            <i class="fas fa-map-marker-alt"></i>
            <span>Seleccionar una Región</span>
            <i class="fas fa-chevron-down"></i>
        `;
    }

    ocultarBadgeRegionActiva();

    Object.keys(marcadores.sucursales).forEach(id => {
        if (!mapa.hasLayer(marcadores.sucursales[id])) {
            marcadores.sucursales[id].addTo(mapa);
        }
    });

    const todos = Object.values(marcadores.sucursales);
    if (todos.length > 0) {
        const grupo = L.featureGroup(todos);
        mapa.fitBounds(grupo.getBounds().pad(0.1));
    }
}

function mostrarBadgeRegionActiva(nombre, color) {
    let badge = document.getElementById('regionActiveBadge');
    if (!badge) {
        badge = document.createElement('div');
        badge.id = 'regionActiveBadge';
        badge.className = 'region-active-badge';
        const fullscreen = document.querySelector('.map-fullscreen');
        if (fullscreen) fullscreen.appendChild(badge);
    }
    badge.innerHTML = `
        <i class="fas fa-map-marker-alt" style="color: ${color};"></i>
        <span>Filtrando por:</span>
        <div class="badge-color" style="background-color: ${color};"></div>
        <strong style="color: ${color};">${escapeHTML(nombre)}</strong>
        <button id="btnQuitarFiltroRegion" style="background: none; border: none; color: #888; cursor: pointer; margin-left: 8px;">
            <i class="fas fa-times-circle"></i>
        </button>
    `;
    badge.style.display = 'flex';

    const btnQuitar = document.getElementById('btnQuitarFiltroRegion');
    if (btnQuitar) {
        btnQuitar.addEventListener('click', mostrarTodasLasSucursales);
    }
}

function ocultarBadgeRegionActiva() {
    const badge = document.getElementById('regionActiveBadge');
    if (badge) badge.style.display = 'none';
}

// =============================================
// CONFIGURAR SELECTOR DE REGIÓN
// =============================================
function configurarSelectorRegion() {
    const btn = document.getElementById('btnSeleccionarRegion');
    const dropdown = document.getElementById('regionDropdown');
    const limpiarBtn = document.getElementById('limpiarFiltroRegion');

    if (btn && dropdown) {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('show');
            btn.classList.toggle('active');
        });
    }

    if (limpiarBtn) {
        limpiarBtn.addEventListener('click', () => {
            mostrarTodasLasSucursales();
            if (dropdown) dropdown.classList.remove('show');
            if (btn) btn.classList.remove('active');
        });
    }

    document.addEventListener('click', (e) => {
        if (btn && dropdown && !btn.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.remove('show');
            btn.classList.remove('active');
        }
    });
}

function cerrarDropdown() {
    const dropdown = document.getElementById('regionDropdown');
    const btn = document.getElementById('btnSeleccionarRegion');
    if (dropdown) dropdown.classList.remove('show');
    if (btn) btn.classList.remove('active');
}

// =============================================
// CENTRAR MAPA
// =============================================
function centrarMapa() {
    if (!mapa) return;
    const todos = [...Object.values(marcadores.sucursales)];
    if (todos.length) {
        mapa.fitBounds(L.featureGroup(todos).getBounds().pad(0.1));
    } else {
        mapa.setView(CONFIG.centro, CONFIG.zoom);
    }
}

// =============================================
// REFRESCAR REGIONES
// =============================================
async function refrescarRegiones() {
    try {
        const btn = document.getElementById('btnRefrescarRegiones');
        if (btn) {
            const originalHTML = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Cargando...</span>';
            btn.disabled = true;
        }

        regiones = await regionManager.getRegionesByOrganizacion(
            usuarioActual.organizacionCamelCase,
            usuarioActual
        );

        await cargarRegionesEnLista();
        await cargarRegionesEnSelector();

        if (btn) {
            btn.innerHTML = '<i class="fas fa-sync-alt"></i><span>Actualizar</span>';
            btn.disabled = false;
        }

        Swal.fire({
            icon: 'success',
            title: 'Actualizado',
            text: `Se cargaron ${regiones.length} regiones`,
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 2000
        });

    } catch (error) {
        console.error('Error:', error);
        const btn = document.getElementById('btnRefrescarRegiones');
        if (btn) {
            btn.innerHTML = '<i class="fas fa-sync-alt"></i><span>Actualizar</span>';
            btn.disabled = false;
        }
    }
}

// =============================================
// CONFIGURAR PANELES (PANEL DE INCIDENCIAS INICIA CERRADO)
// =============================================
function configurarPaneles() {
    const incidenciasHeader = document.getElementById('toggleIncidencias');
    const incidenciasList = document.querySelector('.incidencias-list');
    const incidenciasChevron = document.getElementById('incidenciasChevron');

    if (incidenciasHeader && incidenciasList && incidenciasChevron) {
        let incidenciasOpen = false;
        incidenciasHeader.addEventListener('click', () => {
            incidenciasOpen = !incidenciasOpen;
            incidenciasList.style.display = incidenciasOpen ? 'block' : 'none';
            incidenciasChevron.className = incidenciasOpen ? 'fas fa-chevron-down' : 'fas fa-chevron-up';
        });
        incidenciasList.style.display = 'none';
        incidenciasChevron.className = 'fas fa-chevron-up';
    }

    const regionsHeader = document.getElementById('toggleRegions');
    const regionsPanel = document.getElementById('regionsPanel');
    const regionsList = document.querySelector('.regions-list');
    const regionsChevron = document.getElementById('regionsChevron');

    if (regionsHeader && regionsPanel && regionsList && regionsChevron) {
        let regionsOpen = false;
        regionsHeader.addEventListener('click', () => {
            regionsOpen = !regionsOpen;
            regionsList.style.display = regionsOpen ? 'block' : 'none';
            regionsChevron.className = regionsOpen ? 'fas fa-chevron-down' : 'fas fa-chevron-up';
            regionsPanel.style.transform = regionsOpen ? 'translateY(0)' : 'translateY(calc(100% - 45px))';
        });
        regionsList.style.display = 'none';
        regionsPanel.style.transform = 'translateY(calc(100% - 45px))';
    }
}

// =============================================
// CONFIGURAR EVENTOS
// =============================================
function configurarEventos() {
    const btnCentrar = document.getElementById('btnCentrarMapa');
    if (btnCentrar) btnCentrar.addEventListener('click', centrarMapa);

    const btnRefrescar = document.getElementById('btnRefrescarRegiones');
    if (btnRefrescar) btnRefrescar.addEventListener('click', refrescarRegiones);
}

// =============================================
// UTILIDADES
// =============================================
function escapeHTML(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatearFecha(fecha) {
    if (!fecha) return 'N/A';
    try {
        const date = fecha instanceof Date ? fecha : new Date(fecha);
        return date.toLocaleString('es-MX', {
            hour: '2-digit',
            minute: '2-digit',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    } catch {
        return 'Fecha inválida';
    }
}

function mostrarError(msg) {
    Swal.fire({
        icon: 'error',
        title: 'Error',
        text: msg,
        background: 'var(--color-bg-secondary)',
        color: 'var(--color-text-primary)'
    });
}