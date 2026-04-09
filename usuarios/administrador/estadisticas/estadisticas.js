// =============================================
// estadisticas.js - VERSIÓN CORREGIDA
// CON TIEMPO PROMEDIO DE RESOLUCIÓN FUNCIONAL
// =============================================

// =============================================
// VARIABLES GLOBALES
// =============================================
let estadisticasManager = null;
let incidenciaManager = null;
let organizacionActual = null;
let incidenciasCache = [];
let incidenciasFiltradas = [];
let sucursalesCache = [];
let categoriasCache = [];
let charts = {};
let authToken = null;
let historialManager = null;
let accesoVistaRegistrado = false;

// Almacenar datos originales para los clics
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

// Filtros activos
let filtrosActivos = {
    fechaInicio: null,
    fechaFin: null,
    categoriaId: 'todas',
    sucursalId: 'todas',
    colaboradorId: 'todos',
    busqueda: ''
};

// =============================================
// INICIALIZACIÓN
//==============================================
document.addEventListener('DOMContentLoaded', async function () {
    try {
        await inicializarHistorial();
        await inicializarEstadisticasManager();
        await obtenerTokenAuth();
        configurarFiltros();
        await Promise.all([
            cargarSucursales(),
            cargarCategorias()
        ]);
        establecerFechasPorDefecto();
        await registrarAccesoVistaEstadisticas();
    } catch (error) {
        console.error('Error al inicializar estadísticas:', error);
        mostrarError('Error al cargar la página: ' + error.message);
    }
});

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

async function inicializarHistorial() {
    try {
        const { HistorialUsuarioManager } = await import('/clases/historialUsuario.js');
        historialManager = new HistorialUsuarioManager();
    } catch (error) {
        console.error('Error inicializando historialManager:', error);
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
                organizacionCamelCase: data.organizacionCamelCase,
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
                organizacionCamelCase: userData.organizacionCamelCase,
                correoElectronico: userData.correo || userData.email || ''
            };
        }

        return null;
    } catch (error) {
        console.error('Error obteniendo usuario actual:', error);
        return null;
    }
}

async function registrarAccesoVistaEstadisticas() {
    if (!historialManager) return;
    if (accesoVistaRegistrado) return;

    try {
        const usuario = obtenerUsuarioActual();
        if (!usuario) return;

        await historialManager.registrarActividad({
            usuario: usuario,
            tipo: 'leer',
            modulo: 'estadisticas',
            descripcion: 'Accedió al módulo de estadísticas',
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

async function registrarAplicacionFiltros(filtrosAplicados, totalIncidencias) {
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

        await historialManager.registrarActividad({
            usuario: usuario,
            tipo: 'leer',
            modulo: 'estadisticas',
            descripcion: `Aplicó filtros en estadísticas - ${totalIncidencias} incidencias encontradas`,
            detalles: {
                filtros: filtrosDetalles,
                totalIncidencias: totalIncidencias,
                fechaAplicacion: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('Error registrando aplicación de filtros:', error);
    }
}

async function registrarGeneracionPDFReporte(totalIncidencias, filtrosAplicados) {
    if (!historialManager) return;

    try {
        const usuario = obtenerUsuarioActual();
        if (!usuario) return;

        await historialManager.registrarActividad({
            usuario: usuario,
            tipo: 'leer',
            modulo: 'estadisticas',
            descripcion: `Generó reporte PDF de estadísticas - ${totalIncidencias} incidencias`,
            detalles: {
                totalIncidencias: totalIncidencias,
                filtrosAplicados: {
                    fechaInicio: filtrosAplicados.fechaInicio,
                    fechaFin: filtrosAplicados.fechaFin,
                    categoria: filtrosAplicados.categoriaId !== 'todas' ?
                        categoriasCache.find(c => c.id === filtrosAplicados.categoriaId)?.nombre : 'todas',
                    sucursal: filtrosAplicados.sucursalId !== 'todas' ?
                        sucursalesCache.find(s => s.id === filtrosAplicados.sucursalId)?.nombre : 'todas',
                    colaborador: filtrosAplicados.colaboradorId !== 'todos' ? filtrosAplicados.colaboradorId : 'todos'
                },
                fechaGeneracion: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('Error registrando generación de PDF:', error);
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
            detalles: {
                fechaLimpieza: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('Error registrando limpieza de filtros:', error);
    }
}

// =============================================
// OBTENER TOKEN DE AUTENTICACIÓN
// =============================================
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
            if (token) {
                authToken = token;
            }
        }
    } catch (error) {
        authToken = null;
    }
}

// =============================================
// MOSTRAR/MOVER SECCIÓN DE RESULTADOS
// =============================================
function mostrarResultados() {
    const welcomeMsg = document.getElementById('welcomeMessage');
    const resultadosSection = document.getElementById('resultadosSection');

    if (welcomeMsg) welcomeMsg.style.display = 'none';
    if (resultadosSection) {
        resultadosSection.classList.add('visible');
    }
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
            if (charts[id]) {
                delete charts[id];
            }
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.font = '16px Arial';
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.textAlign = 'center';
            ctx.fillText('📭 Sin resultados con los filtros actuales', canvas.width / 2, canvas.height / 2);
        }
    });

    const tablaColab = document.getElementById('tablaColaboradoresBody');
    if (tablaColab) {
        tablaColab.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:40px;"><i class="fas fa-search" style="font-size: 32px; opacity: 0.3; margin-bottom: 10px;"></i><br>No hay incidencias que coincidan con los filtros</td</tr>';
    }

    const tablaCat = document.getElementById('tablaCategoriasBody');
    if (tablaCat) {
        tablaCat.innerHTML = '<tr><td colspan="2" style="text-align:center; padding:40px;"><i class="fas fa-search" style="font-size: 32px; opacity: 0.3; margin-bottom: 10px;"></i><br>No hay incidencias que coincidan con los filtros</td</tr>';
    }

    setElementText('metricCriticas', '0');
    setElementText('metricAltas', '0');
    setElementText('metricPendientes', '0');
    setElementText('metricTotal', '0');
    setElementText('metricCriticasPorcentaje', '0% del total');
    setElementText('metricAltasPorcentaje', '0% del total');
    setElementText('metricPendientesPorcentaje', '0% pendientes');
    setElementText('metricFinalizadasPorcentaje', '0% resueltas');
}

// =============================================
// INICIALIZACIÓN DE MANAGERS
// =============================================
async function inicializarEstadisticasManager() {
    try {
        await obtenerDatosOrganizacion();

        const { IncidenciaManager } = await import('/clases/incidencia.js');
        const { EstadisticasManager } = await import('/clases/estadistica.js');

        incidenciaManager = new IncidenciaManager();
        estadisticasManager = new EstadisticasManager();

        return true;
    } catch (error) {
        console.error('Error al inicializar managers:', error);
        mostrarErrorInicializacion();
        return false;
    }
}

async function obtenerDatosOrganizacion() {
    try {
        if (window.userManager && window.userManager.currentUser) {
            const user = window.userManager.currentUser;
            organizacionActual = {
                nombre: user.organizacion || 'Mi Empresa',
                camelCase: user.organizacionCamelCase || ''
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

// =============================================
// CARGA DE DATOS AUXILIARES
// =============================================
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

// =============================================
// CONFIGURAR FILTROS
// =============================================
function configurarFiltros() {
    document.getElementById('btnAplicarFiltros')?.addEventListener('click', aplicarFiltros);
    document.getElementById('btnLimpiarFiltros')?.addEventListener('click', limpiarFiltros);

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

// =============================================
// APLICAR FILTROS (FUNCIÓN PRINCIPAL)
// =============================================
async function aplicarFiltros() {
    const nuevosFiltros = {
        fechaInicio: document.getElementById('filtroFechaInicio')?.value || null,
        fechaFin: document.getElementById('filtroFechaFin')?.value || null,
        categoriaId: document.getElementById('filtroCategoria')?.value || 'todas',
        sucursalId: document.getElementById('filtroSucursal')?.value || 'todas',
        colaboradorId: document.getElementById('filtroColaborador')?.value || 'todos',
        busqueda: document.getElementById('buscarIncidencias')?.value || ''
    };

    filtrosActivos = nuevosFiltros;

    await cargarIncidencias();

    if (incidenciasFiltradas && incidenciasFiltradas.length > 0) {
        await registrarAplicacionFiltros(filtrosActivos, incidenciasFiltradas.length);
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
    const buscar = document.getElementById('buscarIncidencias');

    if (fechaInicio) fechaInicio.value = hace30Dias.toISOString().split('T')[0];
    if (fechaFin) fechaFin.value = hoy.toISOString().split('T')[0];
    if (filtroCategoria) filtroCategoria.value = 'todas';
    if (filtroSucursal) filtroSucursal.value = 'todas';
    if (filtroColaborador) filtroColaborador.value = 'todos';
    if (buscar) buscar.value = '';

    filtrosActivos = {
        fechaInicio: hace30Dias.toISOString().split('T')[0],
        fechaFin: hoy.toISOString().split('T')[0],
        categoriaId: 'todas',
        sucursalId: 'todas',
        colaboradorId: 'todos',
        busqueda: ''
    };

    await registrarLimpiezaFiltros();
    await cargarIncidencias();
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

        if (filtrosActivos.categoriaId !== 'todas' && inc.categoriaId !== filtrosActivos.categoriaId) {
            return false;
        }

        if (filtrosActivos.sucursalId !== 'todas' && inc.sucursalId !== filtrosActivos.sucursalId) {
            return false;
        }

        if (filtrosActivos.colaboradorId !== 'todos') {
            const coincideColaborador =
                inc.creadoPorNombre === filtrosActivos.colaboradorId ||
                inc.actualizadoPorNombre === filtrosActivos.colaboradorId;

            if (!coincideColaborador) return false;
        }

        if (filtrosActivos.busqueda) {
            const busqueda = filtrosActivos.busqueda.toLowerCase();
            const coincide =
                inc.id?.toLowerCase().includes(busqueda) ||
                inc.detalles?.toLowerCase().includes(busqueda) ||
                (inc.creadoPorNombre && inc.creadoPorNombre.toLowerCase().includes(busqueda));

            if (!coincide) return false;
        }

        return true;
    });
}

// =============================================
// CARGAR INCIDENCIAS Y GENERAR GRÁFICAS
// =============================================
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

        const datos = procesarDatosGraficas(incidenciasFiltradas);

        // Guardar datos para los clics
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

        if (datos.colaboradores && datos.colaboradores.length > 0) {
            renderizarTablaColaboradores(datos.colaboradores);
        } else {
            renderizarTablaColaboradores([]);
        }

        if (datos.categoriasData && datos.categoriasData.length > 0) {
            renderizarTablaCategorias(datos.categoriasData);
        } else {
            renderizarTablaCategorias([]);
        }

        if (datos.colaboradores && datos.colaboradores.length > 0) {
            cargarFiltroColaboradores(datos.colaboradores);
        }

        const fechaEl = document.getElementById('fechaActualizacion');
        if (fechaEl) {
            fechaEl.textContent = new Date().toLocaleString('es-MX');
        }

        // Debug: Verificar que los tiempos promedio se cargaron correctamente
        console.log('Tiempos promedio calculados:', datos.tiemposPromedio);

    } catch (error) {
        console.error('Error al cargar incidencias:', error);
        mostrarError('Error al cargar estadísticas: ' + error.message);
    }
}

// =============================================
// PROCESAR DATOS PARA LAS 8 GRÁFICAS
// =============================================
function procesarDatosGraficas(incidencias) {

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
            const nombre = inc.actualizadoPorNombre;
            actualizacionesPorColaborador.set(nombre, (actualizacionesPorColaborador.get(nombre) || 0) + 1);
        }
    });

    const topActualizadores = Array.from(actualizacionesPorColaborador.entries())
        .map(([nombre, cantidad]) => ({ nombre, cantidad }))
        .sort((a, b) => b.cantidad - a.cantidad)
        .slice(0, 5);

    const reportesPorColaborador = new Map();
    incidencias.forEach(inc => {
        if (inc.creadoPorNombre) {
            const nombre = inc.creadoPorNombre;
            reportesPorColaborador.set(nombre, (reportesPorColaborador.get(nombre) || 0) + 1);
        }
    });

    const topReportadores = Array.from(reportesPorColaborador.entries())
        .map(([nombre, cantidad]) => ({ nombre, cantidad }))
        .sort((a, b) => b.cantidad - a.cantidad)
        .slice(0, 5);

    const seguimientosPorColaborador = new Map();
    incidencias.forEach(inc => {
        if (inc.seguimiento) {
            Object.values(inc.seguimiento).forEach(seg => {
                if (seg.usuarioNombre) {
                    const nombre = seg.usuarioNombre;
                    seguimientosPorColaborador.set(nombre, (seguimientosPorColaborador.get(nombre) || 0) + 1);
                }
            });
        }
    });

    const topSeguimientos = Array.from(seguimientosPorColaborador.entries())
        .map(([nombre, cantidad]) => ({ nombre, cantidad }))
        .sort((a, b) => b.cantidad - a.cantidad)
        .slice(0, 5);

    const estadoData = {
        pendientes: metricas.pendientes,
        finalizadas: metricas.finalizadas
    };

    const riesgoData = {
        critico: metricas.criticas,
        alto: metricas.altas,
        medio: metricas.medias,
        bajo: metricas.bajas
    };

    const categoriasMap = new Map();
    incidencias.forEach(inc => {
        if (inc.categoriaId) {
            const nombre = obtenerNombreCategoria(inc.categoriaId);
            categoriasMap.set(nombre, (categoriasMap.get(nombre) || 0) + 1);
        }
    });

    const categoriasData = Array.from(categoriasMap.entries())
        .map(([nombre, cantidad]) => ({ nombre, cantidad }))
        .sort((a, b) => b.cantidad - a.cantidad)
        .slice(0, 5);

    const sucursalesMap = new Map();
    incidencias.forEach(inc => {
        if (inc.sucursalId) {
            const nombre = obtenerNombreSucursal(inc.sucursalId);
            sucursalesMap.set(nombre, (sucursalesMap.get(nombre) || 0) + 1);
        }
    });

    const sucursalesData = Array.from(sucursalesMap.entries())
        .map(([nombre, cantidad]) => ({ nombre, cantidad }))
        .sort((a, b) => b.cantidad - a.cantidad)
        .slice(0, 5);

    // =============================================
    // CÁLCULO CORREGIDO DEL TIEMPO PROMEDIO DE RESOLUCIÓN
    // =============================================
    const tiemposResolucion = new Map();

    // Filtrar solo incidencias finalizadas que tienen fecha de finalización
    const incidenciasFinalizadas = incidencias.filter(i =>
        i.estado === 'finalizada' && i.fechaFinalizacion && i.fechaInicio
    );

    incidenciasFinalizadas.forEach(inc => {
        if (inc.actualizadoPorNombre) {
            const inicio = inc.fechaInicio instanceof Date ? inc.fechaInicio : new Date(inc.fechaInicio);
            const fin = inc.fechaFinalizacion instanceof Date ? inc.fechaFinalizacion : new Date(inc.fechaFinalizacion);

            // Calcular diferencia en horas
            const diferenciaMs = fin - inicio;
            const tiempoHoras = Math.round(diferenciaMs / (1000 * 60 * 60));

            // Solo considerar tiempos positivos y razonables (menos de 720 horas = 30 días)
            if (tiempoHoras > 0 && tiempoHoras < 720) {
                if (!tiemposResolucion.has(inc.actualizadoPorNombre)) {
                    tiemposResolucion.set(inc.actualizadoPorNombre, {
                        total: 0,
                        count: 0
                    });
                }
                const data = tiemposResolucion.get(inc.actualizadoPorNombre);
                data.total += tiempoHoras;
                data.count++;
            }
        }
    });

    // Calcular promedios y filtrar colaboradores con al menos una incidencia resuelta
    const tiemposPromedio = Array.from(tiemposResolucion.entries())
        .map(([nombre, data]) => ({
            nombre: nombre,
            promedio: data.count > 0 ? Math.round(data.total / data.count) : 0
        }))
        .filter(t => t.promedio > 0)
        .sort((a, b) => a.promedio - b.promedio)  // Ordenar de menor a mayor (mejores tiempos primero)
        .slice(0, 8);  // Mostrar hasta 8 colaboradores

    // Debug: Verificar resultados
    console.log('Incidencias finalizadas:', incidenciasFinalizadas.length);
    console.log('Tiempos resolución calculados:', tiemposPromedio);

    // =============================================
    // DATOS DE COLABORADORES PARA LA TABLA
    // =============================================
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

            if (inc.estado === 'finalizada') {
                col.incidenciasResueltas++;
            }
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

    // Calcular tiempo total por colaborador para incidencias resueltas
    incidenciasFinalizadas.forEach(inc => {
        if (inc.actualizadoPorNombre && colaboradoresMap.has(inc.actualizadoPorNombre)) {
            const inicio = inc.fechaInicio instanceof Date ? inc.fechaInicio : new Date(inc.fechaInicio);
            const fin = inc.fechaFinalizacion instanceof Date ? inc.fechaFinalizacion : new Date(inc.fechaFinalizacion);
            const tiempo = Math.round((fin - inicio) / (1000 * 60 * 60));

            if (tiempo > 0 && tiempo < 720) {
                const col = colaboradoresMap.get(inc.actualizadoPorNombre);
                col.tiempoTotal += tiempo;
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

// =============================================
// ACTUALIZAR MÉTRICAS PRINCIPALES
// =============================================
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

// =============================================
// FUNCIONES PARA SWEETALERT DE CADA GRÁFICA
// =============================================

function mostrarRegistrosEnSweet(incidencias, titulo, iconoHtml) {
    if (!incidencias || incidencias.length === 0) {
        Swal.fire({
            icon: 'info',
            title: 'Sin registros',
            text: 'No hay incidencias para mostrar',
            background: '#1a1a1a',
            color: '#fff',
            customClass: {
                popup: 'swal2-popup-custom'
            }
        });
        return;
    }

    const totalIncidencias = incidencias.length;
    const pendientes = incidencias.filter(i => i.estado === 'pendiente').length;
    const finalizadas = incidencias.filter(i => i.estado === 'finalizada').length;
    const criticas = incidencias.filter(i => i.nivelRiesgo === 'critico').length;
    const altas = incidencias.filter(i => i.nivelRiesgo === 'alto').length;

    const incidenciasMostrar = incidencias.slice(0, 15);
    const hayMas = incidencias.length > 15;

    let registrosHtml = `
        <div class="swal-resumen-stats">
            <div class="swal-stats-grid">
                <div class="swal-stat-item" style="border-left-color: #8b5cf6;">
                    <span class="swal-stat-label">Total incidencias</span>
                    <span class="swal-stat-value">${totalIncidencias}</span>
                </div>
                <div class="swal-stat-item" style="border-left-color: #f59e0b;">
                    <span class="swal-stat-label">Pendientes</span>
                    <span class="swal-stat-value" style="color: #f59e0b;">${pendientes}</span>
                </div>
                <div class="swal-stat-item" style="border-left-color: #10b981;">
                    <span class="swal-stat-label">Finalizadas</span>
                    <span class="swal-stat-value" style="color: #10b981;">${finalizadas}</span>
                </div>
                <div class="swal-stat-item" style="border-left-color: #ef4444;">
                    <span class="swal-stat-label">Críticas + Altas</span>
                    <span class="swal-stat-value" style="color: #ef4444;">${criticas + altas}</span>
                </div>
            </div>
        </div>
        <div class="swal-registros-list">
    `;

    incidenciasMostrar.forEach(inc => {
        const fecha = inc.fechaInicio instanceof Date ? inc.fechaInicio.toLocaleDateString('es-MX') :
            (inc.fechaInicio ? new Date(inc.fechaInicio).toLocaleDateString('es-MX') : 'N/A');

        let estadoColor = '#6c757d';
        let estadoIcon = 'fa-circle';
        if (inc.estado === 'finalizada') {
            estadoColor = '#10b981';
            estadoIcon = 'fa-check-circle';
        } else if (inc.estado === 'pendiente') {
            estadoColor = '#f59e0b';
            estadoIcon = 'fa-clock';
        }

        let riesgoColor = '#6c757d';
        let riesgoIcon = 'fa-chart-line';
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

        const detalles = inc.detalles ? (inc.detalles.length > 80 ? inc.detalles.substring(0, 80) + '...' : inc.detalles) : 'Sin detalles';

        registrosHtml += `
            <div class="swal-registro-card" onclick="window.verDetalleIncidenciaDesdeSweet('${inc.id}')">
                <div class="swal-card-header">
                    <span class="swal-id"><i class="fas fa-hashtag"></i> ${escapeHTML(inc.id.substring(0, 12))}...</span>
                    <span class="swal-fecha"><i class="fas fa-calendar-alt"></i> ${fecha}</span>
                </div>
                <div class="swal-card-body">
                    <div class="swal-info-principal">
                        <div class="swal-sucursal">
                            <i class="fas fa-store"></i> ${escapeHTML(obtenerNombreSucursal(inc.sucursalId) || 'Sin asignar')}
                        </div>
                        <div class="swal-tipo-evento">
                            <i class="fas ${riesgoIcon}" style="color: ${riesgoColor};"></i> ${inc.nivelRiesgo ? inc.nivelRiesgo.charAt(0).toUpperCase() + inc.nivelRiesgo.slice(1) : 'N/A'}
                            <span class="swal-estado-badge" style="margin-left: 8px; color: ${estadoColor};">
                                <i class="fas ${estadoIcon}"></i> ${inc.estado ? inc.estado.charAt(0).toUpperCase() + inc.estado.slice(1) : 'N/A'}
                            </span>
                        </div>
                    </div>
                    <div class="swal-montos">
                        <span class="swal-monto-perdido"><i class="fas fa-user"></i> ${escapeHTML(inc.creadoPorNombre || 'N/A')}</span>
                        ${inc.actualizadoPorNombre ? `<span class="swal-monto-recuperado"><i class="fas fa-edit"></i> ${escapeHTML(inc.actualizadoPorNombre)}</span>` : ''}
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
        registrosHtml += `
            <div class="swal-mas-registros">
                <i class="fas fa-ellipsis-h"></i> y ${incidencias.length - 15} incidencias más. Haz clic en un registro para ver detalles completos.
            </div>
        `;
    }

    registrosHtml += `</div>`;

    Swal.fire({
        title: `${iconoHtml} ${titulo}`,
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
        backdrop: `
            rgba(0,0,0,0.8)
            left top
            no-repeat
        `
    });
}

window.verDetalleIncidenciaDesdeSweet = function (incidenciaId) {
    Swal.close();

    const incidencia = datosGraficas.incidenciasFiltradas?.find(i => i.id === incidenciaId);

    if (!incidencia) {
        Swal.fire({
            icon: 'error',
            title: 'Incidencia no encontrada',
            text: 'No se pudo encontrar la incidencia seleccionada',
            background: '#1a1a1a',
            color: '#fff',
            customClass: {
                popup: 'swal2-popup-custom'
            }
        });
        return;
    }

    const fecha = incidencia.fechaInicio instanceof Date ? incidencia.fechaInicio.toLocaleDateString('es-MX') :
        (incidencia.fechaInicio ? new Date(incidencia.fechaInicio).toLocaleDateString('es-MX') : 'N/A');

    let estadoColor = '#6c757d';
    let estadoIcon = 'fa-circle';
    if (incidencia.estado === 'finalizada') {
        estadoColor = '#10b981';
        estadoIcon = 'fa-check-circle';
    } else if (incidencia.estado === 'pendiente') {
        estadoColor = '#f59e0b';
        estadoIcon = 'fa-clock';
    }

    let riesgoColor = '#6c757d';
    let riesgoIcon = 'fa-chart-line';
    let riesgoTexto = incidencia.nivelRiesgo ? incidencia.nivelRiesgo.charAt(0).toUpperCase() + incidencia.nivelRiesgo.slice(1) : 'N/A';
    if (incidencia.nivelRiesgo === 'critico') {
        riesgoColor = '#ef4444';
        riesgoIcon = 'fa-exclamation-triangle';
    } else if (incidencia.nivelRiesgo === 'alto') {
        riesgoColor = '#f97316';
        riesgoIcon = 'fa-exclamation-circle';
    } else if (incidencia.nivelRiesgo === 'medio') {
        riesgoColor = '#eab308';
        riesgoIcon = 'fa-chart-simple';
    } else if (incidencia.nivelRiesgo === 'bajo') {
        riesgoColor = '#10b981';
        riesgoIcon = 'fa-check';
    }

    const detallesHtml = `
        <div style="display: flex; flex-direction: column; gap: 16px;">
            <div class="swal-resumen-stats" style="margin-bottom: 0;">
                <div class="swal-stats-grid">
                    <div class="swal-stat-item" style="border-left-color: #8b5cf6;">
                        <span class="swal-stat-label">ID Incidencia</span>
                        <span class="swal-stat-value" style="font-size: 0.8rem; word-break: break-all;">${escapeHTML(incidencia.id)}</span>
                    </div>
                    <div class="swal-stat-item" style="border-left-color: #3b82f6;">
                        <span class="swal-stat-label">Fecha</span>
                        <span class="swal-stat-value" style="font-size: 0.9rem;">${fecha}</span>
                    </div>
                    <div class="swal-stat-item" style="border-left-color: ${estadoColor};">
                        <span class="swal-stat-label">Estado</span>
                        <span class="swal-stat-value" style="color: ${estadoColor};"><i class="fas ${estadoIcon}"></i> ${incidencia.estado ? incidencia.estado.charAt(0).toUpperCase() + incidencia.estado.slice(1) : 'N/A'}</span>
                    </div>
                </div>
            </div>
            
            <div style="background: rgba(0,0,0,0.4); border-radius: 16px; padding: 16px; border: 1px solid rgba(255,255,255,0.08);">
                <div style="display: flex; flex-wrap: wrap; gap: 20px; justify-content: space-between;">
                    <div>
                        <div style="font-size: 0.7rem; text-transform: uppercase; color: #9ca3af; letter-spacing: 1px;">Sucursal</div>
                        <div style="font-size: 1rem; font-weight: 600; margin-top: 4px;"><i class="fas fa-store" style="color: var(--color-accent-primary);"></i> ${escapeHTML(obtenerNombreSucursal(incidencia.sucursalId) || 'N/A')}</div>
                    </div>
                    <div>
                        <div style="font-size: 0.7rem; text-transform: uppercase; color: #9ca3af; letter-spacing: 1px;">Categoría</div>
                        <div style="font-size: 1rem; font-weight: 600; margin-top: 4px;"><i class="fas fa-tag"></i> ${escapeHTML(obtenerNombreCategoria(incidencia.categoriaId) || 'N/A')}</div>
                    </div>
                    <div>
                        <div style="font-size: 0.7rem; text-transform: uppercase; color: #9ca3af; letter-spacing: 1px;">Nivel de riesgo</div>
                        <div style="font-size: 1rem; font-weight: 600; margin-top: 4px; color: ${riesgoColor};"><i class="fas ${riesgoIcon}"></i> ${riesgoTexto}</div>
                    </div>
                </div>
            </div>
            
            <div style="display: flex; flex-wrap: wrap; gap: 16px;">
                <div style="flex: 1; background: rgba(59, 130, 246, 0.1); border-radius: 16px; padding: 16px; border-left: 3px solid #3b82f6;">
                    <div style="font-size: 0.7rem; text-transform: uppercase; color: #9ca3af;">Creado por</div>
                    <div style="font-size: 1rem; font-weight: 600; margin-top: 4px;"><i class="fas fa-user-plus"></i> ${escapeHTML(incidencia.creadoPorNombre || 'N/A')}</div>
                </div>
                <div style="flex: 1; background: rgba(245, 158, 11, 0.1); border-radius: 16px; padding: 16px; border-left: 3px solid #f59e0b;">
                    <div style="font-size: 0.7rem; text-transform: uppercase; color: #9ca3af;">Actualizado por</div>
                    <div style="font-size: 1rem; font-weight: 600; margin-top: 4px;"><i class="fas fa-user-edit"></i> ${escapeHTML(incidencia.actualizadoPorNombre || 'N/A')}</div>
                </div>
            </div>
            
            ${incidencia.detalles ? `
            <div style="background: rgba(0,0,0,0.3); border-radius: 16px; padding: 16px;">
                <div style="font-size: 0.7rem; text-transform: uppercase; color: #9ca3af; margin-bottom: 8px;"><i class="fas fa-file-alt"></i> Detalles</div>
                <div style="font-size: 0.85rem; line-height: 1.5; color: #d1d5db;">${escapeHTML(incidencia.detalles)}</div>
            </div>
            ` : ''}
        </div>
    `;

    Swal.fire({
        title: `<i class="fas fa-info-circle" style="color: var(--color-accent-primary);"></i> Detalles de la incidencia`,
        html: detallesHtml,
        width: '700px',
        background: 'transparent',
        confirmButtonText: '<i class="fas fa-check"></i> Cerrar',
        customClass: {
            popup: 'swal2-popup-custom',
            title: 'swal2-title-custom',
            confirmButton: 'swal2-confirm'
        }
    });
};

function mostrarAlertActualizadores() {
    const data = datosGraficas.topActualizadores;
    if (!data || data.length === 0) {
        Swal.fire({
            icon: 'info',
            title: 'Sin datos',
            text: 'No hay información de actualizaciones para mostrar',
            background: '#1a1a1a',
            color: '#fff'
        });
        return;
    }

    let html = '<div style="text-align: left;">';
    html += '<p><strong>📊 Top colaboradores que más actualizan incidencias</strong></p>';
    html += '<ul style="margin-top: 10px;">';
    data.forEach((item, index) => {
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '📌';
        html += `<li style="margin: 8px 0;">${medal} <strong>${escapeHTML(item.nombre)}</strong>: ${item.cantidad} incidencias actualizadas</li>`;
    });
    html += '</ul></div>';

    Swal.fire({
        title: 'Colaboradores que más actualizan',
        html: html,
        icon: 'info',
        background: '#1a1a1a',
        color: '#fff',
        confirmButtonColor: '#3b82f6',
        confirmButtonText: 'Cerrar'
    });
}

function mostrarAlertReportadores() {
    const data = datosGraficas.topReportadores;
    if (!data || data.length === 0) {
        Swal.fire({
            icon: 'info',
            title: 'Sin datos',
            text: 'No hay información de reportes para mostrar',
            background: '#1a1a1a',
            color: '#fff'
        });
        return;
    }

    let html = '<div style="text-align: left;">';
    html += '<p><strong>📝 Top colaboradores que más reportan incidencias</strong></p>';
    html += '<ul style="margin-top: 10px;">';
    data.forEach((item, index) => {
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '📌';
        html += `<li style="margin: 8px 0;">${medal} <strong>${escapeHTML(item.nombre)}</strong>: ${item.cantidad} incidencias reportadas</li>`;
    });
    html += '</ul></div>';

    Swal.fire({
        title: 'Colaboradores con más reportes',
        html: html,
        icon: 'info',
        background: '#1a1a1a',
        color: '#fff',
        confirmButtonColor: '#10b981',
        confirmButtonText: 'Cerrar'
    });
}

function mostrarAlertSeguimientos() {
    const data = datosGraficas.topSeguimientos;
    if (!data || data.length === 0) {
        Swal.fire({
            icon: 'info',
            title: 'Sin datos',
            text: 'No hay información de seguimientos para mostrar',
            background: '#1a1a1a',
            color: '#fff'
        });
        return;
    }

    let html = '<div style="text-align: left;">';
    html += '<p><strong>🔄 Top colaboradores con más seguimientos</strong></p>';
    html += '<ul style="margin-top: 10px;">';
    data.forEach((item, index) => {
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '📌';
        html += `<li style="margin: 8px 0;">${medal} <strong>${escapeHTML(item.nombre)}</strong>: ${item.cantidad} seguimientos realizados</li>`;
    });
    html += '</ul></div>';

    Swal.fire({
        title: 'Colaboradores con más seguimientos',
        html: html,
        icon: 'info',
        background: '#1a1a1a',
        color: '#fff',
        confirmButtonColor: '#f97316',
        confirmButtonText: 'Cerrar'
    });
}

function mostrarAlertEstado() {
    const data = datosGraficas.estadoData;
    const total = (data.pendientes || 0) + (data.finalizadas || 0);
    const pendientesPorc = total > 0 ? Math.round((data.pendientes / total) * 100) : 0;
    const finalizadasPorc = total > 0 ? Math.round((data.finalizadas / total) * 100) : 0;

    let html = '<div style="text-align: left;">';
    html += '<p><strong>📈 Distribución de estados de incidencias</strong></p>';
    html += '<div style="margin-top: 15px;">';
    html += `<div style="margin-bottom: 10px; cursor: pointer;" onclick="window.mostrarRegistrosPorEstado('pendiente')">
                <span style="display: inline-block; width: 12px; height: 12px; background: #f97316; border-radius: 50%; margin-right: 8px;"></span> 
                <strong>Pendientes:</strong> ${data.pendientes} (${pendientesPorc}%) 
                <span style="font-size: 11px; color: #3b82f6;"><i class="fas fa-mouse-pointer"></i> Haz clic para ver</span>
            </div>`;
    html += `<div style="margin-bottom: 10px; cursor: pointer;" onclick="window.mostrarRegistrosPorEstado('finalizada')">
                <span style="display: inline-block; width: 12px; height: 12px; background: #10b981; border-radius: 50%; margin-right: 8px;"></span> 
                <strong>Finalizadas:</strong> ${data.finalizadas} (${finalizadasPorc}%)
                <span style="font-size: 11px; color: #3b82f6;"><i class="fas fa-mouse-pointer"></i> Haz clic para ver</span>
            </div>`;
    html += '</div>';
    html += `<p style="margin-top: 15px; color: #6c757d; font-size: 12px;">Total de incidencias: ${total}</p>`;
    html += '</div>';

    Swal.fire({
        title: 'Estado de Incidencias',
        html: html,
        icon: 'info',
        background: '#1a1a1a',
        color: '#fff',
        confirmButtonColor: '#f97316',
        confirmButtonText: 'Cerrar'
    });
}

window.mostrarRegistrosPorEstado = function (estado) {
    const incidencias = datosGraficas.incidenciasFiltradas?.filter(i => i.estado === estado) || [];
    const titulo = estado === 'pendiente' ? 'Incidencias Pendientes' : 'Incidencias Finalizadas';
    const icono = estado === 'pendiente' ? '<i class="fas fa-clock"></i>' : '<i class="fas fa-check-circle"></i>';

    if (incidencias.length === 0) {
        Swal.fire({
            icon: 'info',
            title: 'Sin registros',
            text: `No hay incidencias ${estado === 'pendiente' ? 'pendientes' : 'finalizadas'} para mostrar`,
            background: '#1a1a1a',
            color: '#fff'
        });
        return;
    }

    Swal.close();
    mostrarRegistrosEnSweet(incidencias, titulo, icono);
};

function mostrarAlertRiesgo() {
    const data = datosGraficas.riesgoData;
    const total = (data.critico || 0) + (data.alto || 0) + (data.medio || 0) + (data.bajo || 0);
    const criticoPorc = total > 0 ? Math.round((data.critico / total) * 100) : 0;
    const altoPorc = total > 0 ? Math.round((data.alto / total) * 100) : 0;
    const medioPorc = total > 0 ? Math.round((data.medio / total) * 100) : 0;
    const bajoPorc = total > 0 ? Math.round((data.bajo / total) * 100) : 0;

    let html = '<div style="text-align: left;">';
    html += '<p><strong>⚠️ Distribución de niveles de riesgo</strong></p>';
    html += '<div style="margin-top: 15px;">';
    html += `<div style="margin-bottom: 8px; cursor: pointer;" onclick="window.mostrarRegistrosPorRiesgo('critico')">
                <span style="display: inline-block; width: 12px; height: 12px; background: #ef4444; border-radius: 50%; margin-right: 8px;"></span> 
                <strong>Crítico:</strong> ${data.critico} (${criticoPorc}%)
                <span style="font-size: 11px; color: #3b82f6;"><i class="fas fa-mouse-pointer"></i> Haz clic</span>
            </div>`;
    html += `<div style="margin-bottom: 8px; cursor: pointer;" onclick="window.mostrarRegistrosPorRiesgo('alto')">
                <span style="display: inline-block; width: 12px; height: 12px; background: #f97316; border-radius: 50%; margin-right: 8px;"></span> 
                <strong>Alto:</strong> ${data.alto} (${altoPorc}%)
                <span style="font-size: 11px; color: #3b82f6;"><i class="fas fa-mouse-pointer"></i> Haz clic</span>
            </div>`;
    html += `<div style="margin-bottom: 8px; cursor: pointer;" onclick="window.mostrarRegistrosPorRiesgo('medio')">
                <span style="display: inline-block; width: 12px; height: 12px; background: #eab308; border-radius: 50%; margin-right: 8px;"></span> 
                <strong>Medio:</strong> ${data.medio} (${medioPorc}%)
                <span style="font-size: 11px; color: #3b82f6;"><i class="fas fa-mouse-pointer"></i> Haz clic</span>
            </div>`;
    html += `<div style="margin-bottom: 8px; cursor: pointer;" onclick="window.mostrarRegistrosPorRiesgo('bajo')">
                <span style="display: inline-block; width: 12px; height: 12px; background: #10b981; border-radius: 50%; margin-right: 8px;"></span> 
                <strong>Bajo:</strong> ${data.bajo} (${bajoPorc}%)
                <span style="font-size: 11px; color: #3b82f6;"><i class="fas fa-mouse-pointer"></i> Haz clic</span>
            </div>`;
    html += '</div>';
    html += `<p style="margin-top: 15px; color: #6c757d; font-size: 12px;">Total de incidencias: ${total}</p>`;
    html += '</div>';

    Swal.fire({
        title: 'Niveles de Riesgo',
        html: html,
        icon: 'warning',
        background: '#1a1a1a',
        color: '#fff',
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Cerrar'
    });
}

window.mostrarRegistrosPorRiesgo = function (nivelRiesgo) {
    const incidencias = datosGraficas.incidenciasFiltradas?.filter(i => i.nivelRiesgo === nivelRiesgo) || [];
    const nivelesTexto = {
        critico: 'Críticas',
        alto: 'Altas',
        medio: 'Medias',
        bajo: 'Bajas'
    };
    const iconos = {
        critico: '<i class="fas fa-exclamation-triangle"></i>',
        alto: '<i class="fas fa-exclamation-circle"></i>',
        medio: '<i class="fas fa-chart-simple"></i>',
        bajo: '<i class="fas fa-check"></i>'
    };

    if (incidencias.length === 0) {
        Swal.fire({
            icon: 'info',
            title: 'Sin registros',
            text: `No hay incidencias de nivel ${nivelesTexto[nivelRiesgo]} para mostrar`,
            background: '#1a1a1a',
            color: '#fff'
        });
        return;
    }

    Swal.close();
    mostrarRegistrosEnSweet(incidencias, `Incidencias ${nivelesTexto[nivelRiesgo]}`, iconos[nivelRiesgo]);
};

function mostrarAlertCategorias() {
    const data = datosGraficas.categoriasData;
    if (!data || data.length === 0) {
        Swal.fire({
            icon: 'info',
            title: 'Sin datos',
            text: 'No hay información de categorías para mostrar',
            background: '#1a1a1a',
            color: '#fff'
        });
        return;
    }

    const total = data.reduce((sum, item) => sum + item.cantidad, 0);

    let html = '<div style="text-align: left;">';
    html += '<p><strong>🏷️ Incidencias por categoría</strong></p>';
    html += '<div style="margin-top: 15px;">';
    data.forEach(item => {
        const porcentaje = Math.round((item.cantidad / total) * 100);
        html += `<div style="margin-bottom: 10px; cursor: pointer;" onclick="window.mostrarRegistrosPorCategoria('${escapeHTML(item.nombre)}')">`;
        html += `<div style="display: flex; justify-content: space-between; margin-bottom: 4px;">`;
        html += `<span><strong>${escapeHTML(item.nombre)}</strong></span>`;
        html += `<span>${item.cantidad} (${porcentaje}%) <span style="font-size: 11px; color: #3b82f6;"><i class="fas fa-mouse-pointer"></i></span></span>`;
        html += `</div>`;
        html += `<div style="width: 100%; height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px;">`;
        html += `<div style="width: ${porcentaje}%; height: 100%; background: #8b5cf6; border-radius: 3px;"></div>`;
        html += `</div>`;
        html += `</div>`;
    });
    html += `<p style="margin-top: 15px; color: #6c757d; font-size: 12px;">Total de incidencias: ${total}</p>`;
    html += '</div>';

    Swal.fire({
        title: 'Incidencias por Categoría',
        html: html,
        icon: 'info',
        background: '#1a1a1a',
        color: '#fff',
        confirmButtonColor: '#8b5cf6',
        confirmButtonText: 'Cerrar'
    });
}

window.mostrarRegistrosPorCategoria = function (categoriaNombre) {
    const categoria = categoriasCache.find(c => c.nombre === categoriaNombre);
    if (!categoria) {
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'No se encontró la categoría',
            background: '#1a1a1a',
            color: '#fff'
        });
        return;
    }

    const incidencias = datosGraficas.incidenciasFiltradas?.filter(i => i.categoriaId === categoria.id) || [];

    if (incidencias.length === 0) {
        Swal.fire({
            icon: 'info',
            title: 'Sin registros',
            text: `No hay incidencias en la categoría ${categoriaNombre} para mostrar`,
            background: '#1a1a1a',
            color: '#fff'
        });
        return;
    }

    Swal.close();
    mostrarRegistrosEnSweet(incidencias, `Incidencias: ${categoriaNombre}`, '<i class="fas fa-tag"></i>');
};

function mostrarAlertSucursales() {
    const data = datosGraficas.sucursalesData;
    if (!data || data.length === 0) {
        Swal.fire({
            icon: 'info',
            title: 'Sin datos',
            text: 'No hay información de sucursales para mostrar',
            background: '#1a1a1a',
            color: '#fff'
        });
        return;
    }

    const total = data.reduce((sum, item) => sum + item.cantidad, 0);

    let html = '<div style="text-align: left;">';
    html += '<p><strong>🏢 Incidencias por sucursal</strong></p>';
    html += '<div style="margin-top: 15px;">';
    data.forEach(item => {
        const porcentaje = Math.round((item.cantidad / total) * 100);
        html += `<div style="margin-bottom: 10px; cursor: pointer;" onclick="window.mostrarRegistrosPorSucursal('${escapeHTML(item.nombre)}')">`;
        html += `<div style="display: flex; justify-content: space-between; margin-bottom: 4px;">`;
        html += `<span><strong>${escapeHTML(item.nombre)}</strong></span>`;
        html += `<span>${item.cantidad} (${porcentaje}%) <span style="font-size: 11px; color: #3b82f6;"><i class="fas fa-mouse-pointer"></i></span></span>`;
        html += `</div>`;
        html += `<div style="width: 100%; height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px;">`;
        html += `<div style="width: ${porcentaje}%; height: 100%; background: #14b8a6; border-radius: 3px;"></div>`;
        html += `</div>`;
        html += `</div>`;
    });
    html += `<p style="margin-top: 15px; color: #6c757d; font-size: 12px;">Total de incidencias: ${total}</p>`;
    html += '</div>';

    Swal.fire({
        title: 'Incidencias por Sucursal',
        html: html,
        icon: 'info',
        background: '#1a1a1a',
        color: '#fff',
        confirmButtonColor: '#14b8a6',
        confirmButtonText: 'Cerrar'
    });
}

window.mostrarRegistrosPorSucursal = function (sucursalNombre) {
    const sucursal = sucursalesCache.find(s => s.nombre === sucursalNombre);
    if (!sucursal) {
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'No se encontró la sucursal',
            background: '#1a1a1a',
            color: '#fff'
        });
        return;
    }

    const incidencias = datosGraficas.incidenciasFiltradas?.filter(i => i.sucursalId === sucursal.id) || [];

    if (incidencias.length === 0) {
        Swal.fire({
            icon: 'info',
            title: 'Sin registros',
            text: `No hay incidencias en la sucursal ${sucursalNombre} para mostrar`,
            background: '#1a1a1a',
            color: '#fff'
        });
        return;
    }

    Swal.close();
    mostrarRegistrosEnSweet(incidencias, `Incidencias: ${sucursalNombre}`, '<i class="fas fa-store"></i>');
};

function mostrarAlertTiempoResolucion() {
    const data = datosGraficas.tiemposPromedio;
    if (!data || data.length === 0) {
        Swal.fire({
            icon: 'info',
            title: 'Sin datos',
            text: 'No hay información de tiempos de resolución para mostrar. Asegúrate de tener incidencias finalizadas.',
            background: '#1a1a1a',
            color: '#fff'
        });
        return;
    }

    let html = '<div style="text-align: left;">';
    html += '<p><strong>⏱️ Tiempo promedio de resolución por colaborador</strong></p>';
    html += '<p style="font-size: 12px; color: #6c757d; margin-bottom: 10px;">*Basado en incidencias finalizadas</p>';
    html += '<div style="margin-top: 10px;">';
    data.forEach((item, index) => {
        const medal = index === 0 ? '🏆' : '📌';
        // Determinar color según el tiempo (verde para rápido, rojo para lento)
        let tiempoColor = '#10b981';
        if (item.promedio > 72) tiempoColor = '#ef4444';
        else if (item.promedio > 24) tiempoColor = '#f97316';
        else if (item.promedio > 8) tiempoColor = '#eab308';

        html += `<div style="margin-bottom: 12px; padding: 8px; background: rgba(0,0,0,0.3); border-radius: 8px;">`;
        html += `<div style="display: flex; justify-content: space-between; align-items: center;">`;
        html += `<span>${medal} <strong>${escapeHTML(item.nombre)}</strong></span>`;
        html += `<span style="color: ${tiempoColor}; font-weight: bold;">${item.promedio} horas</span>`;
        html += `</div>`;
        html += `<div style="width: 100%; height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px; margin-top: 6px;">`;
        // Barra de progreso inversa (menor tiempo es mejor)
        const maxTiempo = Math.max(...data.map(t => t.promedio));
        const porcentaje = maxTiempo > 0 ? Math.min(100, Math.round((item.promedio / maxTiempo) * 100)) : 0;
        html += `<div style="width: ${porcentaje}%; height: 100%; background: ${tiempoColor}; border-radius: 2px;"></div>`;
        html += `</div>`;
        html += `</div>`;
    });
    html += '</div>';
    html += '<p style="margin-top: 15px; color: #6c757d; font-size: 12px;">*Menor tiempo = mejor eficiencia</p>';
    html += '</div>';

    Swal.fire({
        title: 'Tiempo de Resolución',
        html: html,
        icon: 'info',
        background: '#1a1a1a',
        color: '#fff',
        confirmButtonColor: '#ec4899',
        confirmButtonText: 'Cerrar'
    });
}

// =============================================
// RENDERIZAR TODAS LAS GRÁFICAS CON EVENTOS DE CLIC
// =============================================
function renderizarTodasLasGraficas(datos) {
    // Destruir gráficas existentes
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

    // Agregar eventos de clic a los canvas
    agregarEventosClickCanvas();
}

function agregarEventosClickCanvas() {
    const canvasConfigs = [
        { id: 'graficoActualizadores', handler: mostrarAlertActualizadores },
        { id: 'graficoReportadores', handler: mostrarAlertReportadores },
        { id: 'graficoSeguimientos', handler: mostrarAlertSeguimientos },
        { id: 'graficoEstado', handler: mostrarAlertEstado },
        { id: 'graficoRiesgo', handler: mostrarAlertRiesgo },
        { id: 'graficoCategorias', handler: mostrarAlertCategorias },
        { id: 'graficoSucursales', handler: mostrarAlertSucursales },
        { id: 'graficoTiempo', handler: mostrarAlertTiempoResolucion }
    ];

    canvasConfigs.forEach(config => {
        const canvas = document.getElementById(config.id);
        if (canvas) {
            canvas.removeEventListener('click', config.handler);
            canvas.addEventListener('click', config.handler);
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
            datasets: [{
                label: 'Incidencias actualizadas',
                data: actualizadores.map(a => a.cantidad),
                backgroundColor: '#3b82f6',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { labels: { color: 'white' } },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `${ctx.raw} incidencias actualizadas`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255,255,255,0.1)' },
                    ticks: { color: 'white', stepSize: 1 }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: 'white', maxRotation: 45 }
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
            datasets: [{
                label: 'Incidencias reportadas',
                data: reportadores.map(r => r.cantidad),
                backgroundColor: '#10b981',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { labels: { color: 'white' } }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255,255,255,0.1)' },
                    ticks: { color: 'white', stepSize: 1 }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: 'white', maxRotation: 45 }
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
            datasets: [{
                label: 'Seguimientos realizados',
                data: seguimientos.map(s => s.cantidad),
                backgroundColor: '#f97316',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { labels: { color: 'white' } }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255,255,255,0.1)' },
                    ticks: { color: 'white', stepSize: 1 }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: 'white', maxRotation: 45 }
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
        data: {
            labels: ['Pendientes', 'Finalizadas'],
            datasets: [{
                data: [estado.pendientes || 0, estado.finalizadas || 0],
                backgroundColor: ['#f97316', '#10b981'],
                borderWidth: 0,
                hoverOffset: 15
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    labels: { color: 'white' },
                    position: 'bottom'
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const total = (estado.pendientes || 0) + (estado.finalizadas || 0);
                            const porcentaje = total > 0 ? Math.round((ctx.raw / total) * 100) : 0;
                            return `${ctx.label}: ${ctx.raw} (${porcentaje}%)`;
                        }
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

    if ((!riesgo.critico || riesgo.critico === 0) &&
        (!riesgo.alto || riesgo.alto === 0) &&
        (!riesgo.medio || riesgo.medio === 0) &&
        (!riesgo.bajo || riesgo.bajo === 0)) {
        mostrarMensajeSinDatosEnCanvas(ctx, canvas, 'Sin datos de riesgo');
        return;
    }

    charts.riesgo = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Crítico', 'Alto', 'Medio', 'Bajo'],
            datasets: [{
                data: [riesgo.critico || 0, riesgo.alto || 0, riesgo.medio || 0, riesgo.bajo || 0],
                backgroundColor: ['#ef4444', '#f97316', '#eab308', '#10b981'],
                borderWidth: 0,
                hoverOffset: 15
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    labels: { color: 'white' },
                    position: 'bottom'
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const total = (riesgo.critico || 0) + (riesgo.alto || 0) + (riesgo.medio || 0) + (riesgo.bajo || 0);
                            const porcentaje = total > 0 ? Math.round((ctx.raw / total) * 100) : 0;
                            return `${ctx.label}: ${ctx.raw} (${porcentaje}%)`;
                        }
                    }
                }
            }
        }
    });
}

function crearGraficoCategorias(categorias) {
    const canvas = document.getElementById('graficoCategorias');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    if (!categorias || categorias.length === 0) {
        mostrarMensajeSinDatosEnCanvas(ctx, canvas, 'Sin datos de categorías');
        return;
    }

    charts.categorias = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: categorias.map(c => c.nombre.length > 15 ? c.nombre.substring(0, 12) + '...' : c.nombre),
            datasets: [{
                label: 'Incidencias',
                data: categorias.map(c => c.cantidad),
                backgroundColor: '#8b5cf6',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { labels: { color: 'white' } }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255,255,255,0.1)' },
                    ticks: { color: 'white', stepSize: 1 }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: 'white', maxRotation: 45 }
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

    charts.sucursales = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: sucursales.map(s => s.nombre.length > 15 ? s.nombre.substring(0, 12) + '...' : s.nombre),
            datasets: [{
                label: 'Incidencias',
                data: sucursales.map(s => s.cantidad),
                backgroundColor: '#14b8a6',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { labels: { color: 'white' } }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255,255,255,0.1)' },
                    ticks: { color: 'white', stepSize: 1 }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: 'white', maxRotation: 45 }
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

    // Limitar nombres para mejor visualización
    const nombres = tiempos.map(t => t.nombre.length > 15 ? t.nombre.substring(0, 12) + '...' : t.nombre);
    const promedios = tiempos.map(t => t.promedio);

    // Colores basados en el tiempo (verde para rápido, rojo para lento)
    const colores = tiempos.map(t => {
        if (t.promedio <= 24) return '#10b981';      // Verde: menos de 24 horas
        if (t.promedio <= 72) return '#f59e0b';      // Naranja: entre 24 y 72 horas
        return '#ef4444';                             // Rojo: más de 72 horas
    });

    charts.tiempo = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: nombres,
            datasets: [{
                label: 'Horas promedio de resolución',
                data: promedios,
                backgroundColor: colores,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            indexAxis: 'y', // Barras horizontales para mejor lectura de nombres largos
            plugins: {
                legend: { labels: { color: 'white' } },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const horas = ctx.raw;
                            const dias = Math.floor(horas / 24);
                            const horasResto = horas % 24;
                            let texto = `${horas} horas`;
                            if (dias > 0) {
                                texto = `${dias} día${dias > 1 ? 's' : ''} y ${horasResto} horas`;
                            }
                            return `${ctx.dataset.label}: ${texto}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255,255,255,0.1)' },
                    ticks: {
                        color: 'white', stepSize: 24, callback: (value) => {
                            if (value >= 24) {
                                const dias = value / 24;
                                return `${dias}d`;
                            }
                            return `${value}h`;
                        }
                    }
                },
                y: {
                    grid: { display: false },
                    ticks: { color: 'white', font: { size: 10 } }
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

// =============================================
// TABLA DE COLABORADORES
// =============================================
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
        const maxActividad = colaboradores.length > 0 ?
            Math.max(...colaboradores.map(c => (c.reportados || 0) + (c.actualizados || 0) + (c.seguimientos || 0))) : 1;
        const eficiencia = Math.min(100, Math.round((totalActividad / maxActividad) * 100));

        // Color para el tiempo promedio
        let tiempoColor = '#10b981';
        if (tiempoPromedio > 72) tiempoColor = '#ef4444';
        else if (tiempoPromedio > 24) tiempoColor = '#f97316';
        else if (tiempoPromedio > 0) tiempoColor = '#eab308';

        return `
            <tr>
                <td><i class="fas fa-user-circle" style="color: #3b82f6; margin-right: 8px;"></i> ${escapeHTML(col.nombre)}</td>
                <td><span class="badge-value badge-info">${col.reportados || 0}</span></td>
                <td><span class="badge-value badge-warning">${col.actualizados || 0}</span></td>
                <td><span class="badge-value badge-success">${col.seguimientos || 0}</span></td>
                <td><span class="badge-value" style="background: ${tiempoColor}20; color: ${tiempoColor};">${tiempoPromedio} h</span></td>
                <td>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div class="eficiencia-bar" style="flex: 1; height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px;">
                            <div class="eficiencia-fill" style="width: ${eficiencia}%; height: 100%; background: linear-gradient(90deg, #10b981, #3b82f6); border-radius: 3px;"></div>
                        </div>
                        <span style="color: white; min-width: 40px;">${eficiencia}%</span>
                    </div>
                  </td>
              </tr>
        `;
    }).join('');
}

// =============================================
// TABLA DE CATEGORÍAS
// =============================================
function renderizarTablaCategorias(categorias) {
    const tbody = document.getElementById('tablaCategoriasBody');
    if (!tbody) return;

    if (!categorias || categorias.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2" style="text-align:center; padding:30px;">No hay datos de categorías</td</tr>';
        return;
    }

    tbody.innerHTML = categorias.map(cat => `
        <tr>
            <td>${escapeHTML(cat.nombre)}</td>
            <td><span class="badge-value badge-info">${cat.cantidad}</span></td>
        </tr>
    `).join('');
}

// =============================================
// FILTRO DE COLABORADORES
// =============================================
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

// =============================================
// FUNCIONES AUXILIARES
// =============================================
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

// =============================================
// GENERAR REPORTE PDF
// =============================================
async function generarReportePDF() {
    try {
        if (!incidenciasFiltradas || incidenciasFiltradas.length === 0) {
            Swal.fire({
                icon: 'warning',
                title: 'Sin datos',
                text: 'No hay incidencias para generar el reporte estadístico.'
            });
            return;
        }

        Swal.fire({
            title: 'Preparando datos...',
            text: 'Generando reporte estadístico',
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });

        const datos = procesarDatosGraficas(incidenciasFiltradas);

        datos.metricas = {
            total: incidenciasFiltradas.length,
            pendientes: incidenciasFiltradas.filter(i => i.estado === 'pendiente').length,
            finalizadas: incidenciasFiltradas.filter(i => i.estado === 'finalizada').length,
            criticas: incidenciasFiltradas.filter(i => i.nivelRiesgo === 'critico').length,
            altas: incidenciasFiltradas.filter(i => i.nivelRiesgo === 'alto').length,
            medias: incidenciasFiltradas.filter(i => i.nivelRiesgo === 'medio').length,
            bajas: incidenciasFiltradas.filter(i => i.nivelRiesgo === 'bajo').length
        };

        Swal.close();

        await registrarGeneracionPDFReporte(incidenciasFiltradas.length, filtrosActivos);

        const { generadorPDFEstadisticas } = await import('/components/pdf-estadisticas-generator.js');

        generadorPDFEstadisticas.configurar({
            organizacionActual,
            sucursalesCache,
            categoriasCache,
            usuariosCache: [],
            authToken
        });

        await generadorPDFEstadisticas.generarReporte(datos, {
            mostrarAlerta: true,
            fechaInicio: filtrosActivos.fechaInicio,
            fechaFin: filtrosActivos.fechaFin,
            filtrosAplicados: filtrosActivos
        });

    } catch (error) {
        console.error('Error generando PDF:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'No se pudo generar el reporte PDF: ' + error.message
        });
    }
}

// =============================================
// UTILIDADES
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
    Swal.fire({
        icon: 'error',
        title: 'Error',
        text: mensaje
    });
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