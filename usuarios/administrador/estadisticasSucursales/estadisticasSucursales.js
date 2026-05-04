// sucursalDetalle.js - Controlador para vista detallada de sucursal
// VERSION: 2.0 - Con mejora de colores para PDF (texto negro en gráficas)

import { IncidenciaManager } from '/clases/incidencia.js';
import { MercanciaPerdidaManager } from '/clases/incidenciaRecuperacion.js';
import { SucursalManager } from '/clases/sucursal.js';
import { CategoriaManager } from '/clases/categoria.js';

// Variables globales
let incidenciaManager = null;
let mercanciaManager = null;
let sucursalManager = null;
let categoriaManager = null;
let organizacionActual = null;
let sucursalActual = null;
let sucursalId = null;
let incidenciasSucursal = [];
let registrosRecuperacionSucursal = [];
let categoriasCache = [];
let nivelesRiesgoCache = [];  // <--- NUEVA: cache para niveles de riesgo dinámicos


// Gráficas (con referencias globales para el PDF)
let graficoRiesgo = null;
let graficoPerdidasRecuperacion = null;
window.graficoRiesgo = null;
window.graficoPerdidasRecuperacion = null;

// Colores para niveles de riesgo
const COLOR_RIESGO = {
    critico: '#ef4444',
    alto: '#f97316',
    medio: '#eab308',
    bajo: '#10b981'
};

// =============================================
// FUNCIONES AUXILIARES
// =============================================

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
        organizacionActual = { nombre: 'Mi Empresa', camelCase: '' };
    } catch (error) {
        organizacionActual = { nombre: 'Mi Empresa', camelCase: '' };
    }
}

async function inicializarManagers() {
    try {
        incidenciaManager = new IncidenciaManager();
        mercanciaManager = new MercanciaPerdidaManager();
        sucursalManager = new SucursalManager();
        
        const { CategoriaManager } = await import('/clases/categoria.js');
        categoriaManager = new CategoriaManager();
        
        return true;
    } catch (error) {
        console.error('Error inicializando managers:', error);
        return false;
    }
}

async function cargarCategorias() {
    try {
        categoriasCache = await categoriaManager.obtenerCategoriasPorOrganizacion(organizacionActual.camelCase);
    } catch (error) {
        console.error('Error cargando categorías:', error);
        categoriasCache = [];
    }
}

function obtenerNombreCategoria(categoriaId) {
    const categoria = categoriasCache.find(c => c.id === categoriaId);
    return categoria ? categoria.nombre : 'No disponible';
}

function obtenerColorRiesgo(nivel) {
    return COLOR_RIESGO[nivel] || '#6c757d';
}

function formatearMoneda(valor) {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(valor);
}

// =============================================
// CARGA DE DATOS DE LA SUCURSAL
// =============================================

async function cargarSucursal() {
    const urlParams = new URLSearchParams(window.location.search);
    sucursalId = urlParams.get('id');
    
    if (!sucursalId) {
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'No se especificó ninguna sucursal',
            confirmButtonText: 'Volver'
        }).then(() => {
            window.location.href = '/usuarios/administrador/estadisticas/estadisticas.html';
        });
        return false;
    }
    
    try {
        // Cargar todas las sucursales para el selector
        await cargarTodasLasSucursales();
        
        sucursalActual = await sucursalManager.getSucursalById(sucursalId, organizacionActual.camelCase);
        
        if (!sucursalActual) {
            throw new Error('Sucursal no encontrada');
        }
        
        // Actualizar header
        document.getElementById('sucursalNombre').textContent = sucursalActual.nombre;
        document.getElementById('sucursalUbicacion').innerHTML = `<i class="fas fa-map-marker-alt"></i> ${sucursalActual.getUbicacionCompleta() || 'Sin ubicación'}`;
        document.getElementById('sucursalContacto').innerHTML = `<i class="fas fa-phone"></i> ${sucursalActual.getContactoFormateado() || 'Sin contacto'}`;
        
        const regionInfo = await sucursalActual.getRegionInfo();
        document.getElementById('sucursalRegion').innerHTML = `<i class="fas fa-layer-group"></i> ${regionInfo.nombre}`;
        document.getElementById('sucursalRegion').style.borderLeft = `3px solid ${regionInfo.color}`;
        
        // Seleccionar la sucursal actual en el selector
        const selector = document.getElementById('selectorSucursal');
        if (selector) {
            selector.value = sucursalId;
        }
        
        return true;
    } catch (error) {
        console.error('Error cargando sucursal:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'No se pudo cargar la información de la sucursal'
        });
        return false;
    }
}

async function cargarTodasLasSucursales() {
    try {
        const todasSucursales = await sucursalManager.getSucursalesByOrganizacion(organizacionActual.camelCase);
        
        const selector = document.getElementById('selectorSucursal');
        if (!selector) return;
        
        if (!todasSucursales || todasSucursales.length === 0) {
            selector.innerHTML = '<option value="">No hay sucursales disponibles</option>';
            return;
        }
        
        // Llenar el selector
        selector.innerHTML = '<option value="">-- Seleccionar sucursal --</option>';
        todasSucursales.forEach(suc => {
            const option = document.createElement('option');
            option.value = suc.id;
            option.textContent = suc.nombre;
            selector.appendChild(option);
        });
        
        // Agregar evento de cambio
        selector.addEventListener('change', (e) => {
            const nuevaSucursalId = e.target.value;
            if (nuevaSucursalId && nuevaSucursalId !== sucursalId) {
                cambiarSucursal(nuevaSucursalId);
            }
        });
        
    } catch (error) {
        console.error('Error cargando sucursales para selector:', error);
        const selector = document.getElementById('selectorSucursal');
        if (selector) {
            selector.innerHTML = '<option value="">Error cargando sucursales</option>';
        }
    }
}

// =============================================
// FUNCIONES PARA CAPTURA DE GRÁFICAS CON MEJORA DE COLORES
// =============================================

/**
 * Cambia los colores de las gráficas a modo PDF (texto negro)
 */
function cambiarGraficasAModoPDF() {
    // Cambiar gráfica de riesgo
    if (window.graficoRiesgo && window.graficoRiesgo.options) {
        aplicarColoresPDF(window.graficoRiesgo);
    }
    if (graficoRiesgo && graficoRiesgo.options) {
        aplicarColoresPDF(graficoRiesgo);
    }
    
    // Cambiar gráfica de pérdidas vs recuperaciones
    if (window.graficoPerdidasRecuperacion && window.graficoPerdidasRecuperacion.options) {
        aplicarColoresPDF(window.graficoPerdidasRecuperacion);
    }
    if (graficoPerdidasRecuperacion && graficoPerdidasRecuperacion.options) {
        aplicarColoresPDF(graficoPerdidasRecuperacion);
    }
}

/**
 * Aplica colores oscuros (para PDF) a una gráfica específica
 */
function aplicarColoresPDF(chart) {
    if (!chart || !chart.options) return;
    
    // Cambiar colores de texto de los ejes
    if (chart.options.scales) {
        if (chart.options.scales.y && chart.options.scales.y.ticks) {
            chart.options.scales.y.ticks.color = '#000000';
        }
        if (chart.options.scales.x && chart.options.scales.x.ticks) {
            chart.options.scales.x.ticks.color = '#000000';
        }
    }
    
    // Cambiar color de la leyenda
    if (chart.options.plugins && chart.options.plugins.legend) {
        if (chart.options.plugins.legend.labels) {
            chart.options.plugins.legend.labels.color = '#000000';
        }
    }
    
    // Actualizar la gráfica
    chart.update();
}

/**
 * Restaura los colores originales de las gráficas (blanco)
 */
function restaurarGraficasAModoNormal() {
    // Restaurar gráfica de riesgo
    if (window.graficoRiesgo && window.graficoRiesgo.options) {
        aplicarColoresOriginales(window.graficoRiesgo);
    }
    if (graficoRiesgo && graficoRiesgo.options) {
        aplicarColoresOriginales(graficoRiesgo);
    }
    
    // Restaurar gráfica de pérdidas vs recuperaciones
    if (window.graficoPerdidasRecuperacion && window.graficoPerdidasRecuperacion.options) {
        aplicarColoresOriginales(window.graficoPerdidasRecuperacion);
    }
    if (graficoPerdidasRecuperacion && graficoPerdidasRecuperacion.options) {
        aplicarColoresOriginales(graficoPerdidasRecuperacion);
    }
}

/**
 * Restaura colores originales (blanco) a una gráfica
 */
function aplicarColoresOriginales(chart) {
    if (!chart || !chart.options) return;
    
    // Restaurar colores de texto de los ejes a blanco
    if (chart.options.scales) {
        if (chart.options.scales.y && chart.options.scales.y.ticks) {
            chart.options.scales.y.ticks.color = 'white';
        }
        if (chart.options.scales.x && chart.options.scales.x.ticks) {
            chart.options.scales.x.ticks.color = 'white';
        }
    }
    
    // Restaurar color de la leyenda a blanco
    if (chart.options.plugins && chart.options.plugins.legend) {
        if (chart.options.plugins.legend.labels) {
            chart.options.plugins.legend.labels.color = 'white';
        }
    }
    
    // Actualizar la gráfica
    chart.update();
}

/**
 * Captura las gráficas actuales como imágenes (con mejora de resolución)
 */
async function capturarGraficasSucursal() {
    const graficas = {
        riesgo: null,
        perdidasRecuperacion: null
    };
    
    // Capturar gráfica de riesgo
    const canvasRiesgo = document.getElementById('graficoRiesgoSucursal');
    if (canvasRiesgo && canvasRiesgo instanceof HTMLCanvasElement) {
        try {
            const scale = 3; // Mayor resolución para mejor calidad
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = canvasRiesgo.width * scale;
            tempCanvas.height = canvasRiesgo.height * scale;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.imageSmoothingEnabled = true;
            tempCtx.imageSmoothingQuality = 'high';
            tempCtx.drawImage(canvasRiesgo, 0, 0, tempCanvas.width, tempCanvas.height);
            graficas.riesgo = tempCanvas.toDataURL('image/png', 1.0);
        } catch (error) {
            console.error('Error capturando gráfica de riesgo:', error);
        }
    }
    
    // Capturar gráfica de pérdidas vs recuperaciones
    const canvasPerdidas = document.getElementById('graficoPerdidasRecuperacion');
    if (canvasPerdidas && canvasPerdidas instanceof HTMLCanvasElement) {
        try {
            const scale = 3;
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = canvasPerdidas.width * scale;
            tempCanvas.height = canvasPerdidas.height * scale;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.imageSmoothingEnabled = true;
            tempCtx.imageSmoothingQuality = 'high';
            tempCtx.drawImage(canvasPerdidas, 0, 0, tempCanvas.width, tempCanvas.height);
            graficas.perdidasRecuperacion = tempCanvas.toDataURL('image/png', 1.0);
        } catch (error) {
            console.error('Error capturando gráfica de pérdidas:', error);
        }
    }
    
    return graficas;
}

/**
 * Recaptura las gráficas después de cambiar los colores (para el PDF)
 */
async function recapturarGraficasConNuevosColores() {
    // Esperar un poco para que las gráficas se actualicen
    await new Promise(resolve => setTimeout(resolve, 300));
    
    return await capturarGraficasSucursal();
}


// =============================================
// MANEJO DE CAMBIO DE SUCURSAL
// =============================================

async function cambiarSucursal(nuevaSucursalId) {
    try {
        Swal.fire({
            title: 'Cambiando sucursal...',
            text: 'Cargando datos de la nueva sucursal',
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });
        
        const nuevaUrl = `${window.location.pathname}?id=${nuevaSucursalId}`;
        window.history.pushState({}, '', nuevaUrl);
        
        sucursalId = nuevaSucursalId;
        sucursalActual = await sucursalManager.getSucursalById(sucursalId, organizacionActual.camelCase);
        
        if (!sucursalActual) {
            throw new Error('Sucursal no encontrada');
        }
        
        document.getElementById('sucursalNombre').textContent = sucursalActual.nombre;
        document.getElementById('sucursalUbicacion').innerHTML = `<i class="fas fa-map-marker-alt"></i> ${sucursalActual.getUbicacionCompleta() || 'Sin ubicación'}`;
        document.getElementById('sucursalContacto').innerHTML = `<i class="fas fa-phone"></i> ${sucursalActual.getContactoFormateado() || 'Sin contacto'}`;
        
        const regionInfo = await sucursalActual.getRegionInfo();
        document.getElementById('sucursalRegion').innerHTML = `<i class="fas fa-layer-group"></i> ${regionInfo.nombre}`;
        document.getElementById('sucursalRegion').style.borderLeft = `3px solid ${regionInfo.color}`;
        
        await cargarIncidenciasSucursal();
        await cargarRegistrosRecuperacionSucursal();
        
        actualizarKPIs();
        renderizarGraficoRiesgo();
        renderizarTablaCategorias();
        renderizarGraficoPerdidasRecuperacion();
        renderizarTablaIncidenciasRecientes();
        actualizarFooter();
        
        ocultarSeccionesSinDatos();

        Swal.close();
        Swal.fire({
            icon: 'success',
            title: 'Sucursal cambiada',
            text: `Ahora visualizando: ${sucursalActual.nombre}`,
            timer: 2000,
            showConfirmButton: false,
            toast: true,
            position: 'top-end'
        });
        
    } catch (error) {
        console.error('Error cambiando sucursal:', error);
        Swal.close();
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'No se pudo cargar la nueva sucursal: ' + error.message
        });
        
        const selector = document.getElementById('selectorSucursal');
        if (selector && sucursalActual) {
            selector.value = sucursalActual.id;
        }
    }
}

// =============================================
// CARGA DE INCIDENCIAS Y RECUPERACIONES
// =============================================

async function cargarIncidenciasSucursal() {
    try {
        const todasIncidencias = await incidenciaManager.getIncidenciasByOrganizacion(organizacionActual.camelCase);
        incidenciasSucursal = todasIncidencias.filter(inc => inc.sucursalId === sucursalId);
        return incidenciasSucursal;
    } catch (error) {
        console.error('Error cargando incidencias:', error);
        incidenciasSucursal = [];
        return [];
    }
}

async function cargarRegistrosRecuperacionSucursal() {
    try {
        const todosRegistros = await mercanciaManager.getRegistrosByOrganizacion(organizacionActual.camelCase);
        registrosRecuperacionSucursal = todosRegistros.filter(reg => reg.nombreEmpresaCC === sucursalActual.nombre);
        return registrosRecuperacionSucursal;
    } catch (error) {
        console.error('Error cargando registros de recuperación:', error);
        registrosRecuperacionSucursal = [];
        return [];
    }
}

// =============================================
// CÁLCULO DE ESTADÍSTICAS
// =============================================

function calcularEstadisticasIncidencias() {
    const total = incidenciasSucursal.length;
    const pendientes = incidenciasSucursal.filter(i => i.estado === 'pendiente').length;
    const finalizadas = incidenciasSucursal.filter(i => i.estado === 'finalizada').length;
    const criticas = incidenciasSucursal.filter(i => i.nivelRiesgo === 'critico').length;
    const altas = incidenciasSucursal.filter(i => i.nivelRiesgo === 'alto').length;
    const medias = incidenciasSucursal.filter(i => i.nivelRiesgo === 'medio').length;
    const bajas = incidenciasSucursal.filter(i => i.nivelRiesgo === 'bajo').length;
    
    const incidenciasFinalizadasConTiempo = incidenciasSucursal.filter(i => i.estado === 'finalizada').map(inc => {
        const inicio = inc.fechaInicio instanceof Date ? inc.fechaInicio : new Date(inc.fechaInicio);
        let fechaFin = null;
        if (inc.fechaFinalizacion) {
            fechaFin = inc.fechaFinalizacion instanceof Date ? inc.fechaFinalizacion : new Date(inc.fechaFinalizacion);
        } else if (inc.fechaActualizacion) {
            fechaFin = inc.fechaActualizacion instanceof Date ? inc.fechaActualizacion : new Date(inc.fechaActualizacion);
        }
        if (fechaFin && inicio) {
            return (fechaFin - inicio) / (1000 * 60 * 60);
        }
        return null;
    }).filter(t => t !== null && t > 0 && t < 720);
    
    const tiempoPromedio = incidenciasFinalizadasConTiempo.length > 0 
        ? Math.round(incidenciasFinalizadasConTiempo.reduce((a, b) => a + b, 0) / incidenciasFinalizadasConTiempo.length)
        : 0;
    
    return {
        total,
        pendientes,
        finalizadas,
        criticas,
        altas,
        medias,
        bajas,
        tiempoPromedio,
        criticasAltas: criticas + altas
    };
}

function calcularEstadisticasRecuperacion() {
    const totalPerdido = registrosRecuperacionSucursal.reduce((acc, r) => acc + (r.montoPerdido || 0), 0);
    const totalRecuperado = registrosRecuperacionSucursal.reduce((acc, r) => acc + (r.montoRecuperado || 0), 0);
    const tasaRecuperacion = totalPerdido > 0 ? (totalRecuperado / totalPerdido) * 100 : 0;
    
    return {
        totalPerdido,
        totalRecuperado,
        tasaRecuperacion
    };
}



async function cargarNivelesRiesgo() {
    try {
        if (!organizacionActual?.camelCase) return;
        
        const { RiesgoNivelManager } = await import('/clases/riesgoNivel.js');
        const riesgoManager = new RiesgoNivelManager();
        const niveles = await riesgoManager.obtenerTodosNiveles(organizacionActual.camelCase);
        
        if (niveles && niveles.length > 0) {
            nivelesRiesgoCache = niveles;
            // Guardar en window para acceso global también
            window.nivelesRiesgoEstaticos = niveles;

        } else {
            // Fallback: usar niveles por defecto si no hay configurados
            nivelesRiesgoCache = [
                { id: 'critico', nombre: 'Crítico', color: '#ef4444' },
                { id: 'alto', nombre: 'Alto', color: '#f97316' },
                { id: 'medio', nombre: 'Medio', color: '#eab308' },
                { id: 'bajo', nombre: 'Bajo', color: '#10b981' }
            ];
            window.nivelesRiesgoEstaticos = nivelesRiesgoCache;
        }
    } catch (error) {
        console.error('Error cargando niveles de riesgo:', error);
        // Fallback
        nivelesRiesgoCache = [
            { id: 'critico', nombre: 'Crítico', color: '#ef4444' },
            { id: 'alto', nombre: 'Alto', color: '#f97316' },
            { id: 'medio', nombre: 'Medio', color: '#eab308' },
            { id: 'bajo', nombre: 'Bajo', color: '#10b981' }
        ];
        window.nivelesRiesgoEstaticos = nivelesRiesgoCache;
    }
}
function calcularDatosPorRiesgo() {
    // Contar incidencias por nivel de riesgo
    const riesgoMap = new Map();
    
    // Inicializar contadores para todos los niveles dinámicos
    if (nivelesRiesgoCache && nivelesRiesgoCache.length > 0) {
        nivelesRiesgoCache.forEach(nivel => {
            riesgoMap.set(nivel.id, 0);
        });
    }
    
    incidenciasSucursal.forEach(inc => {
        const nivel = inc.nivelRiesgo;
        if (riesgoMap.has(nivel)) {
            riesgoMap.set(nivel, riesgoMap.get(nivel) + 1);
        } else if (nivel) {
            // Si encontramos un nivel que no está en caché, lo agregamos
            riesgoMap.set(nivel, (riesgoMap.get(nivel) || 0) + 1);
        }
    });
    
    // Construir arrays para la gráfica (solo niveles con cantidad > 0)
    const labels = [];
    const data = [];
    const colors = [];
    const nivelesInfo = [];
    let total = 0;
    
    // Primero procesar niveles desde la caché (ordenados como están en BD)
    if (nivelesRiesgoCache && nivelesRiesgoCache.length > 0) {
        nivelesRiesgoCache.forEach(nivel => {
            const cantidad = riesgoMap.get(nivel.id) || 0;
            total += cantidad;
        });
        
        nivelesRiesgoCache.forEach(nivel => {
            const cantidad = riesgoMap.get(nivel.id) || 0;
            if (cantidad > 0) {
                labels.push(nivel.nombre);
                data.push(cantidad);
                colors.push(nivel.color || '#6c757d');
                nivelesInfo.push({ id: nivel.id, nombre: nivel.nombre, color: nivel.color || '#6c757d' });
            }
        });
    }
    
    // Procesar niveles adicionales que no están en caché
    for (const [nivelId, cantidad] of riesgoMap.entries()) {
        if (cantidad > 0 && !nivelesRiesgoCache.some(n => n.id === nivelId)) {
            labels.push(nivelId);
            data.push(cantidad);
            colors.push('#6c757d');
            nivelesInfo.push({ id: nivelId, nombre: nivelId, color: '#6c757d' });
            total += cantidad;
        }
    }
    
    // Calcular porcentajes
    const porcentajes = {};
    nivelesInfo.forEach((nivel, idx) => {
        porcentajes[nivel.id] = total > 0 ? (data[idx] / total) * 100 : 0;
    });
    
    return { labels, data, colors, nivelesInfo, porcentajes, total };
}

function calcularDatosPorCategoria() {
    const categoriaMap = new Map();
    
    incidenciasSucursal.forEach(inc => {
        if (inc.categoriaId) {
            const nombreCat = obtenerNombreCategoria(inc.categoriaId);
            if (!categoriaMap.has(nombreCat)) {
                categoriaMap.set(nombreCat, 0);
            }
            categoriaMap.set(nombreCat, categoriaMap.get(nombreCat) + 1);
        }
    });
    
    const total = incidenciasSucursal.length;
    
    return Array.from(categoriaMap.entries())
        .map(([nombre, cantidad]) => ({ nombre, cantidad, porcentaje: total > 0 ? (cantidad / total) * 100 : 0 }))
        .sort((a, b) => b.cantidad - a.cantidad)
        .slice(0, 5);
}

// =============================================
// RENDERIZADO
// =============================================

function actualizarKPIs() {
    const statsIncidencias = calcularEstadisticasIncidencias();
    const statsRecuperacion = calcularEstadisticasRecuperacion();
    
    document.getElementById('totalIncidencias').textContent = statsIncidencias.total;
    document.getElementById('totalCriticasAltas').textContent = statsIncidencias.criticasAltas;
    document.getElementById('totalPendientes').textContent = statsIncidencias.pendientes;
    document.getElementById('tasaRecuperacion').textContent = `${statsRecuperacion.tasaRecuperacion.toFixed(1)}%`;
    
    document.getElementById('tiempoPromedio').textContent = statsIncidencias.tiempoPromedio;
    let porcentajeBar = 0;
    let barColor = '#10b981';
    if (statsIncidencias.tiempoPromedio > 72) {
        porcentajeBar = Math.min(100, (statsIncidencias.tiempoPromedio / 168) * 100);
        barColor = '#ef4444';
    } else if (statsIncidencias.tiempoPromedio > 24) {
        porcentajeBar = Math.min(100, ((statsIncidencias.tiempoPromedio - 24) / 48) * 100);
        barColor = '#f59e0b';
    } else if (statsIncidencias.tiempoPromedio > 0) {
        porcentajeBar = (statsIncidencias.tiempoPromedio / 24) * 100;
        barColor = '#10b981';
    }
    const barFill = document.getElementById('tiempoBarFill');
    barFill.style.width = `${porcentajeBar}%`;
    barFill.style.background = barColor;
}

function renderizarGraficoRiesgo() {
    const datos = calcularDatosPorRiesgo();
    const canvas = document.getElementById('graficoRiesgoSucursal');
    if (!canvas) return;
    
    // Forzar dimensiones CORRECTAS del canvas (ALTA RESOLUCIÓN)
    const container = canvas.parentElement;
    if (container) {
        const containerWidth = container.clientWidth;
        const containerHeight = Math.max(350, container.clientHeight);
        
        // Configurar el canvas con resolución nítida
        canvas.style.width = '100%';
        canvas.style.height = 'auto';
        canvas.style.maxHeight = '500px';
        canvas.style.minHeight = '350px';
        
        // Ajustar resolución interna del canvas (para que no se vea pixelado)
        const scale = window.devicePixelRatio || 2;
        const rect = canvas.getBoundingClientRect();
        if (rect.width > 0) {
            canvas.width = rect.width * scale;
            canvas.height = (rect.height || 400) * scale;
            canvas.style.width = `${rect.width}px`;
            canvas.style.height = `${rect.height || 400}px`;
        }
    }
    
    if (graficoRiesgo) {
        graficoRiesgo.destroy();
    }
    
    if (datos.data.length === 0) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Sin datos de riesgo', canvas.width / 2, canvas.height / 2);
        return;
    }
    
    // Crear gráfica de barras HORIZONTAL con ALTA RESOLUCIÓN
    graficoRiesgo = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: datos.labels,
            datasets: [{
                label: 'Incidencias',
                data: datos.data,
                backgroundColor: datos.colors,
                borderColor: datos.colors.map(c => c),
                borderWidth: 2,
                borderRadius: 10,
                barPercentage: 0.7,
                categoryPercentage: 0.85,
                barThickness: 'flex',
                maxBarThickness: 50,
                minBarLength: 5
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,  // CLAVE: permite que ocupe todo el espacio
            devicePixelRatio: window.devicePixelRatio || 2,  // ALTA RESOLUCIÓN
            layout: {
                padding: {
                    left: 10,
                    right: 25,
                    top: 20,
                    bottom: 10
                }
            },
            onClick: (event, activeElements) => {
                if (activeElements.length > 0) {
                    const index = activeElements[0].index;
                    const nivelSeleccionado = datos.nivelesInfo[index];
                    
                    if (nivelSeleccionado) {
                        const incidenciasFiltradas = incidenciasSucursal.filter(i => i.nivelRiesgo === nivelSeleccionado.id);
                        
                        if (incidenciasFiltradas.length === 0) {
                            Swal.fire({
                                icon: 'info',
                                title: 'Sin registros',
                                text: `No hay incidencias con nivel de riesgo: ${nivelSeleccionado.nombre}`,
                                background: 'var(--color-bg-primary)',
                                color: 'white'
                            });
                            return;
                        }
                        
                        mostrarRegistrosIncidenciasEnSweet(
                            incidenciasFiltradas,
                            `Incidencias: ${nivelSeleccionado.nombre}`,
                            `<i class="fas fa-exclamation-triangle" style="color: ${nivelSeleccionado.color}"></i>`
                        );
                    }
                }
            },
            plugins: {
                legend: {
                    labels: { 
                        color: 'white', 
                        font: { size: 12, weight: 'bold' },
                        boxWidth: 15,
                        padding: 10
                    },
                    position: 'top',
                    align: 'center'
                },
                tooltip: {
                    backgroundColor: 'rgba(0,0,0,0.85)',
                    titleColor: '#fff',
                    bodyColor: '#ddd',
                    borderColor: '#3b82f6',
                    borderWidth: 1,
                    callbacks: {
                        label: (ctx) => {
                            const total = datos.total;
                            const porcentaje = total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : 0;
                            return `${ctx.dataset.label}: ${ctx.raw} (${porcentaje}%)`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    grid: { 
                        color: 'rgba(255,255,255,0.12)',
                        lineWidth: 1,
                        drawBorder: true
                    },
                    ticks: { 
                        color: 'white', 
                        stepSize: 1,
                        font: { size: 11, weight: 'bold' },
                        callback: function(value) {
                            return Number.isInteger(value) ? value : '';
                        }
                    },
                    title: {
                        display: true,
                        text: 'Número de incidencias',
                        color: 'rgba(255,255,255,0.7)',
                        font: { size: 11 }
                    }
                },
                y: {
                    grid: { 
                        display: false,
                        drawBorder: true
                    },
                    ticks: { 
                        color: 'white', 
                        font: { size: 13, weight: 'bold' },
                        padding: 8
                    }
                }
            },
            // Mejorar renderizado para pantallas retina
            animation: {
                duration: 750,
                easing: 'easeInOutQuart'
            }
        }
    });
    
    window.graficoRiesgo = graficoRiesgo;
    canvas.style.cursor = 'pointer';
    
    // Forzar redibujado después de un pequeño delay (para asegurar dimensiones)
    setTimeout(() => {
        if (graficoRiesgo) {
            graficoRiesgo.resize();
            graficoRiesgo.update();
        }
    }, 100);
}

function renderizarTablaCategorias() {
    const datos = calcularDatosPorCategoria();
    const tbody = document.querySelector('#tablaCategoriasSucursal tbody');
    
    if (!tbody) return;
    
    if (datos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Sin datos</td></tr>';
        return;
    }
    
    tbody.innerHTML = datos.map(c => `
        <tr>
            <td>${escapeHTML(c.nombre)}</td>
            <td><span class="badge-value">${c.cantidad}</span></td>
            <td>${c.porcentaje.toFixed(1)}%</td>
        </tr>
    `).join('');
}

function renderizarGraficoPerdidasRecuperacion() {
    const stats = calcularEstadisticasRecuperacion();
    const canvas = document.getElementById('graficoPerdidasRecuperacion');
    if (!canvas) return;
    
    if (graficoPerdidasRecuperacion) {
        graficoPerdidasRecuperacion.destroy();
    }
    
    const perdidasData = stats.totalPerdido;
    const recuperacionesData = stats.totalRecuperado;
    const registros = registrosRecuperacionSucursal;
    
    graficoPerdidasRecuperacion = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: ['Pérdidas', 'Recuperaciones'],
            datasets: [{
                label: 'Monto total',
                data: [perdidasData, recuperacionesData],
                backgroundColor: ['#ef4444', '#10b981'],
                borderRadius: 8,
                borderWidth: 0,
                hoverBackgroundColor: ['#ff5555', '#22c55e']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            onClick: (event, activeElements) => {
                if (activeElements.length > 0) {
                    const index = activeElements[0].index;
                    
                    if (index === 0) {
                        const registrosConPerdida = registros.filter(r => (r.montoPerdido || 0) > 0);
                        
                        if (registrosConPerdida.length === 0) {
                            Swal.fire({
                                icon: 'info',
                                title: 'Sin registros',
                                text: 'No hay registros de pérdidas en esta sucursal',
                                background: 'var(--color-bg-primary)',
                                color: 'white'
                            });
                            return;
                        }
                        
                        mostrarRegistrosRecuperacionEnSweet(
                            registrosConPerdida,
                            'Registros de pérdidas',
                            '<i class="fas fa-arrow-down" style="color: #ef4444;"></i>'
                        );
                        
                    } else if (index === 1) {
                        const registrosConRecuperacion = registros.filter(r => (r.montoRecuperado || 0) > 0);
                        
                        if (registrosConRecuperacion.length === 0) {
                            Swal.fire({
                                icon: 'info',
                                title: 'Sin registros',
                                text: 'No hay registros de recuperaciones en esta sucursal',
                                background: 'var(--color-bg-primary)',
                                color: 'white'
                            });
                            return;
                        }
                        
                        mostrarRegistrosRecuperacionEnSweet(
                            registrosConRecuperacion,
                            'Registros de recuperaciones',
                            '<i class="fas fa-arrow-up" style="color: #10b981;"></i>'
                        );
                    }
                }
            },
            plugins: {
                legend: { 
                    labels: { color: 'white' } 
                },
                tooltip: { 
                    callbacks: { 
                        label: (ctx) => {
                            const formatter = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
                            const valor = ctx.raw;
                            return `${ctx.dataset.label}: ${formatter.format(valor)}`;
                        } 
                    } 
                }
            },
            scales: {
                y: { 
                    ticks: { 
                        callback: (value) => {
                            const formatter = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', notation: 'compact' });
                            return formatter.format(value);
                        }, 
                        color: '#aaa' 
                    }, 
                    grid: { color: 'rgba(255,255,255,0.05)' } 
                },
                x: { 
                    ticks: { color: 'white' }, 
                    grid: { display: false } 
                }
            }
        }
    });
    
    // Guardar referencia global
    window.graficoPerdidasRecuperacion = graficoPerdidasRecuperacion;
    canvas.style.cursor = 'pointer';
}

function renderizarTablaIncidenciasRecientes() {
    const tbody = document.querySelector('#tablaIncidenciasRecientes tbody');
    const gridContainer = document.getElementById('incidenciasGrid');
    
    if (!tbody) return;
    
    const incidenciasRecientes = [...incidenciasSucursal]
        .sort((a, b) => {
            const fechaA = a.fechaInicio instanceof Date ? a.fechaInicio : new Date(a.fechaInicio);
            const fechaB = b.fechaInicio instanceof Date ? b.fechaInicio : new Date(b.fechaInicio);
            return fechaB - fechaA;
        })
        .slice(0, 10);
    
    if (incidenciasRecientes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No hay incidencias registradas</td></tr>';
        if (gridContainer) {
            gridContainer.innerHTML = '<div class="incidencia-card" style="text-align:center; padding:20px;">No hay incidencias registradas</div>';
        }
        return;
    }
    
    // ========== RENDERIZAR TABLA (DESKTOP) ==========
    tbody.innerHTML = incidenciasRecientes.map(inc => {
        const fecha = inc.fechaInicio instanceof Date ? inc.fechaInicio.toLocaleDateString('es-MX') : (inc.fechaInicio ? new Date(inc.fechaInicio).toLocaleDateString('es-MX') : 'N/A');
        const riesgoColor = obtenerColorRiesgo(inc.nivelRiesgo);
        const riesgoTexto = inc.getNivelRiesgoTexto ? inc.getNivelRiesgoTexto() : (inc.nivelRiesgo || 'N/A');
        const estadoColor = inc.estado === 'finalizada' ? '#10b981' : '#f59e0b';
        const estadoTexto = inc.getEstadoTexto ? inc.getEstadoTexto() : (inc.estado || 'N/A');
        const detalles = inc.detalles ? (inc.detalles.length > 50 ? inc.detalles.substring(0, 50) + '...' : inc.detalles) : 'Sin detalles';
        const tienePDF = inc.pdfUrl && inc.pdfUrl.trim() !== '';
        
        return `
            <tr>
                <td><i class="fas fa-hashtag"></i> <span title="${inc.id}">${inc.id}</span></td>
                <td><i class="fas fa-calendar-alt"></i> ${fecha}</td>
                <td><span class="badge-riesgo" style="background: ${riesgoColor}20; color: ${riesgoColor};">${riesgoTexto}</span></td>
                <td><span class="badge-estado" style="background: ${estadoColor}20; color: ${estadoColor};">${estadoTexto}</span></td>
                <td>${escapeHTML(detalles)}</td>
                <td style="text-align: center;">
                    ${tienePDF ? 
                        `<button class="btn-pdf-mini" onclick="verPDFIncidencia('${inc.id}')"><i class="fas fa-file-pdf"></i> PDF</button>` : 
                        `<button class="btn-pdf-mini disabled" disabled><i class="fas fa-file-pdf"></i> Sin PDF</button>`
                    }
                </td>
            </tr>
        `;
    }).join('');
    
    // ========== RENDERIZAR TARJETAS (MÓVIL) - ESTILO incidencias.html ==========
    if (gridContainer) {
        gridContainer.innerHTML = incidenciasRecientes.map(inc => {
            const fecha = inc.fechaInicio instanceof Date ? inc.fechaInicio.toLocaleDateString('es-MX') : (inc.fechaInicio ? new Date(inc.fechaInicio).toLocaleDateString('es-MX') : 'N/A');
            const riesgoColor = obtenerColorRiesgo(inc.nivelRiesgo);
            const riesgoTexto = inc.getNivelRiesgoTexto ? inc.getNivelRiesgoTexto() : (inc.nivelRiesgo || 'N/A');
            const estadoColor = inc.estado === 'finalizada' ? '#10b981' : '#f59e0b';
            const estadoTexto = inc.getEstadoTexto ? inc.getEstadoTexto() : (inc.estado || 'N/A');
            const detalles = inc.detalles ? (inc.detalles.length > 80 ? inc.detalles.substring(0, 80) + '...' : inc.detalles) : 'Sin detalles';
            const idCorto = inc.id.length > 16 ? inc.id.substring(0, 14) + '...' : inc.id;
            const tienePDF = inc.pdfUrl && inc.pdfUrl.trim() !== '';
            
            return `
                <div class="incidencia-card" onclick="verDetallesIncidencia('${inc.id}')">
                    <div class="incidencia-header">
                        <span class="incidencia-id"><i class="fas fa-hashtag"></i> ${escapeHTML(idCorto)}</span>
                        <span class="incidencia-fecha"><i class="fas fa-calendar-alt"></i> ${fecha}</span>
                    </div>
                    <div class="incidencia-body">
                        <div class="incidencia-badges">
                            <span class="badge-riesgo-card" style="background: ${riesgoColor}20; color: ${riesgoColor};">${riesgoTexto}</span>
                            <span class="badge-estado-card" style="background: ${estadoColor}20; color: ${estadoColor};">${estadoTexto}</span>
                        </div>
                        <div class="incidencia-detalles">
                            <i class="fas fa-file-alt"></i> ${escapeHTML(detalles)}
                        </div>
                    </div>
                    <div class="incidencia-footer">
                        ${tienePDF ? 
                            `<button class="btn-pdf-card" onclick="event.stopPropagation(); verPDFIncidencia('${inc.id}')">
                                <i class="fas fa-file-pdf"></i> Ver PDF
                            </button>` : 
                            `<button class="btn-pdf-card disabled" disabled>
                                <i class="fas fa-file-pdf"></i> Sin PDF
                            </button>`
                        }
                    </div>
                </div>
            `;
        }).join('');
    }
}

// Función auxiliar para ver detalles desde la tarjeta
window.verDetallesIncidencia = function(incidenciaId) {
    window.location.href = `/usuarios/administrador/verIncidencias/verIncidencias.html?id=${incidenciaId}`;
};

// Función auxiliar para ver detalles (navegar a la incidencia)
window.verDetallesIncidencia = function(incidenciaId) {
    window.location.href = `/usuarios/administrador/verIncidencias/verIncidencias.html?id=${incidenciaId}`;
};

function actualizarFooter() {
    const fechaEl = document.getElementById('fechaActualizacion');
    if (fechaEl) {
        fechaEl.textContent = new Date().toLocaleString('es-MX');
    }
}

// =============================================
// UTILIDADES
// =============================================

function escapeHTML(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// =============================================
// FUNCIONES PARA SWEETALERTS
// =============================================

function mostrarRegistrosIncidenciasEnSweet(incidencias, titulo, icono) {
    if (!incidencias || incidencias.length === 0) {
        Swal.fire({
            icon: 'info',
            title: 'Sin registros',
            text: 'No hay incidencias para mostrar',
            background: 'var(--color-bg-primary)',
            color: 'white'
        });
        return;
    }

    const totalCriticas = incidencias.filter(i => i.nivelRiesgo === 'critico').length;
    const totalAltas = incidencias.filter(i => i.nivelRiesgo === 'alto').length;
    const totalPendientes = incidencias.filter(i => i.estado === 'pendiente').length;
    const totalFinalizadas = incidencias.filter(i => i.estado === 'finalizada').length;
    const incidenciasMostrar = incidencias.slice(0, 15);
    const hayMas = incidencias.length > 15;

    let registrosHtml = `
        <div class="swal-resumen-stats">
            <div class="swal-stats-grid">
                <div class="swal-stat-item" style="border-left-color: #8b5cf6;">
                    <span class="swal-stat-label">Total incidencias</span>
                    <span class="swal-stat-value">${incidencias.length}</span>
                </div>
                <div class="swal-stat-item" style="border-left-color: #ef4444;">
                    <span class="swal-stat-label">Críticas + Altas</span>
                    <span class="swal-stat-value" style="color: #ef4444;">${totalCriticas + totalAltas}</span>
                </div>
                <div class="swal-stat-item" style="border-left-color: #f59e0b;">
                    <span class="swal-stat-label">Pendientes</span>
                    <span class="swal-stat-value" style="color: #f59e0b;">${totalPendientes}</span>
                </div>
                <div class="swal-stat-item" style="border-left-color: #10b981;">
                    <span class="swal-stat-label">Finalizadas</span>
                    <span class="swal-stat-value" style="color: #10b981;">${totalFinalizadas}</span>
                </div>
            </div>
        </div>
        <div class="swal-registros-list">
    `;

    incidenciasMostrar.forEach(inc => {
        const fecha = inc.fechaInicio instanceof Date 
            ? inc.fechaInicio.toLocaleDateString('es-MX') 
            : (inc.fechaInicio ? new Date(inc.fechaInicio).toLocaleDateString('es-MX') : 'N/A');
        
        let estadoColor = '#6c757d', estadoIcon = 'fa-circle';
        if (inc.estado === 'finalizada') { 
            estadoColor = '#10b981'; 
            estadoIcon = 'fa-check-circle'; 
        } else if (inc.estado === 'pendiente') { 
            estadoColor = '#f59e0b'; 
            estadoIcon = 'fa-clock'; 
        }
        
        let riesgoColor = '#6c757d', riesgoIcon = 'fa-chart-line';
        let riesgoTexto = inc.nivelRiesgo ? inc.nivelRiesgo.charAt(0).toUpperCase() + inc.nivelRiesgo.slice(1) : 'N/A';
        if (inc.nivelRiesgo === 'critico') { 
            riesgoColor = '#ef4444'; 
            riesgoIcon = 'fa-exclamation-triangle'; 
        } else if (inc.nivelRiesgo === 'alto') { 
            riesgoColor = '#f97316'; 
            riesgoIcon = 'fa-exclamation-circle'; 
        } else if (inc.nivelRiesgo === 'medio') { 
            riesgoColor = '#eab308'; 
            riesgoIcon = 'fa-chart-simple'; 
        } else if (inc.nivelRiesgo === 'bajo') { 
            riesgoColor = '#10b981'; 
            riesgoIcon = 'fa-check'; 
        }
        
        const detalles = inc.detalles 
            ? (inc.detalles.length > 80 ? inc.detalles.substring(0, 80) + '...' : inc.detalles) 
            : 'Sin detalles';
        
        const categoriaNombre = obtenerNombreCategoria(inc.categoriaId);
        
        registrosHtml += `
            <div class="swal-registro-card" data-incidencia-id="${inc.id}">
                <div class="swal-card-header">
                    <span class="swal-id"><i class="fas fa-hashtag"></i> ${escapeHTML(inc.id)}</span>
                    <span class="swal-fecha"><i class="fas fa-calendar-alt"></i> ${fecha}</span>
                </div>
                <div class="swal-card-body">
                    <div class="swal-info-principal">
                        <div class="swal-sucursal">
                            <i class="fas fa-store"></i> ${escapeHTML(sucursalActual?.nombre || 'Sin asignar')}
                        </div>
                        <div class="swal-tipo-evento">
                            <i class="fas ${riesgoIcon}" style="color: ${riesgoColor};"></i> ${riesgoTexto}
                            <span class="swal-estado-badge" style="margin-left: 8px; color: ${estadoColor};">
                                <i class="fas ${estadoIcon}"></i> ${inc.estado ? inc.estado.charAt(0).toUpperCase() + inc.estado.slice(1) : 'N/A'}
                            </span>
                        </div>
                    </div>
                    <div class="swal-montos">
                        <span class="swal-monto-perdido"><i class="fas fa-tag"></i> ${escapeHTML(categoriaNombre)}</span>
                        <span class="swal-monto-recuperado"><i class="fas fa-user"></i> ${escapeHTML(inc.creadoPorNombre || 'N/A')}</span>
                    </div>
                </div>
                <div class="swal-card-footer">
                    <div class="swal-narracion">
                        <i class="fas fa-file-alt"></i>
                        <span>${escapeHTML(detalles)}</span>
                    </div>
                </div>
            </div>
        `;
    });

    if (hayMas) {
        registrosHtml += `<div class="swal-mas-registros"><i class="fas fa-ellipsis-h"></i> y ${incidencias.length - 15} incidencias más.</div>`;
    }
    
    registrosHtml += `</div>`;

    Swal.fire({
        title: `${icono || ''} ${titulo}`,
        html: registrosHtml,
        width: '880px',
        background: 'transparent',
        showConfirmButton: true,
        confirmButtonText: '<i class="fas fa-check"></i> Cerrar',
        confirmButtonColor: '#28a745',
        customClass: { 
            popup: 'swal2-popup-custom', 
            title: 'swal2-title-custom', 
            confirmButton: 'swal2-confirm' 
        },
        backdrop: `rgba(0,0,0,0.8) left top no-repeat`
    });
}

function mostrarRegistrosRecuperacionEnSweet(registros, titulo, icono) {
    if (!registros || registros.length === 0) {
        Swal.fire({
            icon: 'info',
            title: 'Sin registros',
            text: 'No hay registros para mostrar',
            background: 'var(--color-bg-primary)',
            color: 'white'
        });
        return;
    }

    const formatter = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
    const totalPerdido = registros.reduce((acc, r) => acc + (r.montoPerdido || 0), 0);
    const totalRecuperado = registros.reduce((acc, r) => acc + (r.montoRecuperado || 0), 0);
    const registrosMostrar = registros.slice(0, 15);
    const hayMas = registros.length > 15;

    let registrosHtml = `
        <div class="swal-resumen-stats">
            <div class="swal-stats-grid">
                <div class="swal-stat-item" style="border-left-color: #8b5cf6;">
                    <span class="swal-stat-label">Total registros</span>
                    <span class="swal-stat-value">${registros.length}</span>
                </div>
                <div class="swal-stat-item" style="border-left-color: #ef4444;">
                    <span class="swal-stat-label">Total perdido</span>
                    <span class="swal-stat-value" style="color: #ef4444;">${formatter.format(totalPerdido)}</span>
                </div>
                <div class="swal-stat-item" style="border-left-color: #10b981;">
                    <span class="swal-stat-label">Total recuperado</span>
                    <span class="swal-stat-value" style="color: #10b981;">${formatter.format(totalRecuperado)}</span>
                </div>
            </div>
        </div>
        <div class="swal-registros-list">
    `;

    registrosMostrar.forEach(registro => {
        const fecha = registro.fecha ? new Date(registro.fecha).toLocaleDateString('es-MX') : 'N/A';
        const tipoTexto = registro.tipoEvento || 'N/A';
        
        let tipoIcon = 'fa-tag', tipoDisplay = tipoTexto;
        if (tipoTexto === 'robo') { tipoIcon = 'fa-mask'; tipoDisplay = 'Robo'; }
        else if (tipoTexto === 'extravio') { tipoIcon = 'fa-map-marker-alt'; tipoDisplay = 'Extravío'; }
        else if (tipoTexto === 'accidente') { tipoIcon = 'fa-circle-exclamation'; tipoDisplay = 'Accidente'; }
        
        const narracion = registro.narracionEventos 
            ? (registro.narracionEventos.length > 100 ? registro.narracionEventos.substring(0, 100) + '...' : registro.narracionEventos)
            : 'Sin descripción';

        registrosHtml += `
            <div class="swal-registro-card">
                <div class="swal-card-header">
                    <span class="swal-id"><i class="fas fa-hashtag"></i> ${escapeHTML(registro.id.substring(0, 12))}...</span>
                    <span class="swal-fecha"><i class="fas fa-calendar-alt"></i> ${fecha}</span>
                </div>
                <div class="swal-card-body">
                    <div class="swal-info-principal">
                        <div class="swal-sucursal">
                            <i class="fas fa-store"></i> ${escapeHTML(registro.nombreEmpresaCC || 'Sin asignar')}
                        </div>
                        <div class="swal-tipo-evento">
                            <i class="fas ${tipoIcon}"></i> ${tipoDisplay}
                        </div>
                    </div>
                    <div class="swal-montos">
                        <span class="swal-monto-perdido"><i class="fas fa-arrow-down"></i> ${formatter.format(registro.montoPerdido || 0)}</span>
                        <span class="swal-monto-recuperado"><i class="fas fa-arrow-up"></i> ${formatter.format(registro.montoRecuperado || 0)}</span>
                    </div>
                </div>
                <div class="swal-card-footer">
                    <div class="swal-narracion">
                        <i class="fas fa-file-alt"></i>
                        <span>${escapeHTML(narracion)}</span>
                    </div>
                </div>
            </div>
        `;
    });

    if (hayMas) {
        registrosHtml += `<div class="swal-mas-registros"><i class="fas fa-ellipsis-h"></i> y ${registros.length - 15} registros más.</div>`;
    }
    
    registrosHtml += `</div>`;

    Swal.fire({
        title: `${icono || ''} ${titulo}`,
        html: registrosHtml,
        width: '880px',
        background: 'transparent',
        showConfirmButton: true,
        confirmButtonText: '<i class="fas fa-check"></i> Cerrar',
        confirmButtonColor: '#28a745',
        customClass: { popup: 'swal2-popup-custom', title: 'swal2-title-custom', confirmButton: 'swal2-confirm' },
        backdrop: `rgba(0,0,0,0.8) left top no-repeat`
    });
}

// =============================================
// FUNCIONES PARA OCULTAR/MOSTRAR SECCIONES SEGÚN DATOS
// =============================================

function ocultarSeccionesSinDatos() {
    const statsIncidencias = calcularEstadisticasIncidencias();
    const statsRecuperacion = calcularEstadisticasRecuperacion();
    const datosRiesgo = calcularDatosPorRiesgo();
    const datosCategoria = calcularDatosPorCategoria();
    
    const kpisGrid = document.querySelector('.kpis-grid');
    if (statsIncidencias.total === 0 && kpisGrid) {
        kpisGrid.style.display = 'none';
    } else if (kpisGrid) {
        kpisGrid.style.display = 'grid';
    }
    
    const cardRiesgo = document.querySelector('.charts-row .card:first-child');
    if (datosRiesgo.data.length === 0 && cardRiesgo) {
        cardRiesgo.style.display = 'none';
    } else if (cardRiesgo) {
        cardRiesgo.style.display = 'block';
    }
    
    const cardCategorias = document.querySelectorAll('.charts-row .card')[1];
    if (datosCategoria.length === 0 && cardCategorias) {
        cardCategorias.style.display = 'none';
    } else if (cardCategorias) {
        cardCategorias.style.display = 'block';
    }
    
    const chartsRow = document.querySelector('.charts-row');
    const riesgoVisible = cardRiesgo && cardRiesgo.style.display !== 'none';
    const categoriasVisible = cardCategorias && cardCategorias.style.display !== 'none';
    
    if (chartsRow) {
        if (!riesgoVisible && !categoriasVisible) {
            chartsRow.style.display = 'none';
        } else if (!riesgoVisible || !categoriasVisible) {
            chartsRow.style.gridTemplateColumns = '1fr';
        } else {
            chartsRow.style.gridTemplateColumns = 'repeat(2, 1fr)';
        }
    }
    
    const cardTiempo = document.querySelectorAll('.charts-row')[1]?.querySelector('.card:first-child');
    if (statsIncidencias.finalizadas === 0 && cardTiempo) {
        cardTiempo.style.display = 'none';
    } else if (cardTiempo) {
        cardTiempo.style.display = 'block';
    }
    
    const cardPerdidas = document.querySelectorAll('.charts-row')[1]?.querySelector('.card:last-child');
    if (statsRecuperacion.totalPerdido === 0 && statsRecuperacion.totalRecuperado === 0 && cardPerdidas) {
        cardPerdidas.style.display = 'none';
    } else if (cardPerdidas) {
        cardPerdidas.style.display = 'block';
    }
    
    const segundaFila = document.querySelectorAll('.charts-row')[1];
    const tiempoVisible = cardTiempo && cardTiempo.style.display !== 'none';
    const perdidasVisible = cardPerdidas && cardPerdidas.style.display !== 'none';
    
    if (segundaFila) {
        if (!tiempoVisible && !perdidasVisible) {
            segundaFila.style.display = 'none';
        } else if (!tiempoVisible || !perdidasVisible) {
            segundaFila.style.gridTemplateColumns = '1fr';
        } else {
            segundaFila.style.gridTemplateColumns = 'repeat(2, 1fr)';
        }
    }
    
    const cardIncidencias = document.querySelector('.card.full-width');
    if (statsIncidencias.total === 0 && cardIncidencias) {
        cardIncidencias.style.display = 'none';
    } else if (cardIncidencias) {
        cardIncidencias.style.display = 'block';
    }
}

// =============================================
// FUNCIÓN GLOBAL PARA VER PDF
// =============================================

window.verPDFIncidencia = async function(incidenciaId) {
    try {
        const incidencia = incidenciasSucursal.find(i => i.id === incidenciaId);
        
        if (!incidencia) {
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'No se encontró la incidencia'
            });
            return;
        }
        
        if (!incidencia.pdfUrl || incidencia.pdfUrl.trim() === '') {
            Swal.fire({
                icon: 'warning',
                title: 'PDF no disponible',
                text: 'Esta incidencia aún no tiene un PDF asociado.',
                confirmButtonText: 'Entendido'
            });
            return;
        }
        
        window.open(incidencia.pdfUrl, '_blank');
        
    } catch (error) {
        console.error('Error al abrir PDF:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'No se pudo abrir el PDF: ' + error.message
        });
    }
};

// =============================================
// INICIALIZACIÓN PRINCIPAL
// =============================================

async function inicializarDetalleSucursal() {
    try {
        await obtenerDatosOrganizacion();
        await inicializarManagers();
        await cargarCategorias();
        await cargarNivelesRiesgo ();
        
        const sucursalCargada = await cargarSucursal();
        if (!sucursalCargada) return;
        
        await cargarIncidenciasSucursal();
        await cargarRegistrosRecuperacionSucursal();
        
        actualizarKPIs();
        renderizarGraficoRiesgo();
        renderizarTablaCategorias();
        renderizarGraficoPerdidasRecuperacion();
        renderizarTablaIncidenciasRecientes();
        actualizarFooter();
        
        ocultarSeccionesSinDatos();
        
        document.getElementById('btnVolver').addEventListener('click', () => {
            window.history.back();
        });
        
        const btnPDF = document.getElementById('btnPDFSucursal');
        if (btnPDF) {
            btnPDF.addEventListener('click', async () => {
                try {
                    Swal.fire({
                        title: 'Generando PDF...',
                        text: 'Preparando el reporte de la sucursal',
                        allowOutsideClick: false,
                        didOpen: () => {
                            Swal.showLoading();
                        }
                    });
                    
                    // Cambiar gráficas a modo PDF (texto negro)
                    cambiarGraficasAModoPDF();
                    
                    // Esperar a que se apliquen los cambios
                    await new Promise(resolve => setTimeout(resolve, 300));
                    
                    // Recapturar gráficas con los nuevos colores
                    const chartImages = await recapturarGraficasConNuevosColores();
                    const regionInfo = await sucursalActual.getRegionInfo();
                    
                    const { generadorPDFSucursalDetalle } = await import('/components/pdfEstadisticasSucursales.js');
                    
                    generadorPDFSucursalDetalle.configurar({
                        organizacionActual: organizacionActual,
                        sucursalActual: sucursalActual,
                        incidenciasSucursal: incidenciasSucursal,
                        registrosRecuperacionSucursal: registrosRecuperacionSucursal,
                        statsIncidencias: calcularEstadisticasIncidencias(),
                        statsRecuperacion: calcularEstadisticasRecuperacion(),
                        datosPorRiesgo: calcularDatosPorRiesgo(),
                        datosPorCategoria: calcularDatosPorCategoria(),
                        regionInfo: regionInfo,
                        chartImages: chartImages
                    });
                    
                    await generadorPDFSucursalDetalle.generarReporte();
                    
                    // Restaurar gráficas a modo normal (texto blanco)
                    restaurarGraficasAModoNormal();
                    
                    Swal.close();
                    
                } catch (error) {
                    console.error('Error generando PDF:', error);
                    restaurarGraficasAModoNormal();
                    Swal.close();
                    Swal.fire({
                        icon: 'error',
                        title: 'Error',
                        text: 'No se pudo generar el PDF: ' + error.message
                    });
                }
            });
        }
        
    } catch (error) {
        console.error('Error inicializando detalle:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'No se pudo cargar la página: ' + error.message
        });
    }
}

// Iniciar
document.addEventListener('DOMContentLoaded', inicializarDetalleSucursal);