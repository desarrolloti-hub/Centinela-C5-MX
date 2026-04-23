// estadisticas.js - VERSIÓN CORREGIDA CON GRÁFICAS DE RECUPERACIÓN FUNCIONALES
  // version con colores para el nivel de riesgo ya funcional. 



  
import { generadorPDFEstadisticasUnificado } from '/components/pdf-estadisticas-unificado.js';
// =============================================
// VARIABLES GLOBALES
// =============================================
let estadisticasManager = null;
let incidenciaManager = null;
let mercanciaManager = null;
let organizacionActual = null;
let incidenciasCache = [];
let incidenciasFiltradas = [];
let registrosRecuperacionCache = [];
let registrosRecuperacionFiltrados = [];
let sucursalesCache = [];
let categoriasCache = [];
let sucursalesRecuperacionCache = [];
let charts = {};
let authToken = null;
let historialManager = null;
let accesoVistaRegistrado = false;




// Datos para clics de incidencias
let datosGraficas = {
    topActualizadores: [],
    topReportadores: [],
    topSeguimientos: [],
    estadoData: { pendientes: 0, finalizadas: 0 },
    riesgoData: { critico: 0, alto: 0, medio: 0, bajo: 0 },
    categoriasData: [],
    sucursalesData: [],
    tiemposPromedio: [],
    incidenciasFiltradas: []
};

// Datos para recuperación
let datosActualesRecuperacion = {
    registros: [],
    estadisticas: null
};

// Gráficas de recuperación
let graficoTipoEvento = null;
let graficoEvolucionMensual = null;
let graficoTopSucursales = null;
let graficoComparativa = null;
let regionesCache = [];

// Almacenes para datos clickeables de recuperación
window.registrosPorTipo = {};
window.registrosPorMes = {};
window.registrosPorSucursal = {};
// Cache para niveles de riesgo dinámicos
window.nivelesRiesgoEstaticos = null;


// Filtros activos
let filtrosActivos = {
    fechaInicio: null,
    fechaFin: null,
    categoriaId: 'todas',
    sucursalId: 'todas',
    colaboradorId: 'todos',
    busqueda: '',
    tipoEvento: 'todos',
    nivelRiesgoMapa: 'todos',
    agrupacionMapa: 'sucursal'
};

// Colores para gráficas
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

const COLORS_REC = {
    rojo: '#ef4444',
    rojoClaro: 'rgba(239, 68, 68, 0.1)',
    verde: '#10b981',
    verdeClaro: 'rgba(16, 185, 129, 0.1)',
    naranja: '#f59e0b',
    azul: '#3b82f6',
    morado: '#8b5cf6',
    rosa: '#ec4899',
    celeste: '#06b6d4',
    gris: '#6b7280'
};

// =============================================
// FUNCIONES AUXILIARES
// =============================================
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

function mostrarError(mensaje) {
    console.error(mensaje);
    if (typeof Swal !== 'undefined') {
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: mensaje,
            background: 'var(--color-bg-primary)',
            color: 'white'
        });
    }
}

function mostrarErrorInicializacion() {
    const container = document.querySelector('.admin-container');
    if (container) {
        container.innerHTML = `
            <div style="text-align:center; padding:60px 20px;">
                <i class="fas fa-exclamation-triangle" style="font-size:48px; color:#ef4444; margin-bottom:16px;"></i>
                <h5 style="color:white;">Error de inicialización</h5>
                <p style="color:var(--color-text-dim);">No se pudo cargar el módulo de estadísticas.</p>
                <button class="btn-buscar" onclick="location.reload()" style="margin-top:16px; padding:10px 20px;">
                    <i class="fas fa-sync-alt"></i> Reintentar
                </button>
            </div>
        `;
    }
}

function obtenerNombreSucursal(sucursalId) {
    if (!sucursalId) return 'No especificada';
    const sucursal = sucursalesCache.find(s => s.id === sucursalId);
    return sucursal ? sucursal.nombre : 'No disponible';
}

function obtenerNombreCategoria(categoriaId) {
    if (!categoriaId) return 'No especificada';
    const categoria = categoriasCache.find(c => c.id === categoriaId);
    return categoria ? categoria.nombre : 'No disponible';
}

function obtenerUsuarioActual() {
    try {
        const adminInfo = localStorage.getItem('adminInfo');
        if (adminInfo) {
            const adminData = JSON.parse(adminInfo);
            return {
                id: adminData.id || adminData.uid,
                uid: adminData.uid || adminData.id,
                nombreCompleto: adminData.nombreCompleto || 'Administrador',
                organizacion: adminData.organizacion,
                organizacionCamelCase: adminData.organizacionCamelCase,
                correoElectronico: adminData.correoElectronico || ''
            };
        }
        const userData = JSON.parse(localStorage.getItem('userData') || '{}');
        if (userData && Object.keys(userData).length > 0) {
            return {
                id: userData.uid || userData.id,
                uid: userData.uid || userData.id,
                nombreCompleto: userData.nombreCompleto || userData.nombre || 'Usuario',
                organizacion: userData.organizacion || userData.empresa,
                organizacionCamelCase: userData.organizacionCamelCase,
                correoElectronico: userData.correo || userData.email || ''
            };
        }
        return null;
    } catch (error) {
        return null;
    }
}

async function obtenerDatosOrganizacion() {
    try {
        const usuario = obtenerUsuarioActual();
        if (usuario) {
            organizacionActual = {
                nombre: usuario.organizacion || 'Mi Empresa',
                camelCase: usuario.organizacionCamelCase || ''
            };
            return;
        }
        const userData = JSON.parse(localStorage.getItem('userData') || '{}');
        const adminInfo = JSON.parse(localStorage.getItem('adminInfo') || '{}');
        organizacionActual = {
            nombre: userData.organizacion || adminInfo.organizacion || 'Mi Empresa',
            camelCase: userData.organizacionCamelCase || adminInfo.organizacionCamelCase || ''
        };
    } catch (error) {
        organizacionActual = { nombre: 'Mi Empresa', camelCase: '' };
    }
}

async function inicializarHistorial() {
    try {
        const { HistorialUsuarioManager } = await import('/clases/historialUsuario.js');
        historialManager = new HistorialUsuarioManager();
    } catch (error) {
        console.error('Error inicializando historialManager:', error);
    }
}

async function registrarAccesoVistaEstadisticas() {
    if (!historialManager || accesoVistaRegistrado) return;
    try {
        const usuario = obtenerUsuarioActual();
        if (!usuario) return;
        await historialManager.registrarActividad({
            usuario: usuario,
            tipo: 'leer',
            modulo: 'estadisticas',
            descripcion: 'Accedió al módulo de estadísticas unificado',
            detalles: {
                organizacion: organizacionActual?.nombre,
                filtrosPredeterminados: {
                    fechaInicio: filtrosActivos.fechaInicio,
                    fechaFin: filtrosActivos.fechaFin,
                    rango: 'últimos 30 días'
                }
            }
        });
        accesoVistaRegistrado = true;
    } catch (error) {
        console.error('Error registrando acceso a estadísticas:', error);
    }
}

async function registrarAplicacionFiltros(filtrosAplicados, totalIncidencias, totalRecuperaciones) {
    if (!historialManager) return;
    try {
        const usuario = obtenerUsuarioActual();
        if (!usuario) return;
        const filtrosDetalles = {};
        if (filtrosAplicados.fechaInicio && filtrosAplicados.fechaFin) {
            filtrosDetalles.rangoFechas = `${filtrosAplicados.fechaInicio} al ${filtrosAplicados.fechaFin}`;
        }
        if (filtrosAplicados.categoriaId !== 'todas') {
            const categoria = categoriasCache.find(c => c.id === filtrosAplicados.categoriaId);
            filtrosDetalles.categoria = categoria?.nombre || filtrosAplicados.categoriaId;
        }
        if (filtrosAplicados.sucursalId !== 'todas') {
            const sucursal = sucursalesCache.find(s => s.id === filtrosAplicados.sucursalId);
            filtrosDetalles.sucursal = sucursal?.nombre || filtrosAplicados.sucursalId;
        }
        if (filtrosAplicados.colaboradorId !== 'todos') {
            filtrosDetalles.colaborador = filtrosAplicados.colaboradorId;
        }
        if (filtrosAplicados.busqueda) {
            filtrosDetalles.busqueda = filtrosAplicados.busqueda;
        }
        if (filtrosAplicados.tipoEvento !== 'todos') {
            filtrosDetalles.tipoEvento = filtrosAplicados.tipoEvento;
        }
        await historialManager.registrarActividad({
            usuario: usuario,
            tipo: 'leer',
            modulo: 'estadisticas',
            descripcion: `Aplicó filtros en estadísticas - ${totalIncidencias} incidencias, ${totalRecuperaciones} registros de recuperación`,
            detalles: { filtros: filtrosDetalles, totalIncidencias, totalRecuperaciones, fechaAplicacion: new Date().toISOString() }
        });
    } catch (error) {
        console.error('Error registrando aplicación de filtros:', error);
    }
}

async function registrarLimpiezaFiltros() {
    if (!historialManager) return;
    try {
        const usuario = obtenerUsuarioActual();
        if (!usuario) return;
        await historialManager.registrarActividad({
            usuario: usuario,
            tipo: 'leer',
            modulo: 'estadisticas',
            descripcion: 'Limpió los filtros de estadísticas',
            detalles: { fechaLimpieza: new Date().toISOString() }
        });
    } catch (error) {
        console.error('Error registrando limpieza de filtros:', error);
    }
}

async function obtenerTokenAuth() {
    try {
        if (window.firebase) {
            const user = firebase.auth().currentUser;
            if (user) {
                authToken = await user.getIdToken();
            }
        }
        if (!authToken) {
            const token = localStorage.getItem('firebaseToken') ||
                localStorage.getItem('authToken') ||
                localStorage.getItem('token');
            if (token) authToken = token;
        }
    } catch (error) {
        authToken = null;
    }
}

function mostrarResultados() {
    const welcomeMsg = document.getElementById('welcomeMessage');
    const resultadosSection = document.getElementById('resultadosSection');
    if (welcomeMsg) welcomeMsg.style.display = 'none';
    if (resultadosSection) resultadosSection.classList.add('visible');
}

function mostrarMensajeSinResultados() {
    mostrarResultados();
    const graficasIds = [
        'graficoActualizadores', 'graficoReportadores', 'graficoSeguimientos',
        'graficoEstado', 'graficoRiesgo', 'graficoCategorias',
        'graficoSucursales', 'graficoTiempo'
    ];
    graficasIds.forEach(id => {
        const canvas = document.getElementById(id);
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (charts[id]) delete charts[id];
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.font = '16px Arial';
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.textAlign = 'center';
            ctx.fillText('📭 Sin resultados con los filtros actuales', canvas.width / 2, canvas.height / 2);
        }
    });
    const tablaColab = document.getElementById('tablaColaboradoresBody');
    if (tablaColab) tablaColab.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:40px;"><i class="fas fa-search" style="font-size: 32px; opacity: 0.3; margin-bottom: 10px;"></i><br>No hay incidencias que coincidan con los filtros</td></tr>';
    const tablaCat = document.getElementById('tablaCategoriasBody');
    if (tablaCat) tablaCat.innerHTML = '<tr><td colspan="2" style="text-align:center; padding:40px;"><i class="fas fa-search" style="font-size: 32px; opacity: 0.3; margin-bottom: 10px;"></i><br>No hay incidencias que coincidan con los filtros</td></tr>';
    setElementText('metricCriticas', '0');
    setElementText('metricAltas', '0');
    setElementText('metricPendientes', '0');
    setElementText('metricTotal', '0');
    setElementText('metricCriticasPorcentaje', '0% del total');
    setElementText('metricAltasPorcentaje', '0% del total');
    setElementText('metricPendientesPorcentaje', '0% pendientes');
    setElementText('metricFinalizadasPorcentaje', '0% resueltas');
    const formatter = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
    setElementText('totalPerdidas', formatter.format(0));
    setElementText('totalRecuperado', formatter.format(0));
    setElementText('totalNeto', formatter.format(0));
    setElementText('porcentajeRecuperacion', '0%');
    setElementText('totalEventosRecuperacion', '0');
    setElementText('promedioPerdida', formatter.format(0));
}

async function inicializarEstadisticasManager() {
    try {
        await obtenerDatosOrganizacion();
        const { IncidenciaManager } = await import('/clases/incidencia.js');
        const { EstadisticasManager } = await import('/clases/estadistica.js');
        const { MercanciaPerdidaManager } = await import('/clases/incidenciaRecuperacion.js');
        incidenciaManager = new IncidenciaManager();
        estadisticasManager = new EstadisticasManager();
        mercanciaManager = new MercanciaPerdidaManager();
        return true;
    } catch (error) {
        console.error('Error al inicializar managers:', error);
        mostrarErrorInicializacion();
        return false;
    }
}

async function cargarSucursales() {
    try {
        const { SucursalManager } = await import('/clases/sucursal.js');
        const sucursalManager = new SucursalManager();
        if (organizacionActual.camelCase) {
            sucursalesCache = await sucursalManager.getSucursalesByOrganizacion(organizacionActual.camelCase);
            const filtroSucursal = document.getElementById('filtroSucursal');
            if (filtroSucursal) {
                filtroSucursal.innerHTML = '<option value="todas">Todas las sucursales</option>';
                sucursalesCache.forEach(suc => {
                    const option = document.createElement('option');
                    option.value = suc.id;
                    option.textContent = suc.nombre;
                    filtroSucursal.appendChild(option);
                });
            }
        }
    } catch (error) {
        console.error('Error cargando sucursales:', error);
        sucursalesCache = [];
    }
}

async function cargarCategorias() {
    try {
        const { CategoriaManager } = await import('/clases/categoria.js');
        const categoriaManager = new CategoriaManager();
        categoriasCache = await categoriaManager.obtenerCategoriasPorOrganizacion(organizacionActual.camelCase);
        const filtroCategoria = document.getElementById('filtroCategoria');
        if (filtroCategoria) {
            filtroCategoria.innerHTML = '<option value="todas">Todas las categorías</option>';
            categoriasCache.forEach(cat => {
                const option = document.createElement('option');
                option.value = cat.id;
                option.textContent = cat.nombre;
                filtroCategoria.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error cargando categorías:', error);
        categoriasCache = [];
    }
}

async function cargarRegiones() {
    try {
        if (!organizacionActual?.camelCase) return;
        const { RegionManager } = await import('/clases/region.js');
        const regionManager = new RegionManager();
        regionesCache = await regionManager.getRegionesByOrganizacion(organizacionActual.camelCase);
        
        // Depuración: Verificar que se cargaron las regiones con sus colores
        console.log('Regiones cargadas:', regionesCache.map(r => ({ nombre: r.nombre, color: r.color })));
        
    } catch (error) {
        console.error('Error cargando regiones:', error);
        regionesCache = [];
    }
}

async function cargarSucursalesRecuperacion() {
    try {
        if (!organizacionActual?.camelCase) return;
        const { SucursalManager } = await import('/clases/sucursal.js');
        const sucursalManager = new SucursalManager();
        const sucursales = await sucursalManager.getSucursalesByOrganizacion(organizacionActual.camelCase);
        sucursalesRecuperacionCache = [...new Set(sucursales.map(s => s.nombre))];
    } catch (error) {
        sucursalesRecuperacionCache = [];
    }
}

function configurarFiltros() {
    document.getElementById('btnAplicarFiltros')?.addEventListener('click', aplicarFiltros);
    document.getElementById('btnLimpiarFiltros')?.addEventListener('click', limpiarFiltros);
    document.getElementById('btnLimpiarFiltrosSec')?.addEventListener('click', limpiarFiltros);
    let timeout;
    document.getElementById('buscarIncidencias')?.addEventListener('input', (e) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            filtrosActivos.busqueda = e.target.value;
            aplicarFiltros();
        }, 500);
    });
    document.getElementById('btnGenerarPDF')?.addEventListener('click', generarReportePDF);
}

function establecerFechasPorDefecto() {
    const hoy = new Date();
    const hace30Dias = new Date();
    hace30Dias.setDate(hoy.getDate() - 30);
    const fechaInicio = document.getElementById('filtroFechaInicio');
    const fechaFin = document.getElementById('filtroFechaFin');
    if (fechaInicio) fechaInicio.value = hace30Dias.toISOString().split('T')[0];
    if (fechaFin) fechaFin.value = hoy.toISOString().split('T')[0];
    filtrosActivos.fechaInicio = hace30Dias.toISOString().split('T')[0];
    filtrosActivos.fechaFin = hoy.toISOString().split('T')[0];
}

function filtrarIncidencias(incidencias) {
    return incidencias.filter(inc => {
        if (filtrosActivos.fechaInicio) {
            const fechaInc = inc.fechaInicio instanceof Date ? inc.fechaInicio : new Date(inc.fechaInicio);
            if (fechaInc < new Date(filtrosActivos.fechaInicio)) return false;
        }
        if (filtrosActivos.fechaFin) {
            const fechaInc = inc.fechaInicio instanceof Date ? inc.fechaInicio : new Date(inc.fechaInicio);
            const fechaFin = new Date(filtrosActivos.fechaFin);
            fechaFin.setHours(23, 59, 59);
            if (fechaInc > fechaFin) return false;
        }
        if (filtrosActivos.categoriaId !== 'todas' && inc.categoriaId !== filtrosActivos.categoriaId) return false;
        if (filtrosActivos.sucursalId !== 'todas' && inc.sucursalId !== filtrosActivos.sucursalId) return false;
        if (filtrosActivos.colaboradorId !== 'todos') {
            const coincideColaborador = inc.creadoPorNombre === filtrosActivos.colaboradorId ||
                inc.actualizadoPorNombre === filtrosActivos.colaboradorId;
            if (!coincideColaborador) return false;
        }
        if (filtrosActivos.busqueda) {
            const busqueda = filtrosActivos.busqueda.toLowerCase();
            const coincide = inc.id?.toLowerCase().includes(busqueda) ||
                inc.detalles?.toLowerCase().includes(busqueda) ||
                (inc.creadoPorNombre && inc.creadoPorNombre.toLowerCase().includes(busqueda));
            if (!coincide) return false;
        }
        return true;
    });
}

async function cargarIncidencias() {
    if (!incidenciaManager || !organizacionActual.camelCase) {
        mostrarError('No se pudo cargar el gestor de incidencias');
        return;
    }
    try {
        if (incidenciasCache.length === 0) {
            incidenciasCache = await incidenciaManager.getIncidenciasByOrganizacion(organizacionActual.camelCase);
        }
        incidenciasFiltradas = filtrarIncidencias(incidenciasCache);
        if (incidenciasFiltradas.length === 0) {
            mostrarMensajeSinResultados();
            return;
        }
        mostrarResultados();
        const datos = await procesarDatosGraficas(incidenciasFiltradas);    
            datosGraficas = {
            topActualizadores: datos.topActualizadores,
            topReportadores: datos.topReportadores,
            topSeguimientos: datos.topSeguimientos,
            estadoData: datos.estadoData,
            riesgoData: datos.riesgoData,
            categoriasData: datos.categoriasData,
            sucursalesData: datos.sucursalesData,
            tiemposPromedio: datos.tiemposPromedio,
            incidenciasFiltradas: incidenciasFiltradas
        };
        actualizarMetricasPrincipales(datos.metricas);
        renderizarTodasLasGraficas(datos);
        setTimeout(() => configurarKpiCardsClickeables(), 100);
        if (datos.colaboradores && datos.colaboradores.length > 0) {
            renderizarTablaColaboradores(datos.colaboradores);
            cargarFiltroColaboradores(datos.colaboradores);
        } else {
            renderizarTablaColaboradores([]);
        }
        if (datos.categoriasData && datos.categoriasData.length > 0) {
            renderizarTablaCategorias(datos.categoriasData);
        } else {
            renderizarTablaCategorias([]);
        }
        const fechaEl = document.getElementById('fechaActualizacion');
        if (fechaEl) fechaEl.textContent = new Date().toLocaleString('es-MX');
    } catch (error) {
        console.error('Error al cargar incidencias:', error);
        mostrarError('Error al cargar estadísticas: ' + error.message);
    }
}

async function procesarDatosGraficas(incidencias) {
    const metricas = {
        total: incidencias.length,
        pendientes: incidencias.filter(i => i.estado === 'pendiente').length,
        finalizadas: incidencias.filter(i => i.estado === 'finalizada').length,
        criticas: incidencias.filter(i => i.nivelRiesgo === 'critico').length,
        altas: incidencias.filter(i => i.nivelRiesgo === 'alto').length,
        medias: incidencias.filter(i => i.nivelRiesgo === 'medio').length,
        bajas: incidencias.filter(i => i.nivelRiesgo === 'bajo').length
    };
    
    const actualizacionesPorColaborador = new Map();
    incidencias.forEach(inc => {
        if (inc.actualizadoPorNombre) {
            actualizacionesPorColaborador.set(inc.actualizadoPorNombre, (actualizacionesPorColaborador.get(inc.actualizadoPorNombre) || 0) + 1);
        }
    });
    const topActualizadores = Array.from(actualizacionesPorColaborador.entries())
        .map(([nombre, cantidad]) => ({ nombre, cantidad }))
        .sort((a, b) => b.cantidad - a.cantidad).slice(0, 5);
    
    const reportesPorColaborador = new Map();
    incidencias.forEach(inc => {
        if (inc.creadoPorNombre) {
            reportesPorColaborador.set(inc.creadoPorNombre, (reportesPorColaborador.get(inc.creadoPorNombre) || 0) + 1);
        }
    });
    const topReportadores = Array.from(reportesPorColaborador.entries())
        .map(([nombre, cantidad]) => ({ nombre, cantidad }))
        .sort((a, b) => b.cantidad - a.cantidad).slice(0, 5);
    
    const seguimientosPorColaborador = new Map();
    incidencias.forEach(inc => {
        if (inc.seguimiento) {
            Object.values(inc.seguimiento).forEach(seg => {
                if (seg.usuarioNombre) {
                    seguimientosPorColaborador.set(seg.usuarioNombre, (seguimientosPorColaborador.get(seg.usuarioNombre) || 0) + 1);
                }
            });
        }
    });
    const topSeguimientos = Array.from(seguimientosPorColaborador.entries())
        .map(([nombre, cantidad]) => ({ nombre, cantidad }))
        .sort((a, b) => b.cantidad - a.cantidad).slice(0, 5);
    
    const estadoData = { pendientes: metricas.pendientes, finalizadas: metricas.finalizadas };
    // =============================================
// NIVELES DE RIESGO - DINÁMICOS (desde RiesgoNivelManager)
// =============================================
const riesgoData = {};
const nivelesRiesgoMap = new Map(); // Para almacenar colores

// Cargar niveles de riesgo dinámicos si no están cargados
if (!window.nivelesRiesgoEstaticos && organizacionActual?.camelCase) {
    try {
        const { RiesgoNivelManager } = await import('/clases/riesgoNivel.js');
        const riesgoManager = new RiesgoNivelManager();
        const niveles = await riesgoManager.obtenerTodosNiveles(organizacionActual.camelCase);
        
        window.nivelesRiesgoEstaticos = niveles;
        
        // Inicializar contadores para cada nivel
        niveles.forEach(nivel => {
            riesgoData[nivel.id] = 0;
            nivelesRiesgoMap.set(nivel.id, nivel.color || '#6c757d');
        });
    } catch (error) {
        console.error('Error cargando niveles de riesgo dinámicos:', error);
        // Fallback a niveles estáticos si hay error
        window.nivelesRiesgoEstaticos = [];
    }
}

// Si tenemos niveles dinámicos, contar incidencias por nivel de riesgo
if (window.nivelesRiesgoEstaticos && window.nivelesRiesgoEstaticos.length > 0) {
    // Reiniciar contadores
    window.nivelesRiesgoEstaticos.forEach(nivel => {
        riesgoData[nivel.id] = 0;
    });
    
    // Contar incidencias por nivel de riesgo
    incidencias.forEach(inc => {
        const nivelRiesgo = inc.nivelRiesgo;
        if (nivelRiesgo && riesgoData.hasOwnProperty(nivelRiesgo)) {
            riesgoData[nivelRiesgo]++;
        } else if (nivelRiesgo && !riesgoData.hasOwnProperty(nivelRiesgo)) {
            // Si encontramos un nivel que no está en nuestro mapa, lo agregamos
            riesgoData[nivelRiesgo] = 1;
            nivelesRiesgoMap.set(nivelRiesgo, '#6c757d');
        }
    });
} else {
    // Fallback: usar niveles estáticos (compatibilidad con datos antiguos)
    riesgoData.critico = metricas.criticas;
    riesgoData.alto = metricas.altas;
    riesgoData.medio = metricas.medias;
    riesgoData.bajo = metricas.bajas;
}    
    // =============================================
    // CATEGORÍAS - Con color desde la base de datos
    // =============================================
    const categoriasMap = new Map();
    incidencias.forEach(inc => {
        if (inc.categoriaId) {
            const categoria = categoriasCache.find(c => c.id === inc.categoriaId);
            const nombre = categoria ? categoria.nombre : obtenerNombreCategoria(inc.categoriaId);
            const color = categoria ? categoria.color : '#2f8cff'; // Color por defecto si no tiene
            categoriasMap.set(nombre, {
                cantidad: (categoriasMap.get(nombre)?.cantidad || 0) + 1,
                color: color
            });
        }
    });
    const categoriasData = Array.from(categoriasMap.entries())
        .map(([nombre, data]) => ({ nombre, cantidad: data.cantidad, color: data.color }))
        .sort((a, b) => b.cantidad - a.cantidad)
        .slice(0, 5);
    
    // =============================================
    // SUCURSALES - Con color de la región de cada sucursal
    // =============================================
    const sucursalesMap = new Map();
    
    // Obtener colores de regiones para cada sucursal
// Obtener colores de regiones para cada sucursal
for (const inc of incidencias) {
    if (inc.sucursalId) {
        const sucursal = sucursalesCache.find(s => s.id === inc.sucursalId);
        const nombre = sucursal ? sucursal.nombre : obtenerNombreSucursal(inc.sucursalId);
        
        if (!sucursalesMap.has(nombre)) {
            // Obtener el color de la región de esta sucursal
            let regionColor = '#6c757d'; // Color por defecto
            if (sucursal && sucursal.regionId && regionesCache) {  // <--- CORREGIDO: regionesCache sin window
                const region = regionesCache.find(r => r.id === sucursal.regionId);
                if (region && region.color) {
                    regionColor = region.color;
                }
            }
            sucursalesMap.set(nombre, {
                cantidad: 0,
                color: regionColor
            });
        }
        sucursalesMap.get(nombre).cantidad++;
    }
}
    
    const sucursalesData = Array.from(sucursalesMap.entries())
        .map(([nombre, data]) => ({ nombre, cantidad: data.cantidad, color: data.color }))
        .sort((a, b) => b.cantidad - a.cantidad)
        .slice(0, 5);
    
    // Tiempos de resolución (sin cambios)
    const tiemposResolucion = new Map();
    const incidenciasFinalizadas = incidencias.filter(i => i.estado === 'finalizada');
    
    incidenciasFinalizadas.forEach(inc => {
        const inicio = inc.fechaInicio instanceof Date ? inc.fechaInicio : new Date(inc.fechaInicio);
        let fechaFin = null;
        
        if (inc.fechaFinalizacion) {
            fechaFin = inc.fechaFinalizacion instanceof Date ? inc.fechaFinalizacion : new Date(inc.fechaFinalizacion);
        } else if (inc.fechaActualizacion) {
            fechaFin = inc.fechaActualizacion instanceof Date ? inc.fechaActualizacion : new Date(inc.fechaActualizacion);
        } else if (inc.seguimiento) {
            const seguimientosArray = Object.values(inc.seguimiento);
            if (seguimientosArray.length > 0) {
                const fechasSeguimientos = seguimientosArray
                    .map(seg => seg.fecha ? new Date(seg.fecha) : null)
                    .filter(f => f !== null);
                if (fechasSeguimientos.length > 0) {
                    fechaFin = new Date(Math.max(...fechasSeguimientos));
                }
            }
        }
        
        if (!fechaFin && inc.fechaActualizacion) {
            fechaFin = inc.fechaActualizacion instanceof Date ? inc.fechaActualizacion : new Date(inc.fechaActualizacion);
        }
        
        if (fechaFin && inicio && inc.actualizadoPorNombre) {
            const diffMs = fechaFin - inicio;
            const diffHoras = diffMs / (1000 * 60 * 60);
            
            if (diffHoras > 0 && diffHoras < 720) {
                if (!tiemposResolucion.has(inc.actualizadoPorNombre)) {
                    tiemposResolucion.set(inc.actualizadoPorNombre, { total: 0, count: 0 });
                }
                const data = tiemposResolucion.get(inc.actualizadoPorNombre);
                data.total += diffHoras;
                data.count++;
            }
        }
    });
    
    const tiemposPromedio = Array.from(tiemposResolucion.entries())
        .map(([nombre, data]) => ({ 
            nombre, 
            promedio: data.count > 0 ? Math.round(data.total / data.count) : 0,
            incidenciasResueltas: data.count
        }))
        .filter(t => t.promedio > 0)
        .sort((a, b) => a.promedio - b.promedio)
        .slice(0, 8);
    
    const colaboradoresMap = new Map();
    incidencias.forEach(inc => {
        if (inc.creadoPorNombre) {
            if (!colaboradoresMap.has(inc.creadoPorNombre)) {
                colaboradoresMap.set(inc.creadoPorNombre, { 
                    nombre: inc.creadoPorNombre, 
                    reportados: 0, 
                    actualizados: 0, 
                    seguimientos: 0, 
                    tiempoTotal: 0, 
                    incidenciasResueltas: 0 
                });
            }
            colaboradoresMap.get(inc.creadoPorNombre).reportados++;
        }
        
        if (inc.actualizadoPorNombre) {
            if (!colaboradoresMap.has(inc.actualizadoPorNombre)) {
                colaboradoresMap.set(inc.actualizadoPorNombre, { 
                    nombre: inc.actualizadoPorNombre, 
                    reportados: 0, 
                    actualizados: 0, 
                    seguimientos: 0, 
                    tiempoTotal: 0, 
                    incidenciasResueltas: 0 
                });
            }
            const col = colaboradoresMap.get(inc.actualizadoPorNombre);
            col.actualizados++;
            if (inc.estado === 'finalizada') col.incidenciasResueltas++;
        }
        
        if (inc.seguimiento) {
            Object.values(inc.seguimiento).forEach(seg => {
                if (seg.usuarioNombre) {
                    if (!colaboradoresMap.has(seg.usuarioNombre)) {
                        colaboradoresMap.set(seg.usuarioNombre, { 
                            nombre: seg.usuarioNombre, 
                            reportados: 0, 
                            actualizados: 0, 
                            seguimientos: 0, 
                            tiempoTotal: 0, 
                            incidenciasResueltas: 0 
                        });
                    }
                    colaboradoresMap.get(seg.usuarioNombre).seguimientos++;
                }
            });
        }
    });
    
    incidenciasFinalizadas.forEach(inc => {
        if (inc.actualizadoPorNombre && colaboradoresMap.has(inc.actualizadoPorNombre)) {
            const inicio = inc.fechaInicio instanceof Date ? inc.fechaInicio : new Date(inc.fechaInicio);
            let fechaFin = null;
            if (inc.fechaFinalizacion) {
                fechaFin = inc.fechaFinalizacion instanceof Date ? inc.fechaFinalizacion : new Date(inc.fechaFinalizacion);
            } else if (inc.fechaActualizacion) {
                fechaFin = inc.fechaActualizacion instanceof Date ? inc.fechaActualizacion : new Date(inc.fechaActualizacion);
            } else if (inc.seguimiento) {
                const seguimientosArray = Object.values(inc.seguimiento);
                if (seguimientosArray.length > 0) {
                    const fechasSeguimientos = seguimientosArray
                        .map(seg => seg.fecha ? new Date(seg.fecha) : null)
                        .filter(f => f !== null);
                    if (fechasSeguimientos.length > 0) {
                        fechaFin = new Date(Math.max(...fechasSeguimientos));
                    }
                }
            }
            
            if (fechaFin) {
                const tiempo = Math.round((fechaFin - inicio) / (1000 * 60 * 60));
                if (tiempo > 0 && tiempo < 720) {
                    colaboradoresMap.get(inc.actualizadoPorNombre).tiempoTotal += tiempo;
                }
            }
        }
    });
    
    return {
        metricas, 
        topActualizadores, 
        topReportadores, 
        topSeguimientos,
        estadoData, 
        riesgoData, 
        categoriasData, 
        sucursalesData,
        tiemposPromedio,
        colaboradores: Array.from(colaboradoresMap.values())
            .sort((a, b) => (b.reportados + b.actualizados + b.seguimientos) - (a.reportados + a.actualizados + a.seguimientos))
    };
}

function actualizarMetricasPrincipales(metricas) {
    const total = metricas.total || 1;
    setElementText('metricCriticas', metricas.criticas);
    setElementText('metricAltas', metricas.altas);
    setElementText('metricPendientes', metricas.pendientes);
    setElementText('metricTotal', total);
    setElementText('metricCriticasPorcentaje', `${Math.round((metricas.criticas / total) * 100)}% del total`);
    setElementText('metricAltasPorcentaje', `${Math.round((metricas.altas / total) * 100)}% del total`);
    setElementText('metricPendientesPorcentaje', `${Math.round((metricas.pendientes / total) * 100)}% pendientes`);
    setElementText('metricFinalizadasPorcentaje', `${Math.round((metricas.finalizadas / total) * 100)}% resueltas`);
}

function renderizarTodasLasGraficas(datos) {
    Object.keys(charts).forEach(key => {
        if (charts[key] && typeof charts[key].destroy === 'function') {
            charts[key].destroy();
            delete charts[key];
        }
    });
    crearGraficoActualizadores(datos.topActualizadores);
    crearGraficoReportadores(datos.topReportadores);
    crearGraficoSeguimientos(datos.topSeguimientos);
    crearGraficoEstado(datos.estadoData);
    crearGraficoRiesgo(datos.riesgoData);
    crearGraficoCategorias(datos.categoriasData);
    crearGraficoSucursales(datos.sucursalesData);
    crearGraficoTiempoResolucion(datos.tiemposPromedio);
    agregarEventosClickCanvas();
}

function agregarEventosClickCanvas() {
    // Los eventos onClick ya están dentro de cada gráfica en sus options
    // Solo aseguramos que los canvas tengan cursor pointer
    const canvasIds = ['graficoActualizadores', 'graficoReportadores', 'graficoSeguimientos', 'graficoEstado', 'graficoRiesgo', 'graficoCategorias', 'graficoSucursales', 'graficoTiempo'];
    canvasIds.forEach(id => {
        const canvas = document.getElementById(id);
        if (canvas) {
            canvas.style.cursor = 'pointer';
        }
    });
}

function crearGraficoActualizadores(actualizadores) {
    const canvas = document.getElementById('graficoActualizadores');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!actualizadores || actualizadores.length === 0) {
        mostrarMensajeSinDatosEnCanvas(ctx, canvas, 'Sin datos de actualizaciones');
        return;
    }
    charts.actualizadores = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: actualizadores.map(a => a.nombre.length > 12 ? a.nombre.substring(0, 10) + '...' : a.nombre),
            datasets: [{ label: 'Incidencias actualizadas', data: actualizadores.map(a => a.cantidad), backgroundColor: COLORS.azul, borderRadius: 4 }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: true, 
            plugins: { legend: { labels: { color: 'white' } } }, 
            scales: { y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: 'white', stepSize: 1 } }, x: { grid: { display: false }, ticks: { color: 'white', maxRotation: 45 } } },
            onClick: (event, activeElements) => {
                if (activeElements.length > 0) {
                    const index = activeElements[0].index;
                    const colaborador = actualizadores[index];
                    if (colaborador) {
                        const incidencias = datosGraficas.incidenciasFiltradas?.filter(i => i.actualizadoPorNombre === colaborador.nombre) || [];
                        if (incidencias.length === 0) {
                            Swal.fire({ icon: 'info', title: 'Sin registros', text: `No hay incidencias actualizadas por ${colaborador.nombre}`, background: 'var(--color-bg-primary)', color: 'white' });
                        } else {
                            mostrarRegistrosEnSweet(incidencias, `Incidencias actualizadas por: ${colaborador.nombre}`, '<i class="fas fa-edit"></i>');
                        }
                    }
                }
            }
        }
    });
}

function crearGraficoReportadores(reportadores) {
    const canvas = document.getElementById('graficoReportadores');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!reportadores || reportadores.length === 0) {
        mostrarMensajeSinDatosEnCanvas(ctx, canvas, 'Sin datos de reportes');
        return;
    }
    charts.reportadores = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: reportadores.map(r => r.nombre.length > 12 ? r.nombre.substring(0, 10) + '...' : r.nombre),
            datasets: [{ label: 'Incidencias reportadas', data: reportadores.map(r => r.cantidad), backgroundColor: COLORS.verde, borderRadius: 4 }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: true, 
            plugins: { legend: { labels: { color: 'white' } } }, 
            scales: { y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: 'white', stepSize: 1 } }, x: { grid: { display: false }, ticks: { color: 'white', maxRotation: 45 } } },
            onClick: (event, activeElements) => {
                if (activeElements.length > 0) {
                    const index = activeElements[0].index;
                    const colaborador = reportadores[index];
                    if (colaborador) {
                        const incidencias = datosGraficas.incidenciasFiltradas?.filter(i => i.creadoPorNombre === colaborador.nombre) || [];
                        if (incidencias.length === 0) {
                            Swal.fire({ icon: 'info', title: 'Sin registros', text: `No hay incidencias reportadas por ${colaborador.nombre}`, background: 'var(--color-bg-primary)', color: 'white' });
                        } else {
                            mostrarRegistrosEnSweet(incidencias, `Incidencias reportadas por: ${colaborador.nombre}`, '<i class="fas fa-flag"></i>');
                        }
                    }
                }
            }
        }
    });
}

function crearGraficoSeguimientos(seguimientos) {
    const canvas = document.getElementById('graficoSeguimientos');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!seguimientos || seguimientos.length === 0) {
        mostrarMensajeSinDatosEnCanvas(ctx, canvas, 'Sin datos de seguimientos');
        return;
    }
    charts.seguimientos = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: seguimientos.map(s => s.nombre.length > 12 ? s.nombre.substring(0, 10) + '...' : s.nombre),
            datasets: [{ label: 'Seguimientos realizados', data: seguimientos.map(s => s.cantidad), backgroundColor: COLORS.naranja, borderRadius: 4 }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: true, 
            plugins: { legend: { labels: { color: 'white' } } }, 
            scales: { y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: 'white', stepSize: 1 } }, x: { grid: { display: false }, ticks: { color: 'white', maxRotation: 45 } } },
            onClick: (event, activeElements) => {
                if (activeElements.length > 0) {
                    const index = activeElements[0].index;
                    const colaborador = seguimientos[index];
                    if (colaborador) {
                        const incidencias = datosGraficas.incidenciasFiltradas?.filter(i => i.seguimiento && Object.values(i.seguimiento).some(seg => seg.usuarioNombre === colaborador.nombre)) || [];
                        if (incidencias.length === 0) {
                            Swal.fire({ icon: 'info', title: 'Sin registros', text: `No hay seguimientos de ${colaborador.nombre}`, background: 'var(--color-bg-primary)', color: 'white' });
                        } else {
                            mostrarRegistrosEnSweet(incidencias, `Seguimientos realizados por: ${colaborador.nombre}`, '<i class="fas fa-history"></i>');
                        }
                    }
                }
            }
        }
    });
}

function crearGraficoEstado(estado) {
    const canvas = document.getElementById('graficoEstado');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if ((!estado.pendientes || estado.pendientes === 0) && (!estado.finalizadas || estado.finalizadas === 0)) {
        mostrarMensajeSinDatosEnCanvas(ctx, canvas, 'Sin datos de estado');
        return;
    }
    charts.estado = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: ['Pendientes', 'Finalizadas'], datasets: [{ data: [estado.pendientes || 0, estado.finalizadas || 0], backgroundColor: [COLORS.pendiente, COLORS.finalizada], borderWidth: 0, hoverOffset: 15 }] },
        options: { 
            responsive: true, 
            maintainAspectRatio: true, 
            plugins: { legend: { labels: { color: 'white' }, position: 'bottom' }, tooltip: { callbacks: { label: (ctx) => { const total = (estado.pendientes || 0) + (estado.finalizadas || 0); const porcentaje = total > 0 ? Math.round((ctx.raw / total) * 100) : 0; return `${ctx.label}: ${ctx.raw} (${porcentaje}%)`; } } } },
            onClick: (event, activeElements) => {
                if (activeElements.length > 0) {
                    const index = activeElements[0].index;
                    const estadoKey = index === 0 ? 'pendiente' : 'finalizada';
                    const estadoNombre = index === 0 ? 'Pendientes' : 'Finalizadas';
                    const incidencias = datosGraficas.incidenciasFiltradas?.filter(i => i.estado === estadoKey) || [];
                    if (incidencias.length === 0) {
                        Swal.fire({ icon: 'info', title: 'Sin registros', text: `No hay incidencias ${estadoNombre}`, background: 'var(--color-bg-primary)', color: 'white' });
                    } else {
                        mostrarRegistrosEnSweet(incidencias, `Incidencias ${estadoNombre}`, `<i class="fas ${estadoKey === 'pendiente' ? 'fa-clock' : 'fa-check-circle'}"></i>`);
                    }
                }
            }
        }
    });
}

function crearGraficoRiesgo(riesgo) {
    const canvas = document.getElementById('graficoRiesgo');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const tieneDatos = Object.values(riesgo).some(valor => valor > 0);
    
    if (!tieneDatos) {
        mostrarMensajeSinDatosEnCanvas(ctx, canvas, 'Sin datos de riesgo');
        if (typeof actualizarTablaRiesgo === 'function') actualizarTablaRiesgo([]);
        return;
    }
    
    let labels = [];
    let data = [];
    let backgroundColors = [];
    let totalIncidencias = 0;
    let nivelesMap = [];
    
    if (window.nivelesRiesgoEstaticos && window.nivelesRiesgoEstaticos.length > 0) {
        window.nivelesRiesgoEstaticos.forEach(nivel => {
            const cantidad = riesgo[nivel.id] || 0;
            totalIncidencias += cantidad;
            labels.push(nivel.nombre);
            data.push(cantidad);
            backgroundColors.push(nivel.color || '#6c757d');
            nivelesMap.push({ id: nivel.id, nombre: nivel.nombre });
        });
        
        Object.keys(riesgo).forEach(key => {
            if (riesgo[key] > 0 && !window.nivelesRiesgoEstaticos.some(n => n.id === key)) {
                labels.push(key);
                data.push(riesgo[key]);
                backgroundColors.push('#6c757d');
                totalIncidencias += riesgo[key];
                nivelesMap.push({ id: key, nombre: key });
            }
        });
    } else {
        labels = ['Crítico', 'Alto', 'Medio', 'Bajo'];
        data = [riesgo.critico || 0, riesgo.alto || 0, riesgo.medio || 0, riesgo.bajo || 0];
        backgroundColors = [COLORS.critico, COLORS.alto, COLORS.medio, COLORS.bajo];
        totalIncidencias = data.reduce((a, b) => a + b, 0);
        nivelesMap = [
            { id: 'critico', nombre: 'Crítico' },
            { id: 'alto', nombre: 'Alto' },
            { id: 'medio', nombre: 'Medio' },
            { id: 'bajo', nombre: 'Bajo' }
        ];
    }
    
    const filteredLabels = [];
    const filteredData = [];
    const filteredColors = [];
    const filteredNiveles = [];
    const filteredPorcentajes = [];
    
    for (let i = 0; i < labels.length; i++) {
        if (data[i] > 0) {
            filteredLabels.push(labels[i]);
            filteredData.push(data[i]);
            filteredColors.push(backgroundColors[i]);
            filteredNiveles.push(nivelesMap[i]);
            const porcentaje = totalIncidencias > 0 ? ((data[i] / totalIncidencias) * 100).toFixed(1) : 0;
            filteredPorcentajes.push(porcentaje);
        }
    }
    
    if (filteredData.length === 0) {
        mostrarMensajeSinDatosEnCanvas(ctx, canvas, 'Sin datos de riesgo');
        if (typeof actualizarTablaRiesgo === 'function') actualizarTablaRiesgo([]);
        return;
    }
    
    if (charts.riesgo) {
        charts.riesgo.destroy();
    }
    
    charts.riesgo = new Chart(ctx, {
        type: 'bar',
        data: { 
            labels: filteredLabels, 
            datasets: [{ 
                label: 'Incidencias', 
                data: filteredData, 
                backgroundColor: filteredColors,
                borderColor: filteredColors.map(c => c),
                borderWidth: 1,
                borderRadius: 8,
                barPercentage: 0.7,
                categoryPercentage: 0.8
            }] 
        },
        options: { 
            indexAxis: 'y',
            responsive: true, 
            maintainAspectRatio: true,
            onClick: (event, activeElements) => {
                if (activeElements.length > 0) {
                    const index = activeElements[0].index;
                    const nivel = filteredNiveles[index];
                    if (nivel) {
                        const incidencias = datosGraficas.incidenciasFiltradas?.filter(i => i.nivelRiesgo === nivel.id) || [];
                        if (incidencias.length === 0) {
                            Swal.fire({ icon: 'info', title: 'Sin registros', text: `No hay incidencias con nivel de riesgo: ${nivel.nombre}`, background: 'var(--color-bg-primary)', color: 'white' });
                        } else {
                            mostrarRegistrosEnSweet(incidencias, `Incidencias: ${nivel.nombre}`, '<i class="fas fa-exclamation-triangle"></i>');
                        }
                    }
                }
            },
            plugins: { 
                legend: { labels: { color: 'white' }, position: 'top' }, 
                tooltip: { callbacks: { label: (ctx) => { const total = filteredData.reduce((a, b) => a + b, 0); const porcentaje = total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : 0; return `${ctx.dataset.label}: ${ctx.raw} (${porcentaje}%)`; } } }
            },
            scales: { 
                x: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: 'white', stepSize: 1 } }, 
                y: { grid: { display: false }, ticks: { color: 'white', font: { size: 12 } } } 
            } 
        }
    });
    
    const tablaData = filteredLabels.map((label, index) => ({
        nombre: label,
        cantidad: filteredData[index],
        porcentaje: filteredPorcentajes[index],
        color: filteredColors[index]
    }));
    if (typeof actualizarTablaRiesgo === 'function') {
        actualizarTablaRiesgo(tablaData);
    }
}

function crearGraficoCategorias(categorias) {
    const canvas = document.getElementById('graficoCategorias');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!categorias || categorias.length === 0) {
        mostrarMensajeSinDatosEnCanvas(ctx, canvas, 'Sin datos de categorías');
        return;
    }
    
    const colores = categorias.map(c => c.color || '#2f8cff');
    
    charts.categorias = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: categorias.map(c => c.nombre.length > 15 ? c.nombre.substring(0, 12) + '...' : c.nombre),
            datasets: [{ 
                label: 'Incidencias', 
                data: categorias.map(c => c.cantidad), 
                backgroundColor: colores,
                borderRadius: 4 
            }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: true, 
            plugins: { 
                legend: { labels: { color: 'white' } },
                tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.raw}` } }
            }, 
            scales: { 
                y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: 'white', stepSize: 1 } }, 
                x: { grid: { display: false }, ticks: { color: 'white', maxRotation: 45 } } 
            },
            onClick: (event, activeElements) => {
                if (activeElements.length > 0) {
                    const index = activeElements[0].index;
                    const categoria = categorias[index];
                    if (categoria) {
                        const categoriaObj = categoriasCache.find(c => c.nombre === categoria.nombre);
                        if (categoriaObj) {
                            const incidencias = datosGraficas.incidenciasFiltradas?.filter(i => i.categoriaId === categoriaObj.id) || [];
                            if (incidencias.length === 0) {
                                Swal.fire({ icon: 'info', title: 'Sin registros', text: `No hay incidencias en la categoría: ${categoria.nombre}`, background: 'var(--color-bg-primary)', color: 'white' });
                            } else {
                                mostrarRegistrosEnSweet(incidencias, `Incidencias: ${categoria.nombre}`, '<i class="fas fa-tag"></i>');
                            }
                        }
                    }
                }
            }
        }
    });
}

function crearGraficoSucursales(sucursales) {
    const canvas = document.getElementById('graficoSucursales');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!sucursales || sucursales.length === 0) {
        mostrarMensajeSinDatosEnCanvas(ctx, canvas, 'Sin datos de sucursales');
        return;
    }
    
    const colores = sucursales.map(s => s.color || '#6c757d');
    
    charts.sucursales = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: sucursales.map(s => s.nombre.length > 15 ? s.nombre.substring(0, 12) + '...' : s.nombre),
            datasets: [{ 
                label: 'Incidencias', 
                data: sucursales.map(s => s.cantidad), 
                backgroundColor: colores,
                borderRadius: 4 
            }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: true, 
            plugins: { 
                legend: { labels: { color: 'white' } },
                tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.raw}` } }
            }, 
            scales: { 
                y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: 'white', stepSize: 1 } }, 
                x: { grid: { display: false }, ticks: { color: 'white', maxRotation: 45 } } 
            },
            onClick: (event, activeElements) => {
                if (activeElements.length > 0) {
                    const index = activeElements[0].index;
                    const sucursal = sucursales[index];
                    if (sucursal) {
                        const sucursalObj = sucursalesCache.find(s => s.nombre === sucursal.nombre);
                        if (sucursalObj) {
                            const incidencias = datosGraficas.incidenciasFiltradas?.filter(i => i.sucursalId === sucursalObj.id) || [];
                            if (incidencias.length === 0) {
                                Swal.fire({ icon: 'info', title: 'Sin registros', text: `No hay incidencias en la sucursal: ${sucursal.nombre}`, background: 'var(--color-bg-primary)', color: 'white' });
                            } else {
                                mostrarRegistrosEnSweet(incidencias, `Incidencias: ${sucursal.nombre}`, '<i class="fas fa-store"></i>');
                            }
                        }
                    }
                }
            }
        }
    });
}
function crearGraficoTiempoResolucion(tiempos) {
    const canvas = document.getElementById('graficoTiempo');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!tiempos || tiempos.length === 0) {
        mostrarMensajeSinDatosEnCanvas(ctx, canvas, 'Sin datos de tiempo de resolución');
        return;
    }
    const nombres = tiempos.map(t => t.nombre.length > 15 ? t.nombre.substring(0, 12) + '...' : t.nombre);
    const promedios = tiempos.map(t => t.promedio);
    const colores = tiempos.map(t => {
        if (t.promedio <= 24) return COLORS.bajo;
        if (t.promedio <= 72) return COLORS.alto;
        return COLORS.critico;
    });
    charts.tiempo = new Chart(ctx, {
        type: 'bar',
        data: { labels: nombres, datasets: [{ label: 'Horas promedio de resolución', data: promedios, backgroundColor: colores, borderRadius: 4 }] },
        options: { 
            responsive: true, 
            maintainAspectRatio: true, 
            indexAxis: 'y', 
            plugins: { 
                legend: { labels: { color: 'white' } }, 
                tooltip: { callbacks: { label: (ctx) => { const horas = ctx.raw; const dias = Math.floor(horas / 24); const horasResto = horas % 24; let texto = `${horas} horas`; if (dias > 0) texto = `${dias} día${dias > 1 ? 's' : ''} y ${horasResto} horas`; return `${ctx.dataset.label}: ${texto}`; } } } 
            }, 
            scales: { 
                x: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: 'white', stepSize: 24, callback: (value) => value >= 24 ? `${value / 24}d` : `${value}h` } }, 
                y: { grid: { display: false }, ticks: { color: 'white', font: { size: 10 } } } 
            },
            onClick: (event, activeElements) => {
                if (activeElements.length > 0) {
                    const index = activeElements[0].index;
                    const colaborador = tiempos[index];
                    if (colaborador) {
                        const incidencias = datosGraficas.incidenciasFiltradas?.filter(i => i.actualizadoPorNombre === colaborador.nombre && i.estado === 'finalizada') || [];
                        if (incidencias.length === 0) {
                            Swal.fire({ icon: 'info', title: 'Sin registros', text: `No hay incidencias finalizadas por ${colaborador.nombre}`, background: 'var(--color-bg-primary)', color: 'white' });
                        } else {
                            const incidenciasConTiempo = incidencias.map(inc => {
                                const inicio = inc.fechaInicio instanceof Date ? inc.fechaInicio : new Date(inc.fechaInicio);
                                let fechaFin = null;
                                if (inc.fechaFinalizacion) {
                                    fechaFin = inc.fechaFinalizacion instanceof Date ? inc.fechaFinalizacion : new Date(inc.fechaFinalizacion);
                                } else if (inc.fechaActualizacion) {
                                    fechaFin = inc.fechaActualizacion instanceof Date ? inc.fechaActualizacion : new Date(inc.fechaActualizacion);
                                }
                                const tiempoHoras = fechaFin ? Math.round((fechaFin - inicio) / (1000 * 60 * 60)) : 0;
                                return { ...inc, tiempoResolucionHoras: tiempoHoras };
                            }).filter(inc => inc.tiempoResolucionHoras > 0);
                            mostrarRegistrosEnSweet(incidenciasConTiempo, `Incidencias resueltas por: ${colaborador.nombre} (Promedio: ${colaborador.promedio} horas)`, '<i class="fas fa-clock"></i>');
                        }
                    }
                }
            }
        }
    });
}

function mostrarMensajeSinDatosEnCanvas(ctx, canvas, mensaje) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = '14px Arial';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.textAlign = 'center';
    ctx.fillText(mensaje, canvas.width / 2, canvas.height / 2);
}

function renderizarTablaColaboradores(colaboradores) {
    const tbody = document.getElementById('tablaColaboradoresBody');
    if (!tbody) return;
    if (!colaboradores || colaboradores.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:30px;">No hay datos de colaboradores</td</tr>';
        return;
    }
    tbody.innerHTML = colaboradores.slice(0, 10).map(col => {
        const tiempoPromedio = col.incidenciasResueltas > 0 ? Math.round(col.tiempoTotal / col.incidenciasResueltas) : 0;
        const totalActividad = (col.reportados || 0) + (col.actualizados || 0) + (col.seguimientos || 0);
        const maxActividad = colaboradores.length > 0 ? Math.max(...colaboradores.map(c => (c.reportados || 0) + (c.actualizados || 0) + (c.seguimientos || 0))) : 1;
        const eficiencia = Math.min(100, Math.round((totalActividad / maxActividad) * 100));
        let tiempoColor = COLORS.bajo;
        if (tiempoPromedio > 72) tiempoColor = COLORS.critico;
        else if (tiempoPromedio > 24) tiempoColor = COLORS.alto;
        else if (tiempoPromedio > 0) tiempoColor = COLORS.medio;
        return `<tr><td><i class="fas fa-user-circle" style="color: ${COLORS.azul}; margin-right: 8px;"></i> ${escapeHTML(col.nombre)}</td><td><span class="badge-value badge-info">${col.reportados || 0}</span></td><td><span class="badge-value badge-warning">${col.actualizados || 0}</span></td><td><span class="badge-value badge-success">${col.seguimientos || 0}</span></td><td><span class="badge-value" style="background: ${tiempoColor}20; color: ${tiempoColor};">${tiempoPromedio} h</span></td><td><div style="display: flex; align-items: center; gap: 8px;"><div class="eficiencia-bar" style="flex: 1; height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px;"><div class="eficiencia-fill" style="width: ${eficiencia}%; height: 100%; background: linear-gradient(90deg, ${COLORS.verde}, ${COLORS.azul}); border-radius: 3px;"></div></div><span style="color: white; min-width: 40px;">${eficiencia}%</span></div></td></tr>`;
    }).join('');
}

function renderizarTablaCategorias(categorias) {
    const tbody = document.getElementById('tablaCategoriasBody');
    if (!tbody) return;
    if (!categorias || categorias.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2" style="text-align:center; padding:30px;">No hay datos de categorías</td></tr>';
        return;
    }
    tbody.innerHTML = categorias.map(cat => `
        <tr>
            <td>
                <span style="display: inline-block; width: 12px; height: 12px; background: ${cat.color || '#2f8cff'}; border-radius: 3px; margin-right: 8px;"></span>
                ${escapeHTML(cat.nombre)}
            </td>
            <td><span class="badge-value badge-info">${cat.cantidad}</span></td>
        </tr>
    `).join('');
}

function cargarFiltroColaboradores(colaboradores) {
    const selectColab = document.getElementById('filtroColaborador');
    if (!selectColab) return;
    if (!colaboradores || colaboradores.length === 0) {
        selectColab.innerHTML = '<option value="todos">Todos los colaboradores</option>';
        return;
    }
    const opciones = ['<option value="todos">Todos los colaboradores</option>'];
    colaboradores.slice(0, 20).forEach(col => {
        opciones.push(`<option value="${escapeHTML(col.nombre)}">${escapeHTML(col.nombre)}</option>`);
    });
    selectColab.innerHTML = opciones.join('');
}

// Funciones para alertas de incidencias
function mostrarAlertActualizadores() { mostrarRegistrosPorCriterio('topActualizadores', 'actualizadoPorNombre', 'Incidencias actualizadas por'); }
function mostrarAlertReportadores() { mostrarRegistrosPorCriterio('topReportadores', 'creadoPorNombre', 'Incidencias reportadas por'); }
function mostrarAlertSeguimientos() { mostrarRegistrosPorCriterio('topSeguimientos', 'seguimiento', 'Incidencias con seguimiento de'); }
function mostrarAlertEstado() { mostrarRegistrosPorEstado(); }
function mostrarAlertRiesgo() { mostrarRegistrosPorRiesgo(); }
function mostrarAlertCategorias() { mostrarRegistrosPorCategoria(); }
function mostrarAlertSucursales() { mostrarRegistrosPorSucursal(); }
function mostrarAlertTiempoResolucion() { mostrarRegistrosPorTiempo(); }

function mostrarRegistrosPorCriterio(criterioKey, campo, tituloBase) {
    const data = datosGraficas[criterioKey];
    if (!data || data.length === 0) {
        Swal.fire({ icon: 'info', title: 'Sin datos', text: 'No hay información para mostrar', background: 'var(--color-bg-primary)', color: 'white' });
        return;
    }
    const colaborador = data[0];
    let incidencias = [];
    if (campo === 'seguimiento') {
        incidencias = datosGraficas.incidenciasFiltradas?.filter(i => i.seguimiento && Object.values(i.seguimiento).some(seg => seg.usuarioNombre === colaborador.nombre)) || [];
    } else {
        incidencias = datosGraficas.incidenciasFiltradas?.filter(i => i[campo] === colaborador.nombre) || [];
    }
    if (incidencias.length === 0) {
        Swal.fire({ icon: 'info', title: 'Sin registros', text: `No hay incidencias para ${colaborador.nombre}`, background: 'var(--color-bg-primary)', color: 'white' });
        return;
    }
    mostrarRegistrosEnSweet(incidencias, `${tituloBase} ${colaborador.nombre}`, `<i class="fas fa-chart-simple"></i>`);
}

function mostrarRegistrosPorEstado() {
    const pendientes = datosGraficas.incidenciasFiltradas?.filter(i => i.estado === 'pendiente') || [];
    const finalizadas = datosGraficas.incidenciasFiltradas?.filter(i => i.estado === 'finalizada') || [];
    if (pendientes.length > 0) mostrarRegistrosEnSweet(pendientes, 'Incidencias Pendientes', '<i class="fas fa-clock"></i>');
    else if (finalizadas.length > 0) mostrarRegistrosEnSweet(finalizadas, 'Incidencias Finalizadas', '<i class="fas fa-check-circle"></i>');
    else Swal.fire({ icon: 'info', title: 'Sin datos', text: 'No hay incidencias para mostrar', background: 'var(--color-bg-primary)', color: 'white' });
}

function mostrarRegistrosPorRiesgo() {
    // Obtener el primer nivel de riesgo que tenga datos (para mostrar el top 1)
    const riesgoData = datosGraficas.riesgoData;
    
    if (!riesgoData || Object.keys(riesgoData).length === 0) {
        Swal.fire({ icon: 'info', title: 'Sin datos', text: 'No hay información de niveles de riesgo', background: 'var(--color-bg-primary)', color: 'white' });
        return;
    }
    
    // Encontrar el nivel de riesgo con mayor cantidad de incidencias
    let topRiesgoId = null;
    let topCantidad = 0;
    
    Object.keys(riesgoData).forEach(riesgoId => {
        const cantidad = riesgoData[riesgoId];
        if (cantidad > topCantidad) {
            topCantidad = cantidad;
            topRiesgoId = riesgoId;
        }
    });
    
    if (!topRiesgoId || topCantidad === 0) {
        Swal.fire({ icon: 'info', title: 'Sin datos', text: 'No hay incidencias con niveles de riesgo', background: 'var(--color-bg-primary)', color: 'white' });
        return;
    }
    
    // Obtener el nombre del nivel de riesgo
    let riesgoNombre = topRiesgoId;
    let riesgoIcon = '<i class="fas fa-exclamation-triangle"></i>';
    
    if (window.nivelesRiesgoEstaticos) {
        const nivel = window.nivelesRiesgoEstaticos.find(n => n.id === topRiesgoId);
        if (nivel) {
            riesgoNombre = nivel.nombre;
        }
    }
    
    // Filtrar incidencias por ese nivel de riesgo
    const incidenciasRiesgo = datosGraficas.incidenciasFiltradas?.filter(i => i.nivelRiesgo === topRiesgoId) || [];
    
    if (incidenciasRiesgo.length === 0) {
        Swal.fire({ icon: 'info', title: 'Sin registros', text: `No hay incidencias con nivel de riesgo ${riesgoNombre}`, background: 'var(--color-bg-primary)', color: 'white' });
        return;
    }
    
    mostrarRegistrosEnSweet(incidenciasRiesgo, `Incidencias: ${riesgoNombre}`, riesgoIcon);
}

function mostrarRegistrosPorCategoria() {
    const data = datosGraficas.categoriasData;
    if (!data || data.length === 0) { Swal.fire({ icon: 'info', title: 'Sin datos', text: 'No hay información de categorías', background: 'var(--color-bg-primary)', color: 'white' }); return; }
    const categoriaNombre = data[0].nombre;
    const categoria = categoriasCache.find(c => c.nombre === categoriaNombre);
    if (!categoria) { Swal.fire({ icon: 'error', title: 'Error', text: 'No se encontró la categoría', background: 'var(--color-bg-primary)', color: 'white' }); return; }
    const incidencias = datosGraficas.incidenciasFiltradas?.filter(i => i.categoriaId === categoria.id) || [];
    if (incidencias.length === 0) { Swal.fire({ icon: 'info', title: 'Sin registros', text: `No hay incidencias en la categoría ${categoriaNombre}`, background: 'var(--color-bg-primary)', color: 'white' }); return; }
    mostrarRegistrosEnSweet(incidencias, `Incidencias: ${categoriaNombre} (Top 1)`, '<i class="fas fa-tag"></i>');
}

function mostrarRegistrosPorSucursal() {
    const data = datosGraficas.sucursalesData;
    if (!data || data.length === 0) { Swal.fire({ icon: 'info', title: 'Sin datos', text: 'No hay información de sucursales', background: 'var(--color-bg-primary)', color: 'white' }); return; }
    const sucursalNombre = data[0].nombre;
    const sucursal = sucursalesCache.find(s => s.nombre === sucursalNombre);
    if (!sucursal) { Swal.fire({ icon: 'error', title: 'Error', text: 'No se encontró la sucursal', background: 'var(--color-bg-primary)', color: 'white' }); return; }
    const incidencias = datosGraficas.incidenciasFiltradas?.filter(i => i.sucursalId === sucursal.id) || [];
    if (incidencias.length === 0) { Swal.fire({ icon: 'info', title: 'Sin registros', text: `No hay incidencias en la sucursal ${sucursalNombre}`, background: 'var(--color-bg-primary)', color: 'white' }); return; }
    mostrarRegistrosEnSweet(incidencias, `Incidencias: ${sucursalNombre} (Top 1)`, '<i class="fas fa-store"></i>');
}

function mostrarRegistrosPorTiempo() {
    const data = datosGraficas.tiemposPromedio;
    if (!data || data.length === 0) {
        Swal.fire({ 
            icon: 'info', 
            title: 'Sin datos', 
            text: 'No hay información de tiempos de resolución.\n\nNota: Solo se muestran incidencias FINALIZADAS que tienen fecha de inicio y fecha de finalización/actualización.', 
            background: 'var(--color-bg-primary)', 
            color: 'white' 
        });
        return;
    }
    
    const colaborador = data[0];
    
    // Filtrar incidencias finalizadas actualizadas por este colaborador
    const incidencias = datosGraficas.incidenciasFiltradas?.filter(i => 
        i.actualizadoPorNombre === colaborador.nombre && 
        i.estado === 'finalizada'
    ) || [];
    
    if (incidencias.length === 0) {
        Swal.fire({ 
            icon: 'info', 
            title: 'Sin registros', 
            text: `No hay incidencias finalizadas actualizadas por ${colaborador.nombre}`, 
            background: 'var(--color-bg-primary)', 
            color: 'white' 
        });
        return;
    }
    
    // Calcular tiempos individuales para mostrar en el detalle
    const incidenciasConTiempo = incidencias.map(inc => {
        const inicio = inc.fechaInicio instanceof Date ? inc.fechaInicio : new Date(inc.fechaInicio);
        let fechaFin = null;
        
        if (inc.fechaFinalizacion) {
            fechaFin = inc.fechaFinalizacion instanceof Date ? inc.fechaFinalizacion : new Date(inc.fechaFinalizacion);
        } else if (inc.fechaActualizacion) {
            fechaFin = inc.fechaActualizacion instanceof Date ? inc.fechaActualizacion : new Date(inc.fechaActualizacion);
        }
        
        const tiempoHoras = fechaFin ? Math.round((fechaFin - inicio) / (1000 * 60 * 60)) : 0;
        return { ...inc, tiempoResolucionHoras: tiempoHoras };
    }).filter(inc => inc.tiempoResolucionHoras > 0);
    
    mostrarRegistrosEnSweet(
        incidenciasConTiempo, 
        `Incidencias resueltas por ${colaborador.nombre} (Promedio: ${colaborador.promedio} horas)`, 
        `<i class="fas fa-clock"></i>`
    );
}

function configurarKpiCardsClickeables() {
    const criticasCard = document.querySelector('.metric-card.criticas');
    if (criticasCard) {
        criticasCard.style.cursor = 'pointer';
        criticasCard.addEventListener('click', () => {
            const incidenciasCriticas = datosGraficas.incidenciasFiltradas?.filter(i => i.nivelRiesgo === 'critico') || [];
            if (incidenciasCriticas.length === 0) Swal.fire({ icon: 'info', title: 'Sin registros', text: 'No hay incidencias críticas', background: 'var(--color-bg-primary)', color: 'white' });
            else mostrarRegistrosEnSweet(incidenciasCriticas, 'Incidencias Críticas', '<i class="fas fa-exclamation-triangle"></i>');
        });
    }
    const altasCard = document.querySelector('.metric-card.altas');
    if (altasCard) {
        altasCard.style.cursor = 'pointer';
        altasCard.addEventListener('click', () => {
            const incidenciasAltas = datosGraficas.incidenciasFiltradas?.filter(i => i.nivelRiesgo === 'alto') || [];
            if (incidenciasAltas.length === 0) Swal.fire({ icon: 'info', title: 'Sin registros', text: 'No hay incidencias altas', background: 'var(--color-bg-primary)', color: 'white' });
            else mostrarRegistrosEnSweet(incidenciasAltas, 'Incidencias Altas', '<i class="fas fa-exclamation-circle"></i>');
        });
    }
    const pendientesCard = document.querySelector('.metric-card.pendientes');
    if (pendientesCard) {
        pendientesCard.style.cursor = 'pointer';
        pendientesCard.addEventListener('click', () => {
            const incidenciasPendientes = datosGraficas.incidenciasFiltradas?.filter(i => i.estado === 'pendiente') || [];
            if (incidenciasPendientes.length === 0) Swal.fire({ icon: 'info', title: 'Sin registros', text: 'No hay incidencias pendientes', background: 'var(--color-bg-primary)', color: 'white' });
            else mostrarRegistrosEnSweet(incidenciasPendientes, 'Incidencias Pendientes', '<i class="fas fa-clock"></i>');
        });
    }
    const totalCard = document.querySelector('.metric-card.total');
    if (totalCard) {
        totalCard.style.cursor = 'pointer';
        totalCard.addEventListener('click', () => {
            const incidencias = datosGraficas.incidenciasFiltradas || [];
            if (incidencias.length === 0) Swal.fire({ icon: 'info', title: 'Sin registros', text: 'No hay incidencias', background: 'var(--color-bg-primary)', color: 'white' });
            else mostrarRegistrosEnSweet(incidencias, 'Todas las Incidencias', '<i class="fas fa-chart-bar"></i>');
        });
    }
}

function mostrarRegistrosEnSweet(incidencias, titulo, icono) {
    if (!incidencias || incidencias.length === 0) {
        Swal.fire({ icon: 'info', title: 'Sin registros', text: 'No hay incidencias para mostrar', background: 'var(--color-bg-primary)', color: 'white' });
        return;
    }
    const totalCriticas = incidencias.filter(i => i.nivelRiesgo === 'critico').length;
    const totalAltas = incidencias.filter(i => i.nivelRiesgo === 'alto').length;
    const totalPendientes = incidencias.filter(i => i.estado === 'pendiente').length;
    const totalFinalizadas = incidencias.filter(i => i.estado === 'finalizada').length;
    const incidenciasMostrar = incidencias.slice(0, 15);
    const hayMas = incidencias.length > 15;
    let registrosHtml = `<div class="swal-resumen-stats"><div class="swal-stats-grid"><div class="swal-stat-item" style="border-left-color: #8b5cf6;"><span class="swal-stat-label">Total incidencias</span><span class="swal-stat-value">${incidencias.length}</span></div><div class="swal-stat-item" style="border-left-color: #ef4444;"><span class="swal-stat-label">Críticas + Altas</span><span class="swal-stat-value" style="color: #ef4444;">${totalCriticas + totalAltas}</span></div><div class="swal-stat-item" style="border-left-color: #f59e0b;"><span class="swal-stat-label">Pendientes</span><span class="swal-stat-value" style="color: #f59e0b;">${totalPendientes}</span></div><div class="swal-stat-item" style="border-left-color: #10b981;"><span class="swal-stat-label">Finalizadas</span><span class="swal-stat-value" style="color: #10b981;">${totalFinalizadas}</span></div></div></div><div class="swal-registros-list">`;
    incidenciasMostrar.forEach(inc => {
        const fecha = inc.fechaInicio instanceof Date ? inc.fechaInicio.toLocaleDateString('es-MX') : (inc.fechaInicio ? new Date(inc.fechaInicio).toLocaleDateString('es-MX') : 'N/A');
        let estadoColor = '#6c757d', estadoIcon = 'fa-circle';
        if (inc.estado === 'finalizada') { estadoColor = '#10b981'; estadoIcon = 'fa-check-circle'; }
        else if (inc.estado === 'pendiente') { estadoColor = '#f59e0b'; estadoIcon = 'fa-clock'; }
        let riesgoColor = '#6c757d', riesgoIcon = 'fa-chart-line', riesgoTexto = inc.nivelRiesgo ? inc.nivelRiesgo.charAt(0).toUpperCase() + inc.nivelRiesgo.slice(1) : 'N/A';
        if (inc.nivelRiesgo === 'critico') { riesgoColor = '#ef4444'; riesgoIcon = 'fa-exclamation-triangle'; }
        else if (inc.nivelRiesgo === 'alto') { riesgoColor = '#f97316'; riesgoIcon = 'fa-exclamation-circle'; }
        else if (inc.nivelRiesgo === 'medio') { riesgoColor = '#eab308'; riesgoIcon = 'fa-chart-simple'; }
        else if (inc.nivelRiesgo === 'bajo') { riesgoColor = '#10b981'; riesgoIcon = 'fa-check'; }
        const detalles = inc.detalles ? (inc.detalles.length > 80 ? inc.detalles.substring(0, 80) + '...' : inc.detalles) : 'Sin detalles';
        registrosHtml += `<div class="swal-registro-card" data-incidencia-id="${inc.id}"><div class="swal-card-header"><span class="swal-id"><i class="fas fa-hashtag"></i> ${escapeHTML(inc.id.substring(0, 12))}...</span><span class="swal-fecha"><i class="fas fa-calendar-alt"></i> ${fecha}</span></div><div class="swal-card-body"><div class="swal-info-principal"><div class="swal-sucursal"><i class="fas fa-store"></i> ${escapeHTML(obtenerNombreSucursal(inc.sucursalId) || 'Sin asignar')}</div><div class="swal-tipo-evento"><i class="fas ${riesgoIcon}" style="color: ${riesgoColor};"></i> ${riesgoTexto}<span class="swal-estado-badge" style="margin-left: 8px; color: ${estadoColor};"><i class="fas ${estadoIcon}"></i> ${inc.estado ? inc.estado.charAt(0).toUpperCase() + inc.estado.slice(1) : 'N/A'}</span></div></div><div class="swal-montos"><span class="swal-monto-perdido"><i class="fas fa-user"></i> ${escapeHTML(inc.creadoPorNombre || 'N/A')}</span>${inc.actualizadoPorNombre ? `<span class="swal-monto-recuperado"><i class="fas fa-edit"></i> ${escapeHTML(inc.actualizadoPorNombre)}</span>` : ''}</div></div><div class="swal-card-footer"><div class="swal-narracion"><i class="fas fa-file-alt"></i><span>${escapeHTML(detalles)}</span></div></div></div>`;
    });
    if (hayMas) registrosHtml += `<div class="swal-mas-registros"><i class="fas fa-ellipsis-h"></i> y ${incidencias.length - 15} incidencias más.</div>`;
    registrosHtml += `</div>`;
    Swal.fire({ title: `${icono || ''} ${titulo}`, html: registrosHtml, width: '880px', background: 'transparent', showConfirmButton: true, confirmButtonText: '<i class="fas fa-check"></i> Cerrar', confirmButtonColor: '#28a745', customClass: { popup: 'swal2-popup-custom', title: 'swal2-title-custom', confirmButton: 'swal2-confirm' }, backdrop: `rgba(0,0,0,0.8) left top no-repeat` });
}

// =============================================
// FUNCIONES DE RECUPERACIÓN - COMPLETAS Y FUNCIONALES
// =============================================

function calcularEstadisticasRecuperacion(registros) {
    if (!registros || registros.length === 0) {
        return { totalPerdido: 0, totalRecuperado: 0, totalNeto: 0, porcentajeRecuperacion: 0, totalEventos: 0, promedioPerdida: 0 };
    }
    let totalPerdido = 0, totalRecuperado = 0;
    registros.forEach(r => { totalPerdido += r.montoPerdido || 0; totalRecuperado += r.montoRecuperado || 0; });
    const totalNeto = totalPerdido - totalRecuperado;
    const porcentajeRecuperacion = totalPerdido > 0 ? (totalRecuperado / totalPerdido) * 100 : 0;
    const promedioPerdida = registros.length > 0 ? totalPerdido / registros.length : 0;
    return { totalPerdido, totalRecuperado, totalNeto, porcentajeRecuperacion, totalEventos: registros.length, promedioPerdida };
}

function mostrarKPIsRecuperacion(estadisticas) {
    const formatter = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 });
    setElementText('totalPerdidas', formatter.format(estadisticas.totalPerdido));
    setElementText('totalRecuperado', formatter.format(estadisticas.totalRecuperado));
    setElementText('totalNeto', formatter.format(estadisticas.totalNeto));
    setElementText('porcentajeRecuperacion', `${estadisticas.porcentajeRecuperacion.toFixed(2)}%`);
    setElementText('totalEventosRecuperacion', estadisticas.totalEventos);
    setElementText('promedioPerdida', formatter.format(estadisticas.promedioPerdida));
    setTimeout(() => configurarKpiCardsRecuperacionClickeables(), 100);
}

function configurarKpiCardsRecuperacionClickeables() {
    const totalPerdidoCard = document.querySelector('#kpisRecuperacionContainer .kpi-card:first-child');
    if (totalPerdidoCard) {
        totalPerdidoCard.style.cursor = 'pointer';
        totalPerdidoCard.addEventListener('click', () => {
            const registrosConPerdida = datosActualesRecuperacion.registros.filter(r => (r.montoPerdido || 0) > 0);
            if (registrosConPerdida.length === 0) {
                Swal.fire({ icon: 'info', title: 'Sin registros', text: 'No hay registros con pérdidas', background: 'var(--color-bg-primary)', color: 'white' });
                return;
            }
            mostrarRegistrosRecuperacionEnSweet(registrosConPerdida, 'Registros con pérdidas', '<i class="fas fa-box-open"></i> Total perdido');
        });
    }
    const totalRecuperadoCard = document.querySelector('#kpisRecuperacionContainer .kpi-card:nth-child(2)');
    if (totalRecuperadoCard) {
        totalRecuperadoCard.style.cursor = 'pointer';
        totalRecuperadoCard.addEventListener('click', () => {
            const registrosConRecuperacion = datosActualesRecuperacion.registros.filter(r => (r.montoRecuperado || 0) > 0);
            if (registrosConRecuperacion.length === 0) {
                Swal.fire({ icon: 'info', title: 'Sin registros', text: 'No hay registros con recuperaciones', background: 'var(--color-bg-primary)', color: 'white' });
                return;
            }
            mostrarRegistrosRecuperacionEnSweet(registrosConRecuperacion, 'Registros con recuperaciones', '<i class="fas fa-undo-alt"></i> Total recuperado');
        });
    }
    const totalNetoCard = document.querySelector('#kpisRecuperacionContainer .kpi-card:nth-child(3)');
    if (totalNetoCard) {
        totalNetoCard.style.cursor = 'pointer';
        totalNetoCard.addEventListener('click', () => {
            const registrosConPerdidaNeta = datosActualesRecuperacion.registros.filter(r => (r.montoPerdido - (r.montoRecuperado || 0)) > 0);
            if (registrosConPerdidaNeta.length === 0) {
                Swal.fire({ icon: 'info', title: 'Sin registros', text: 'No hay registros con pérdida neta', background: 'var(--color-bg-primary)', color: 'white' });
                return;
            }
            mostrarRegistrosRecuperacionEnSweet(registrosConPerdidaNeta, 'Registros con pérdida neta', '<i class="fas fa-chart-line"></i> Pérdida neta');
        });
    }
    const porcentajeCard = document.querySelector('#kpisRecuperacionContainer .kpi-card:nth-child(4)');
    if (porcentajeCard) {
        porcentajeCard.style.cursor = 'pointer';
        porcentajeCard.addEventListener('click', () => {
            const tasaRecuperacion = datosActualesRecuperacion.estadisticas?.porcentajeRecuperacion || 0;
            const totalPerdido = datosActualesRecuperacion.estadisticas?.totalPerdido || 0;
            const totalRecuperado = datosActualesRecuperacion.estadisticas?.totalRecuperado || 0;
            const formatter = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
            Swal.fire({
                title: '<i class="fas fa-percent"></i> Detalle de tasa de recuperación',
                html: `<div style="text-align: left;"><div style="background: rgba(0,0,0,0.4); border-radius: 16px; padding: 16px; margin-bottom: 16px;"><div style="display: flex; justify-content: space-between; margin-bottom: 12px;"><span style="color: #9ca3af;">Total perdido:</span><span style="color: #ef4444; font-weight: 700;">${formatter.format(totalPerdido)}</span></div><div style="display: flex; justify-content: space-between; margin-bottom: 12px;"><span style="color: #9ca3af;">Total recuperado:</span><span style="color: #10b981; font-weight: 700;">${formatter.format(totalRecuperado)}</span></div><div class="progress-bar-container" style="background: rgba(255,255,255,0.1); border-radius: 10px; height: 12px; margin: 16px 0 8px 0;"><div class="progress-bar-fill" style="width: ${tasaRecuperacion}%; background: linear-gradient(90deg, #10b981, #34d399); border-radius: 10px; height: 100%;"></div></div><div style="text-align: center; margin-top: 12px;"><span style="font-size: 1.5rem; font-weight: 700; color: #3b82f6;">${tasaRecuperacion.toFixed(2)}%</span><span style="color: #9ca3af; margin-left: 8px;">de recuperación</span></div></div><div style="background: rgba(0,0,0,0.3); border-radius: 16px; padding: 12px;"><div style="font-size: 0.7rem; color: #9ca3af; text-align: center;"><i class="fas fa-chart-line"></i> Por cada $100 perdidos, se han recuperado $${tasaRecuperacion.toFixed(2)}</div></div></div>`,
                icon: 'info', confirmButtonText: '<i class="fas fa-check"></i> Entendido', background: 'var(--color-bg-primary)', color: 'white', customClass: { popup: 'swal2-popup-custom' }
            });
        });
    }
    const totalEventosCard = document.querySelector('#kpisRecuperacionContainer .kpi-card:nth-child(5)');
    if (totalEventosCard) {
        totalEventosCard.style.cursor = 'pointer';
        totalEventosCard.addEventListener('click', () => {
            const registros = datosActualesRecuperacion.registros;
            if (registros.length === 0) {
                Swal.fire({ icon: 'info', title: 'Sin registros', text: 'No hay eventos registrados', background: 'var(--color-bg-primary)', color: 'white' });
                return;
            }
            mostrarRegistrosRecuperacionEnSweet(registros, 'Todos los eventos', '<i class="fas fa-calendar-week"></i> Total eventos');
        });
    }
    const promedioCard = document.querySelector('#kpisRecuperacionContainer .kpi-card:nth-child(6)');
    if (promedioCard) {
        promedioCard.style.cursor = 'pointer';
        promedioCard.addEventListener('click', () => {
            const promedio = datosActualesRecuperacion.estadisticas?.promedioPerdida || 0;
            const totalEventos = datosActualesRecuperacion.estadisticas?.totalEventos || 0;
            const totalPerdido = datosActualesRecuperacion.estadisticas?.totalPerdido || 0;
            const registrosSobrePromedio = datosActualesRecuperacion.registros.filter(r => (r.montoPerdido || 0) > promedio);
            const registrosBajoPromedio = datosActualesRecuperacion.registros.filter(r => (r.montoPerdido || 0) <= promedio && (r.montoPerdido || 0) > 0);
            const formatter = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
            Swal.fire({
                title: '<i class="fas fa-chart-line"></i> Detalle del promedio por evento',
                html: `<div style="text-align: left;"><div style="background: rgba(0,0,0,0.4); border-radius: 16px; padding: 16px; margin-bottom: 16px;"><div style="display: flex; justify-content: space-between; margin-bottom: 12px;"><span style="color: #9ca3af;">Total eventos:</span><span style="color: #3b82f6; font-weight: 700;">${totalEventos}</span></div><div style="display: flex; justify-content: space-between; margin-bottom: 12px;"><span style="color: #9ca3af;">Total perdido:</span><span style="color: #ef4444; font-weight: 700;">${formatter.format(totalPerdido)}</span></div><div style="display: flex; justify-content: space-between; margin-bottom: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.1);"><span style="color: #9ca3af;">Promedio por evento:</span><span style="color: #f59e0b; font-weight: 700; font-size: 1.1rem;">${formatter.format(promedio)}</span></div></div><div style="display: flex; gap: 12px; margin-bottom: 16px;"><div style="flex: 1; background: rgba(239, 68, 68, 0.1); border-radius: 12px; padding: 12px; text-align: center; cursor: pointer;" onclick="window.verRegistrosSobrePromedioRecuperacion()"><div style="font-size: 1.2rem; font-weight: 700; color: #ef4444;">${registrosSobrePromedio.length}</div><div style="font-size: 0.65rem; color: #9ca3af;">Eventos sobre el promedio</div><div style="font-size: 0.7rem; color: #ef4444; margin-top: 4px;"><i class="fas fa-arrow-up"></i> Click para ver</div></div><div style="flex: 1; background: rgba(16, 185, 129, 0.1); border-radius: 12px; padding: 12px; text-align: center; cursor: pointer;" onclick="window.verRegistrosBajoPromedioRecuperacion()"><div style="font-size: 1.2rem; font-weight: 700; color: #10b981;">${registrosBajoPromedio.length}</div><div style="font-size: 0.65rem; color: #9ca3af;">Eventos bajo el promedio</div><div style="font-size: 0.7rem; color: #10b981; margin-top: 4px;"><i class="fas fa-arrow-down"></i> Click para ver</div></div></div><div style="background: rgba(0,0,0,0.3); border-radius: 16px; padding: 12px;"><div style="font-size: 0.7rem; color: #9ca3af; text-align: center;"><i class="fas fa-calculator"></i> El promedio se calcula dividiendo el total perdido entre el número total de eventos</div></div></div>`,
                confirmButtonText: '<i class="fas fa-check"></i> Cerrar', background: 'var(--color-bg-primary)', color: 'white', customClass: { popup: 'swal2-popup-custom' }
            });
        });
    }
}

window.verRegistrosSobrePromedioRecuperacion = function() {
    const promedio = datosActualesRecuperacion.estadisticas?.promedioPerdida || 0;
    const registrosSobrePromedio = datosActualesRecuperacion.registros.filter(r => (r.montoPerdido || 0) > promedio);
    if (registrosSobrePromedio.length > 0) {
        Swal.close();
        setTimeout(() => mostrarRegistrosRecuperacionEnSweet(registrosSobrePromedio, 'Eventos sobre el promedio', '<i class="fas fa-arrow-up"></i> Sobre el promedio'), 100);
    }
};

window.verRegistrosBajoPromedioRecuperacion = function() {
    const promedio = datosActualesRecuperacion.estadisticas?.promedioPerdida || 0;
    const registrosBajoPromedio = datosActualesRecuperacion.registros.filter(r => (r.montoPerdido || 0) <= promedio && (r.montoPerdido || 0) > 0);
    if (registrosBajoPromedio.length > 0) {
        Swal.close();
        setTimeout(() => mostrarRegistrosRecuperacionEnSweet(registrosBajoPromedio, 'Eventos bajo el promedio', '<i class="fas fa-arrow-down"></i> Bajo el promedio'), 100);
    }
};

function actualizarGraficasRecuperacion(registros, estadisticas) {
    if (!registros || registros.length === 0) {
        actualizarGraficaVaciaRecuperacion();
        return;
    }
    actualizarGraficoTipoEvento(registros);
    actualizarGraficoEvolucionMensual(registros);
    actualizarGraficoTopSucursales(registros);
    actualizarGraficoComparativaRecuperacion(estadisticas);
}

function actualizarGraficoTipoEvento(registros) {
    const tipos = { 'robo': 0, 'extravio': 0, 'accidente': 0, 'otro': 0 };
    window.registrosPorTipo = { 'robo': [], 'extravio': [], 'accidente': [], 'otro': [] };
    const nombresTipos = { 'robo': 'Robo', 'extravio': 'Extravío', 'accidente': 'Accidente', 'otro': 'Otro' };
    const colores = { 'robo': COLORS_REC.rojo, 'extravio': COLORS_REC.naranja, 'accidente': COLORS_REC.azul, 'otro': COLORS_REC.morado };

    registros.forEach(r => {
        const tipo = r.tipoEvento || 'otro';
        tipos[tipo] = (tipos[tipo] || 0) + (r.montoPerdido || 0);
        window.registrosPorTipo[tipo].push(r);
    });

    const canvas = document.getElementById('graficoTipoEvento');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const labels = Object.keys(tipos).map(k => nombresTipos[k] || k);
    const data = Object.values(tipos);
    const backgroundColors = Object.keys(tipos).map(k => colores[k] || COLORS_REC.gris);

    if (graficoTipoEvento) {
        graficoTipoEvento.data.labels = labels;
        graficoTipoEvento.data.datasets[0].data = data;
        graficoTipoEvento.data.datasets[0].backgroundColor = backgroundColors;
        graficoTipoEvento.update();
    } else {
        graficoTipoEvento = new Chart(ctx, {
            type: 'doughnut',
            data: { labels: labels, datasets: [{ data: data, backgroundColor: backgroundColors, borderWidth: 0, hoverOffset: 15, cutout: '65%' }] },
            options: {
                responsive: true, maintainAspectRatio: true,
                onClick: (event, activeElements) => {
                    if (activeElements.length > 0) {
                        const index = activeElements[0].index;
                        const tipoKey = Object.keys(tipos)[index];
                        const tipoNombre = nombresTipos[tipoKey];
                        const registrosTipo = window.registrosPorTipo[tipoKey] || [];
                        if (registrosTipo.length === 0) {
                            Swal.fire({ icon: 'info', title: 'Sin registros', text: `No hay registros de tipo ${tipoNombre}`, background: 'var(--color-bg-primary)', color: 'white' });
                            return;
                        }
                        mostrarRegistrosRecuperacionEnSweet(registrosTipo, `Registros de tipo: ${tipoNombre}`, `<i class="fas fa-tag"></i> ${tipoNombre}`);
                    }
                },
                plugins: {
                    legend: { labels: { color: 'white', font: { size: 11 } }, position: 'bottom' },
                    tooltip: { callbacks: { label: (ctx) => { const total = ctx.dataset.data.reduce((a, b) => a + b, 0); const pct = total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : 0; const formatter = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }); return `${ctx.label}: ${formatter.format(ctx.raw)} (${pct}%)`; } }, backgroundColor: 'rgba(0,0,0,0.8)', titleColor: '#fff', bodyColor: '#ddd' }
                }
            }
        });
    }
}

function actualizarGraficoEvolucionMensual(registros) {
    const meses = {};
    const mesesNombres = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    window.registrosPorMes = {};

    registros.forEach(r => {
        if (r.fecha) {
            const fecha = new Date(r.fecha);
            const mesKey = `${fecha.getFullYear()}-${fecha.getMonth() + 1}`;
            const mesNombre = `${mesesNombres[fecha.getMonth()]} ${fecha.getFullYear()}`;
            if (!meses[mesKey]) {
                meses[mesKey] = { nombre: mesNombre, perdido: 0, recuperado: 0 };
                window.registrosPorMes[mesKey] = [];
            }
            meses[mesKey].perdido += r.montoPerdido || 0;
            meses[mesKey].recuperado += r.montoRecuperado || 0;
            window.registrosPorMes[mesKey].push(r);
        }
    });

    const mesesOrdenados = Object.keys(meses).sort();
    const labels = mesesOrdenados.map(m => meses[m].nombre);
    const perdidosData = mesesOrdenados.map(m => meses[m].perdido);
    const recuperadosData = mesesOrdenados.map(m => meses[m].recuperado);
    const canvas = document.getElementById('graficoEvolucionMensual');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (graficoEvolucionMensual) {
        graficoEvolucionMensual.data.labels = labels;
        graficoEvolucionMensual.data.datasets[0].data = perdidosData;
        graficoEvolucionMensual.data.datasets[1].data = recuperadosData;
        graficoEvolucionMensual.update();
    } else {
        graficoEvolucionMensual = new Chart(ctx, {
            type: 'line',
            data: { labels: labels, datasets: [{ label: 'Pérdidas', data: perdidosData, borderColor: COLORS_REC.rojo, backgroundColor: COLORS_REC.rojoClaro, tension: 0.4, fill: true, pointBackgroundColor: COLORS_REC.rojo, pointBorderColor: '#fff', pointRadius: 5, pointHoverRadius: 8, borderWidth: 2 }, { label: 'Recuperaciones', data: recuperadosData, borderColor: COLORS_REC.verde, backgroundColor: COLORS_REC.verdeClaro, tension: 0.4, fill: true, pointBackgroundColor: COLORS_REC.verde, pointBorderColor: '#fff', pointRadius: 5, pointHoverRadius: 8, borderWidth: 2 }] },
            options: {
                responsive: true, maintainAspectRatio: true,
                onClick: (event, activeElements) => {
                    if (activeElements.length > 0) {
                        const index = activeElements[0].index;
                        const mesKey = mesesOrdenados[index];
                        const registrosMes = window.registrosPorMes[mesKey] || [];
                        const mesNombre = meses[mesKey]?.nombre || 'Mes desconocido';
                        if (registrosMes.length === 0) {
                            Swal.fire({ icon: 'info', title: 'Sin registros', text: `No hay registros para ${mesNombre}`, background: 'var(--color-bg-primary)', color: 'white' });
                            return;
                        }
                        mostrarRegistrosRecuperacionEnSweet(registrosMes, `Registros de ${mesNombre}`, `<i class="fas fa-calendar-alt"></i> ${mesNombre}`);
                    }
                },
                plugins: { legend: { labels: { color: 'white', font: { size: 11 } } }, tooltip: { callbacks: { label: (ctx) => { const formatter = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }); return `${ctx.dataset.label}: ${formatter.format(ctx.raw)}`; } } } },
                scales: { y: { ticks: { callback: (value) => { const formatter = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', notation: 'compact' }); return formatter.format(value); }, color: '#aaa' }, grid: { color: 'rgba(255,255,255,0.05)' } }, x: { ticks: { color: '#aaa', maxRotation: 45, minRotation: 45, autoSkip: true }, grid: { display: false } } }
            }
        });
    }
}

function actualizarGraficoTopSucursales(registros) {
    const sucursalesMap = {};
    window.registrosPorSucursal = {};
    
// Obtener colores de regiones para cada sucursal
const sucursalesColores = new Map();
if (sucursalesCache && sucursalesCache.length > 0) {
    for (const suc of sucursalesCache) {
        let regionColor = '#FF6600'; // Color por defecto
        if (suc.regionId && regionesCache) {  // <--- CORREGIDO: regionesCache sin window
            const region = regionesCache.find(r => r.id === suc.regionId);
            if (region && region.color) {
                regionColor = region.color;
            }
        }
        sucursalesColores.set(suc.nombre, regionColor);
    }
}
    
    registros.forEach(r => {
        const sucursal = r.nombreEmpresaCC || 'Sin asignar';
        if (!sucursalesMap[sucursal]) {
            sucursalesMap[sucursal] = { perdido: 0, recuperado: 0, eventos: 0 };
            window.registrosPorSucursal[sucursal] = [];
        }
        sucursalesMap[sucursal].perdido += r.montoPerdido || 0;
        sucursalesMap[sucursal].recuperado += r.montoRecuperado || 0;
        sucursalesMap[sucursal].eventos += 1;
        window.registrosPorSucursal[sucursal].push(r);
    });

    const sucursalesArray = Object.entries(sucursalesMap)
        .map(([nombre, datos]) => ({ 
            nombre, 
            ...datos,
            color: sucursalesColores.get(nombre) || '#FF6600'
        }))
        .sort((a, b) => b.perdido - a.perdido)
        .slice(0, 8);
    
    const labels = sucursalesArray.map(s => s.nombre.length > 25 ? s.nombre.substring(0, 22) + '...' : s.nombre);
    const perdidosData = sucursalesArray.map(s => s.perdido);
    const colores = sucursalesArray.map(s => s.color);
    const nombresCompletos = sucursalesArray.map(s => s.nombre);
    
    const canvas = document.getElementById('graficoTopSucursales');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (graficoTopSucursales) {
        graficoTopSucursales.data.labels = labels;
        graficoTopSucursales.data.datasets[0].data = perdidosData;
        graficoTopSucursales.data.datasets[0].backgroundColor = colores;
        graficoTopSucursales.update();
    } else {
        graficoTopSucursales = new Chart(ctx, {
            type: 'bar',
            data: { 
                labels: labels, 
                datasets: [{ 
                    label: 'Monto perdido', 
                    data: perdidosData, 
                    backgroundColor: colores,
                    borderColor: colores,
                    borderRadius: 8, 
                    barPercentage: 0.7, 
                    categoryPercentage: 0.8 
                }] 
            },
            options: {
                indexAxis: 'y', 
                responsive: true, 
                maintainAspectRatio: true,
                onClick: (event, activeElements) => {
                    if (activeElements.length > 0) {
                        const index = activeElements[0].index;
                        const sucursalNombre = nombresCompletos[index];
                        const registrosSucursal = window.registrosPorSucursal[sucursalNombre] || [];
                        if (registrosSucursal.length === 0) {
                            Swal.fire({ icon: 'info', title: 'Sin registros', text: `No hay registros para ${sucursalNombre}`, background: 'var(--color-bg-primary)', color: 'white' });
                            return;
                        }
                        mostrarRegistrosRecuperacionEnSweet(registrosSucursal, `Registros de ${sucursalNombre}`, `<i class="fas fa-building"></i> ${sucursalNombre}`);
                    }
                },
                plugins: { 
                    legend: { labels: { color: 'white', font: { size: 10 } } }, 
                    tooltip: { callbacks: { label: (ctx) => { const formatter = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }); return `${ctx.dataset.label}: ${formatter.format(ctx.raw)}`; } } } 
                },
                scales: { 
                    x: { 
                        ticks: { 
                            callback: (value) => { const formatter = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', notation: 'compact' }); return formatter.format(value); }, 
                            color: '#aaa' 
                        }, 
                        grid: { color: 'rgba(255,255,255,0.05)' } 
                    }, 
                    y: { 
                        ticks: { color: '#aaa', font: { size: 10 } }, 
                        grid: { display: false } 
                    } 
                }
            }
        });
    }
}

function actualizarGraficoComparativaRecuperacion(estadisticas) {
    const canvas = document.getElementById('graficoComparativa');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    if (graficoComparativa) {
        graficoComparativa.data.datasets[0].data = [estadisticas.totalPerdido, estadisticas.totalRecuperado];
        graficoComparativa.update();
    } else {
        graficoComparativa = new Chart(ctx, {
            type: 'bar',
            data: { labels: ['Pérdidas', 'Recuperaciones'], datasets: [{ label: 'Monto total', data: [estadisticas.totalPerdido, estadisticas.totalRecuperado], backgroundColor: [COLORS_REC.rojo, COLORS_REC.verde], borderRadius: 12, barPercentage: 0.6 }] },
            options: {
                responsive: true, maintainAspectRatio: true,
                onClick: (event, activeElements) => {
                    if (activeElements.length > 0) {
                        const index = activeElements[0].index;
                        const tipo = index === 0 ? 'Pérdidas' : 'Recuperaciones';
                        const registros = datosActualesRecuperacion.registros || [];
                        if (registros.length === 0) {
                            Swal.fire({ icon: 'info', title: 'Sin registros', text: `No hay registros para mostrar`, background: 'var(--color-bg-primary)', color: 'white' });
                            return;
                        }
                        if (tipo === 'Pérdidas') {
                            mostrarRegistrosRecuperacionEnSweet(registros, 'Todos los registros de pérdidas', `<i class="fas fa-chart-line"></i> Todos los registros`);
                        } else {
                            const registrosConRecuperacion = registros.filter(r => (r.montoRecuperado || 0) > 0);
                            if (registrosConRecuperacion.length === 0) {
                                Swal.fire({ icon: 'info', title: 'Sin recuperaciones', text: 'No hay registros con recuperaciones registradas', background: 'var(--color-bg-primary)', color: 'white' });
                                return;
                            }
                            mostrarRegistrosRecuperacionEnSweet(registrosConRecuperacion, 'Registros con recuperaciones', `<i class="fas fa-undo-alt"></i> Recuperaciones registradas`);
                        }
                    }
                },
                plugins: { legend: { labels: { color: 'white', font: { size: 11 } } }, tooltip: { callbacks: { label: (ctx) => { const formatter = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }); return `${ctx.dataset.label}: ${formatter.format(ctx.raw)}`; } } } },
                scales: { y: { ticks: { callback: (value) => { const formatter = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', notation: 'compact' }); return formatter.format(value); }, color: '#aaa' }, grid: { color: 'rgba(255,255,255,0.05)' } }, x: { ticks: { color: '#aaa', font: { size: 12, weight: 'bold' } }, grid: { display: false } } }
            }
        });
    }
}

function actualizarTablaResumenRecuperacion(registros) {
    const tbody = document.getElementById('tablaResumenBody');
    if (!tbody) return;
    const sucursalesMap = {};
    registros.forEach(r => {
        const sucursal = r.nombreEmpresaCC || 'Sin asignar';
        if (!sucursalesMap[sucursal]) sucursalesMap[sucursal] = { eventos: 0, perdido: 0, recuperado: 0 };
        sucursalesMap[sucursal].eventos++;
        sucursalesMap[sucursal].perdido += r.montoPerdido || 0;
        sucursalesMap[sucursal].recuperado += r.montoRecuperado || 0;
    });
    const sucursalesArray = Object.entries(sucursalesMap).map(([nombre, datos]) => ({ nombre, ...datos, neto: datos.perdido - datos.recuperado, porcentaje: datos.perdido > 0 ? (datos.recuperado / datos.perdido) * 100 : 0 })).sort((a, b) => b.perdido - a.perdido);
    const formatter = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
    if (sucursalesArray.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center"><i class="fas fa-inbox"></i> No hay datos para mostrar con los filtros seleccionados</td</tr>`;
        return;
    }
    tbody.innerHTML = sucursalesArray.map(s => `<tr><td title="${escapeHTML(s.nombre)}">${escapeHTML(s.nombre.length > 35 ? s.nombre.substring(0, 32) + '...' : s.nombre)}</td><td>${s.eventos}</td><td style="color: ${COLORS_REC.rojo}; font-weight: 600;">${formatter.format(s.perdido)}</td><td style="color: ${COLORS_REC.verde}; font-weight: 600;">${formatter.format(s.recuperado)}</td><td style="color: ${s.neto > 0 ? COLORS_REC.rojo : COLORS_REC.verde};">${formatter.format(s.neto)}</td><td><span style="background: rgba(59,130,246,0.2); padding: 4px 8px; border-radius: 20px;">${s.porcentaje.toFixed(2)}%</span></td>`).join('');
}

function actualizarGraficaVaciaRecuperacion() {
    const canvasIds = ['graficoTipoEvento', 'graficoEvolucionMensual', 'graficoTopSucursales', 'graficoComparativa'];
    canvasIds.forEach(id => {
        const canvas = document.getElementById(id);
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.font = '12px "Rajdhani", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Sin datos para mostrar', canvas.width / 2, canvas.height / 2);
        }
    });
}

function mostrarRegistrosRecuperacionEnSweet(registros, titulo, icono = '<i class="fas fa-chart-simple"></i>') {
    if (!registros || registros.length === 0) {
        Swal.fire({ icon: 'info', title: 'Sin registros', text: 'No hay registros para mostrar', background: 'var(--color-bg-primary)', color: 'white', customClass: { popup: 'swal2-popup-custom' } });
        return;
    }

    const formatter = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
    const totalPerdido = registros.reduce((acc, r) => acc + (r.montoPerdido || 0), 0);
    const totalRecuperado = registros.reduce((acc, r) => acc + (r.montoRecuperado || 0), 0);
    const tasaRecuperacion = totalPerdido > 0 ? ((totalRecuperado / totalPerdido) * 100).toFixed(2) : 0;
    const registrosMostrar = registros.slice(0, 15);
    const hayMas = registros.length > 15;

    let registrosHtml = `
        <div class="swal-resumen-stats">
            <div class="swal-stats-grid">
                <div class="swal-stat-item" style="border-left-color: #8b5cf6;"><span class="swal-stat-label">Total registros</span><span class="swal-stat-value">${registros.length}</span></div>
                <div class="swal-stat-item" style="border-left-color: #ef4444;"><span class="swal-stat-label">Total perdido</span><span class="swal-stat-value" style="color: #ef4444;">${formatter.format(totalPerdido)}</span></div>
                <div class="swal-stat-item" style="border-left-color: #10b981;"><span class="swal-stat-label">Total recuperado</span><span class="swal-stat-value" style="color: #10b981;">${formatter.format(totalRecuperado)}</span></div>
                <div class="swal-stat-item" style="border-left-color: #3b82f6;"><span class="swal-stat-label">Tasa recuperación</span><span class="swal-stat-value" style="color: #3b82f6;">${tasaRecuperacion}%</span></div>
            </div>
        </div>
        <div class="swal-registros-list">
    `;

    registrosMostrar.forEach(registro => {
        const fecha = registro.getFechaFormateada ? registro.getFechaFormateada() : (registro.fecha ? new Date(registro.fecha).toLocaleDateString('es-MX') : 'N/A');
        const tipoTexto = registro.getTipoEventoTexto ? registro.getTipoEventoTexto() : (registro.tipoEvento || 'N/A');
        const estadoTexto = registro.getEstadoTexto ? registro.getEstadoTexto() : (registro.estado || 'activo');

        let estadoColor = '#6c757d', estadoIcon = 'fa-circle';
        if (estadoTexto === 'Recuperado') { estadoColor = '#10b981'; estadoIcon = 'fa-check-circle'; }
        else if (estadoTexto === 'Activo') { estadoColor = '#f59e0b'; estadoIcon = 'fa-exclamation-circle'; }
        else if (estadoTexto === 'Cerrado') { estadoColor = '#6c757d'; estadoIcon = 'fa-ban'; }

        let tipoIcon = 'fa-tag', tipoDisplay = tipoTexto;
        if (tipoTexto === 'robo' || tipoTexto === 'Robo') { tipoIcon = 'fa-mask'; tipoDisplay = 'Robo'; }
        else if (tipoTexto === 'extravio' || tipoTexto === 'Extravío') { tipoIcon = 'fa-map-marker-alt'; tipoDisplay = 'Extravío'; }
        else if (tipoTexto === 'accidente' || tipoTexto === 'Accidente') { tipoIcon = 'fa-circle-exclamation'; tipoDisplay = 'Accidente'; }
        registrosHtml += `
            <div class="swal-registro-card" data-registro-id="${registro.id}">
                <div class="swal-card-header"><span class="swal-id"><i class="fas fa-hashtag"></i> ${escapeHTML(registro.id.substring(0, 12))}...</span><span class="swal-fecha"><i class="fas fa-calendar-alt"></i> ${fecha}</span></div>
                <div class="swal-card-body"><div class="swal-info-principal"><div class="swal-sucursal"><i class="fas fa-store"></i> ${escapeHTML(registro.nombreEmpresaCC || 'Sin asignar')}</div><div class="swal-tipo-evento"><i class="fas ${tipoIcon}"></i> ${tipoDisplay}<span class="swal-estado-badge" style="margin-left: 8px; color: ${estadoColor};"><i class="fas ${estadoIcon}"></i> ${estadoTexto}</span></div></div><div class="swal-montos"><span class="swal-monto-perdido"><i class="fas fa-arrow-down"></i> ${formatter.format(registro.montoPerdido || 0)}</span><span class="swal-monto-recuperado"><i class="fas fa-arrow-up"></i> ${formatter.format(registro.montoRecuperado || 0)}</span></div></div>
                ${registro.narracionEventos ? `<div class="swal-card-footer"><div class="swal-narracion"><i class="fas fa-file-alt"></i><span>${escapeHTML(registro.narracionEventos.substring(0, 100))}${registro.narracionEventos.length > 100 ? '...' : ''}</span></div></div>` : ''}
            </div>
        `;
    });

    if (hayMas) registrosHtml += `<div class="swal-mas-registros"><i class="fas fa-ellipsis-h"></i> y ${registros.length - 15} registros más.</div>`;
    registrosHtml += `</div>`;

    Swal.fire({
        title: `${icono} ${titulo}`, html: registrosHtml, width: '880px', background: 'transparent',
        showConfirmButton: true, confirmButtonText: '<i class="fas fa-check"></i> Cerrar', confirmButtonColor: '#28a745',
        customClass: { popup: 'swal2-popup-custom', title: 'swal2-title-custom', confirmButton: 'swal2-confirm' },
        backdrop: `rgba(0,0,0,0.8) left top no-repeat`
    });
}

async function cargarRegistrosRecuperacionConFiltros() {
    if (!organizacionActual?.camelCase || !mercanciaManager) {
        console.log('No se pudo inicializar el módulo de recuperación');
        return;
    }

    try {
        if (registrosRecuperacionCache.length === 0) {
            registrosRecuperacionCache = await mercanciaManager.getRegistrosByOrganizacion(organizacionActual.camelCase);
        }

        let registrosFiltrados = registrosRecuperacionCache;

        const sucursal = document.getElementById('filtroSucursal')?.value || 'todas';
        if (sucursal !== 'todas') {
            registrosFiltrados = registrosFiltrados.filter(r => r.nombreEmpresaCC === sucursal);
        }

        if (filtrosActivos.fechaInicio) {
            const fechaInicioObj = new Date(filtrosActivos.fechaInicio);
            fechaInicioObj.setHours(0, 0, 0, 0);
            registrosFiltrados = registrosFiltrados.filter(r => {
                const fechaRegistro = r.fecha ? new Date(r.fecha) : null;
                return fechaRegistro && fechaRegistro >= fechaInicioObj;
            });
        }

        if (filtrosActivos.fechaFin) {
            const fechaFinObj = new Date(filtrosActivos.fechaFin);
            fechaFinObj.setHours(23, 59, 59, 999);
            registrosFiltrados = registrosFiltrados.filter(r => {
                const fechaRegistro = r.fecha ? new Date(r.fecha) : null;
                return fechaRegistro && fechaRegistro <= fechaFinObj;
            });
        }

        if (filtrosActivos.tipoEvento !== 'todos') {
            registrosFiltrados = registrosFiltrados.filter(r => r.tipoEvento === filtrosActivos.tipoEvento);
        }

        registrosRecuperacionFiltrados = registrosFiltrados;
        datosActualesRecuperacion.registros = registrosFiltrados;
        const estadisticas = calcularEstadisticasRecuperacion(registrosFiltrados);
        datosActualesRecuperacion.estadisticas = estadisticas;

        mostrarKPIsRecuperacion(estadisticas);
        actualizarGraficasRecuperacion(registrosFiltrados, estadisticas);
        actualizarTablaResumenRecuperacion(registrosFiltrados);

    } catch (error) {
        console.error('Error al cargar registros de recuperación:', error);
    }
}

async function generarReportePDF() {
    try {
        // ===== CAMBIAR TEXTOS HTML A NEGRO =====
        prepararTextosParaPDF();
        
        // ===== CAMBIAR GRÁFICAS A NEGRO =====
        cambiarGraficasAModoPDF();
        
        // Delay para que los cambios se apliquen
        await new Promise(resolve => setTimeout(resolve, 200));
        
        Swal.fire({
            title: 'Preparando PDF...',
            text: 'Estamos generando tu reporte estadístico completo',
            icon: 'info',
            showConfirmButton: false,
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });

        // Obtener datos de la tabla de sucursales desde el HTML
        const tablaResumenBody = document.getElementById('tablaResumenBody');
        let sucursalesResumenData = [];
        
        if (tablaResumenBody) {
            const filas = tablaResumenBody.querySelectorAll('tr');
            filas.forEach(fila => {
                const celdas = fila.querySelectorAll('td');
                if (celdas.length >= 6 && !celdas[0].innerText.includes('No hay datos')) {
                    sucursalesResumenData.push({
                        nombre: celdas[0]?.innerText || 'N/A',
                        eventos: parseInt(celdas[1]?.innerText) || 0,
                        perdido: parseFloat(celdas[2]?.innerText.replace(/[^0-9.-]/g, '')) || 0,
                        recuperado: parseFloat(celdas[3]?.innerText.replace(/[^0-9.-]/g, '')) || 0,
                        neto: parseFloat(celdas[4]?.innerText.replace(/[^0-9.-]/g, '')) || 0,
                        porcentaje: parseFloat(celdas[5]?.innerText.replace('%', '')) || 0
                    });
                }
            });
        }

        // Obtener datos de colaboradores desde datosGraficas
        const colaboradoresData = (datosGraficas.colaboradores || []).map(col => ({
            nombre: col.nombre || 'N/A',
            reportados: col.reportados || 0,
            actualizados: col.actualizados || 0,
            seguimientos: col.seguimientos || 0,
            tiempoTotal: col.tiempoTotal || 0,
            incidenciasResueltas: col.incidenciasResueltas || 0
        }));

        // Obtener datos de categorías
        const categoriasData = datosGraficas.categoriasData || [];

        const datosParaPDF = {
            datosIncidencias: {
                metricas: {
                    criticas: parseInt(document.getElementById('metricCriticas')?.textContent || '0'),
                    altas: parseInt(document.getElementById('metricAltas')?.textContent || '0'),
                    pendientes: parseInt(document.getElementById('metricPendientes')?.textContent || '0'),
                    total: parseInt(document.getElementById('metricTotal')?.textContent || '0'),
                    finalizadas: (parseInt(document.getElementById('metricTotal')?.textContent || '0') - parseInt(document.getElementById('metricPendientes')?.textContent || '0'))
                },
                colaboradores: colaboradoresData,
                categoriasData: categoriasData
            },
            datosRecuperacion: {
                estadisticas: datosActualesRecuperacion.estadisticas,
                sucursalesResumen: sucursalesResumenData
            },
            datosMapaCalor: {
                datosPorUbicacion: window.mapaCalorComponente?.datosPorUbicacion ? Array.from(window.mapaCalorComponente.datosPorUbicacion.entries()) : [],
                estadisticasGenerales: {
                    totalIncidentes: document.getElementById('mapaTotalIncidentes')?.textContent || '0',
                    criticasAltas: document.getElementById('mapaCriticasAltas')?.textContent || '0',
                    totalPerdido: document.getElementById('mapaTotalPerdido')?.textContent || '$0',
                    tasaRecuperacion: document.getElementById('mapaTasaRecuperacion')?.textContent || '0%'
                }
            },
            filtrosAplicados: filtrosActivos
        };

        generadorPDFEstadisticasUnificado.configurar({
            organizacionActual: organizacionActual,
            sucursalesCache: sucursalesCache,
            categoriasCache: categoriasCache,
            authToken: authToken
        });

        await generadorPDFEstadisticasUnificado.generarReporte(datosParaPDF, { mostrarAlerta: true });

        // ===== RESTAURAR TEXTOS HTML A BLANCO =====
        restaurarTextosOriginales();
        
        // ===== RESTAURAR GRÁFICAS A BLANCO =====
        restaurarGraficasAModoNormal();

    } catch (error) {
        console.error('Error generando PDF:', error);
        // En caso de error, restaurar todo
        restaurarTextosOriginales();
        restaurarGraficasAModoNormal();
        Swal.close();
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'No se pudo generar el PDF: ' + error.message,
            background: 'var(--color-bg-primary)',
            color: 'white'
        });
    }
}

// =============================================
// FUNCIONES PRINCIPALES CON SINCRONIZACIÓN
// =============================================

async function aplicarFiltros() {
    const nuevosFiltros = {
        fechaInicio: document.getElementById('filtroFechaInicio')?.value || null,
        fechaFin: document.getElementById('filtroFechaFin')?.value || null,
        categoriaId: document.getElementById('filtroCategoria')?.value || 'todas',
        sucursalId: document.getElementById('filtroSucursal')?.value || 'todas',
        colaboradorId: document.getElementById('filtroColaborador')?.value || 'todos',
        busqueda: document.getElementById('buscarIncidencias')?.value || '',
        tipoEvento: document.getElementById('filtroTipoEvento')?.value || 'todos',
        nivelRiesgoMapa: document.getElementById('filtroNivelRiesgoMapa')?.value || 'todos',
        agrupacionMapa: document.getElementById('filtroAgrupacionMapa')?.value || 'sucursal'
    };
    filtrosActivos = nuevosFiltros;
    
    // Sincronizar con el mapa de calor
    if (window.mapaCalorComponente) {
        window.mapaCalorComponente.sincronizarFiltros({
            fechaInicio: nuevosFiltros.fechaInicio,
            fechaFin: nuevosFiltros.fechaFin,
            nivelRiesgo: nuevosFiltros.nivelRiesgoMapa,
            agrupacion: nuevosFiltros.agrupacionMapa
        });
        window.mapaCalorComponente.aplicarFiltros();
    }
    
    await cargarIncidencias();
    await cargarRegistrosRecuperacionConFiltros();
    
    const totalIncidencias = incidenciasFiltradas?.length || 0;
    const totalRecuperaciones = registrosRecuperacionFiltrados?.length || 0;
    if (totalIncidencias > 0 || totalRecuperaciones > 0) {
        await registrarAplicacionFiltros(filtrosActivos, totalIncidencias, totalRecuperaciones);
    }
}

async function limpiarFiltros() {
    const hoy = new Date();
    const hace30Dias = new Date();
    hace30Dias.setDate(hoy.getDate() - 30);
    
    const fechaInicio = document.getElementById('filtroFechaInicio');
    const fechaFin = document.getElementById('filtroFechaFin');
    const filtroCategoria = document.getElementById('filtroCategoria');
    const filtroSucursal = document.getElementById('filtroSucursal');
    const filtroColaborador = document.getElementById('filtroColaborador');
    const filtroTipoEvento = document.getElementById('filtroTipoEvento');
    const filtroNivelRiesgoMapa = document.getElementById('filtroNivelRiesgoMapa');
    const filtroAgrupacionMapa = document.getElementById('filtroAgrupacionMapa');
    const buscar = document.getElementById('buscarIncidencias');
    
    if (fechaInicio) fechaInicio.value = hace30Dias.toISOString().split('T')[0];
    if (fechaFin) fechaFin.value = hoy.toISOString().split('T')[0];
    if (filtroCategoria) filtroCategoria.value = 'todas';
    if (filtroSucursal) filtroSucursal.value = 'todas';
    if (filtroColaborador) filtroColaborador.value = 'todos';
    if (filtroTipoEvento) filtroTipoEvento.value = 'todos';
    if (filtroNivelRiesgoMapa) filtroNivelRiesgoMapa.value = 'todos';
    if (filtroAgrupacionMapa) filtroAgrupacionMapa.value = 'sucursal';
    if (buscar) buscar.value = '';
    
    filtrosActivos = {
        fechaInicio: hace30Dias.toISOString().split('T')[0],
        fechaFin: hoy.toISOString().split('T')[0],
        categoriaId: 'todas',
        sucursalId: 'todas',
        colaboradorId: 'todos',
        busqueda: '',
        tipoEvento: 'todos',
        nivelRiesgoMapa: 'todos',
        agrupacionMapa: 'sucursal'
    };
    
    if (window.mapaCalorComponente) {
        window.mapaCalorComponente.sincronizarFiltros({
            fechaInicio: filtrosActivos.fechaInicio,
            fechaFin: filtrosActivos.fechaFin,
            nivelRiesgo: 'todos',
            agrupacion: 'sucursal'
        });
        window.mapaCalorComponente.aplicarFiltros();
    }
    
    await registrarLimpiezaFiltros();
    await cargarIncidencias();
    await cargarRegistrosRecuperacionConFiltros();
}

async function inicializarDashboardUnificado() {
    try {
        await obtenerDatosOrganizacion();
        await inicializarHistorial();
        await inicializarEstadisticasManager();
        await obtenerTokenAuth();
        configurarFiltros();
        await Promise.all([cargarSucursales(), cargarCategorias(), cargarSucursalesRecuperacion(), cargarRegiones()]); // Agregar cargarRegiones aquí
        establecerFechasPorDefecto();
        await registrarAccesoVistaEstadisticas();
        
        // Sincronizar filtros con el mapa de calor
        sincronizarFiltrosConMapa();
        
        // NO cargar datos automáticamente - esperar a que el usuario aplique filtros
        const welcomeMsg = document.getElementById('welcomeMessage');
        const resultadosSection = document.getElementById('resultadosSection');
        if (welcomeMsg) welcomeMsg.style.display = 'block';
        if (resultadosSection) resultadosSection.classList.remove('visible');
        
        incidenciasFiltradas = [];
        registrosRecuperacionFiltrados = [];
        
        if (window.mapaCalorComponente) {
            window.mapaCalorComponente.mostrarMensajeInicialMapa();
        }
        
    } catch (error) {
        console.error('Error al inicializar estadísticas unificadas:', error);
        mostrarError('Error al cargar la página: ' + error.message);
        mostrarErrorInicializacion();
    }
}

function sincronizarFiltrosConMapa() {
    setTimeout(() => {
        if (window.mapaCalorComponente) {
            const nivelRiesgo = document.getElementById('filtroNivelRiesgoMapa')?.value || 'todos';
            const agrupacion = document.getElementById('filtroAgrupacionMapa')?.value || 'sucursal';
            
            window.mapaCalorComponente.sincronizarFiltros({
                fechaInicio: filtrosActivos.fechaInicio,
                fechaFin: filtrosActivos.fechaFin,
                nivelRiesgo: nivelRiesgo,
                agrupacion: agrupacion
            });
        }
    }, 500);
}


// =============================================
// FUNCIONES PARA MANEJAR COLORES DE TEXTO EN PDF
// =============================================

// Función para cambiar TODOS los textos a negro antes del PDF
function prepararTextosParaPDF() {
    // Cambiar todos los textos de tarjetas métricas
    document.querySelectorAll('.metric-card .metric-title, .metric-card .metric-value, .metric-card .metric-subtitle').forEach(el => {
        el.style.setProperty('color', '#000000', 'important');
    });
    
    // Cambiar títulos de secciones
    document.querySelectorAll('.seccion-titulo h2, .seccion-titulo p').forEach(el => {
        el.style.setProperty('color', '#000000', 'important');
    });
    
    // Cambiar textos de tablas
    document.querySelectorAll('.table, .resumen-tabla, .table th, .table td, .resumen-tabla th, .resumen-tabla td').forEach(el => {
        el.style.setProperty('color', '#000000', 'important');
    });
    
    // Cambiar headers de cards
    document.querySelectorAll('.card-header h5, .card-grafica .card-header h5').forEach(el => {
        el.style.setProperty('color', '#000000', 'important');
    });
    
    // Cambiar KPIs de recuperación
    document.querySelectorAll('.kpi-info h3, .kpi-info p').forEach(el => {
        el.style.setProperty('color', '#000000', 'important');
    });
    
    // Cambiar textos de filtros
    document.querySelectorAll('.filtros-header h5, .filtro-grupo label').forEach(el => {
        el.style.setProperty('color', '#000000', 'important');
    });
    
    // Cambiar valores de inputs y selects
    document.querySelectorAll('.filtro-select, .filtro-input').forEach(el => {
        el.style.setProperty('color', '#000000', 'important');
        el.style.setProperty('background', '#ffffff', 'important');
    });
    
    // Cambiar footer
    document.querySelectorAll('.footer-datetime').forEach(el => {
        el.style.setProperty('color', '#000000', 'important');
    });
}

// Función para restaurar colores originales (blanco)
function restaurarTextosOriginales() {
    document.querySelectorAll('.metric-card .metric-title, .metric-card .metric-value, .metric-card .metric-subtitle').forEach(el => {
        el.style.removeProperty('color');
    });
    
    document.querySelectorAll('.seccion-titulo h2, .seccion-titulo p').forEach(el => {
        el.style.removeProperty('color');
    });
    
    document.querySelectorAll('.table, .resumen-tabla, .table th, .table td, .resumen-tabla th, .resumen-tabla td').forEach(el => {
        el.style.removeProperty('color');
    });
    
    document.querySelectorAll('.card-header h5, .card-grafica .card-header h5').forEach(el => {
        el.style.removeProperty('color');
    });
    
    document.querySelectorAll('.kpi-info h3, .kpi-info p').forEach(el => {
        el.style.removeProperty('color');
    });
    
    document.querySelectorAll('.filtros-header h5, .filtro-grupo label').forEach(el => {
        el.style.removeProperty('color');
    });
    
    document.querySelectorAll('.filtro-select, .filtro-input').forEach(el => {
        el.style.removeProperty('color');
        el.style.removeProperty('background');
    });
    
    document.querySelectorAll('.footer-datetime').forEach(el => {
        el.style.removeProperty('color');
    });
}
// =============================================
// FUNCIONES PARA CAMBIAR COLORES DE GRÁFICAS PARA PDF
// =============================================

// Función para cambiar TODAS las gráficas a modo PDF (texto negro)
function cambiarGraficasAModoPDF() {
    // Lista de todas las gráficas que tienes
    const graficas = [
        { chart: charts.actualizadores },
        { chart: charts.reportadores },
        { chart: charts.seguimientos },
        { chart: charts.estado },
        { chart: charts.riesgo },
        { chart: charts.categorias },
        { chart: charts.sucursales },
        { chart: charts.tiempo },
        { chart: graficoTipoEvento },
        { chart: graficoEvolucionMensual },
        { chart: graficoTopSucursales },
        { chart: graficoComparativa }
    ];
    
    graficas.forEach(g => {
        if (g.chart && g.chart.options) {
            // Cambiar colores de texto de los ejes
            if (g.chart.options.scales) {
                if (g.chart.options.scales.y && g.chart.options.scales.y.ticks) {
                    g.chart.options.scales.y.ticks.color = '#000000';
                }
                if (g.chart.options.scales.x && g.chart.options.scales.x.ticks) {
                    g.chart.options.scales.x.ticks.color = '#000000';
                }
            }
            // Cambiar color de la leyenda
            if (g.chart.options.plugins && g.chart.options.plugins.legend) {
                if (g.chart.options.plugins.legend.labels) {
                    g.chart.options.plugins.legend.labels.color = '#000000';
                }
            }
            // Actualizar la gráfica
            g.chart.update();
        }
    });
}

// Función para restaurar gráficas a modo normal (texto blanco)
function restaurarGraficasAModoNormal() {
    const graficas = [
        { chart: charts.actualizadores },
        { chart: charts.reportadores },
        { chart: charts.seguimientos },
        { chart: charts.estado },
        { chart: charts.riesgo },
        { chart: charts.categorias },
        { chart: charts.sucursales },
        { chart: charts.tiempo },
        { chart: graficoTipoEvento },
        { chart: graficoEvolucionMensual },
        { chart: graficoTopSucursales },
        { chart: graficoComparativa }
    ];
    
    graficas.forEach(g => {
        if (g.chart && g.chart.options) {
            // Restaurar colores de texto de los ejes a blanco
            if (g.chart.options.scales) {
                if (g.chart.options.scales.y && g.chart.options.scales.y.ticks) {
                    g.chart.options.scales.y.ticks.color = 'white';
                }
                if (g.chart.options.scales.x && g.chart.options.scales.x.ticks) {
                    g.chart.options.scales.x.ticks.color = 'white';
                }
            }
            // Restaurar color de la leyenda a blanco
            if (g.chart.options.plugins && g.chart.options.plugins.legend) {
                if (g.chart.options.plugins.legend.labels) {
                    g.chart.options.plugins.legend.labels.color = 'white';
                }
            }
            // Actualizar la gráfica
            g.chart.update();
        }
    });
}
document.addEventListener('DOMContentLoaded', inicializarDashboardUnificado);