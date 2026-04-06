// =============================================
// estadisticas.js - VERSIÓN FINAL CON FILTROS FUNCIONALES Y PDF GENERATOR
// CON REGISTRO DE BITÁCORA
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
let historialManager = null; // ✅ NUEVO: Para registrar actividades
let accesoVistaRegistrado = false; // ✅ NUEVO: Para evitar registros duplicados

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
        console.log('🎯 Iniciando estadísticas...');

        // ✅ NUEVO: Inicializar historialManager
        await inicializarHistorial();

        // Mostrar estado de carga
        mostrarLoadingInicial();

        await inicializarEstadisticasManager();
        await obtenerTokenAuth();

        // Configurar filtros PRIMERO
        configurarFiltros();

        // Cargar datos iniciales
        await Promise.all([
            cargarSucursales(),
            cargarCategorias()
        ]);

        // NO cargar incidencias automáticamente - esperar a que el usuario aplique filtros
        mostrarMensajeEsperaFiltros();

        // ✅ NUEVO: Registrar acceso a la vista de estadísticas
        await registrarAccesoVistaEstadisticas();

    } catch (error) {
        console.error('❌ Error al inicializar estadísticas:', error);
        mostrarError('Error al cargar la página: ' + error.message);
    }
});

// ✅ NUEVO: Inicializar historialManager
async function inicializarHistorial() {
    try {
        const { HistorialUsuarioManager } = await import('/clases/historialUsuario.js');
        historialManager = new HistorialUsuarioManager();
        console.log('📋 HistorialManager inicializado para estadísticas');
    } catch (error) {
        console.error('Error inicializando historialManager:', error);
    }
}

// ✅ NUEVO: Obtener usuario actual
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

// ✅ NUEVO: Registrar acceso a la vista de estadísticas
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
        console.log('✅ Acceso a estadísticas registrado en bitácora');
    } catch (error) {
        console.error('Error registrando acceso a estadísticas:', error);
    }
}

// ✅ NUEVO: Registrar aplicación de filtros
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
        console.log('✅ Aplicación de filtros registrada en bitácora');
    } catch (error) {
        console.error('Error registrando aplicación de filtros:', error);
    }
}

// ✅ NUEVO: Registrar generación de reporte PDF
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
        console.log('✅ Generación de reporte PDF registrada en bitácora');
    } catch (error) {
        console.error('Error registrando generación de PDF:', error);
    }
}

// ✅ NUEVO: Registrar limpieza de filtros
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
        console.log('✅ Limpieza de filtros registrada en bitácora');
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
        console.warn('Error obteniendo token:', error);
        authToken = null;
    }
}

// =============================================
// MOSTRAR MENSAJE DE ESPERA
// =============================================
function mostrarMensajeEsperaFiltros() {
    // Limpiar todas las gráficas y mostrar mensaje
    const graficas = [
        'graficoActualizadores', 'graficoReportadores', 'graficoSeguimientos',
        'graficoEstado', 'graficoRiesgo', 'graficoCategorias',
        'graficoSucursales', 'graficoTiempo'
    ];

    graficas.forEach(id => {
        const canvas = document.getElementById(id);
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.font = '16px Arial';
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.textAlign = 'center';
            ctx.fillText(' Aplica filtros para ver resultados', canvas.width / 2, canvas.height / 2);
        }
    });

    // Limpiar tablas
    const tablaColab = document.getElementById('tablaColaboradoresBody');
    if (tablaColab) {
        tablaColab.innerHTML = '<td colspan="6" style="text-align:center; padding:40px;"><i class="fas fa-filter" style="font-size: 32px; opacity: 0.3; margin-bottom: 10px;"></i><br>Selecciona filtros y presiona APLICAR</div>';
    }

    const tablaCat = document.getElementById('tablaCategoriasBody');
    if (tablaCat) {
        tablaCat.innerHTML = '<td colspan="2" style="text-align:center; padding:40px;"><i class="fas fa-filter" style="font-size: 32px; opacity: 0.3; margin-bottom: 10px;"></i><br>Selecciona filtros y presiona APLICAR</div>';
    }

    // Resetear métricas
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
    // Establecer fechas por defecto (últimos 30 días)
    const hoy = new Date();
    const hace30Dias = new Date();
    hace30Dias.setDate(hoy.getDate() - 30);

    const fechaInicio = document.getElementById('filtroFechaInicio');
    const fechaFin = document.getElementById('filtroFechaFin');

    if (fechaInicio) fechaInicio.value = hace30Dias.toISOString().split('T')[0];
    if (fechaFin) fechaFin.value = hoy.toISOString().split('T')[0];

    // Guardar valores en filtros activos
    filtrosActivos.fechaInicio = hace30Dias.toISOString().split('T')[0];
    filtrosActivos.fechaFin = hoy.toISOString().split('T')[0];

    // Event listeners
    document.getElementById('btnAplicarFiltros')?.addEventListener('click', aplicarFiltros);
    document.getElementById('btnLimpiarFiltros')?.addEventListener('click', limpiarFiltros);

    // Búsqueda con debounce
    let timeout;
    document.getElementById('buscarIncidencias')?.addEventListener('input', (e) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            filtrosActivos.busqueda = e.target.value;
            aplicarFiltros(); // Aplicar filtros automáticamente después de la búsqueda
        }, 500);
    });

    // Botón PDF
    document.getElementById('btnGenerarPDF')?.addEventListener('click', generarReportePDF);
}

// =============================================
// APLICAR FILTROS (FUNCIÓN PRINCIPAL)
// =============================================
async function aplicarFiltros() {
    // Mostrar loading
    mostrarLoadingGraficas();

    // Actualizar filtros activos con los valores del formulario
    const nuevosFiltros = {
        fechaInicio: document.getElementById('filtroFechaInicio')?.value || null,
        fechaFin: document.getElementById('filtroFechaFin')?.value || null,
        categoriaId: document.getElementById('filtroCategoria')?.value || 'todas',
        sucursalId: document.getElementById('filtroSucursal')?.value || 'todas',
        colaboradorId: document.getElementById('filtroColaborador')?.value || 'todos',
        busqueda: document.getElementById('buscarIncidencias')?.value || ''
    };

    filtrosActivos = nuevosFiltros;

    console.log('🔍 Aplicando filtros:', filtrosActivos);

    // Cargar incidencias con los filtros aplicados
    await cargarIncidencias();

    // ✅ NUEVO: Registrar aplicación de filtros después de cargar incidencias
    if (incidenciasFiltradas) {
        await registrarAplicacionFiltros(filtrosActivos, incidenciasFiltradas.length);
    }
}

async function limpiarFiltros() {
    const hoy = new Date();
    const hace30Dias = new Date();
    hace30Dias.setDate(hoy.getDate() - 30);

    // Resetear todos los campos del formulario
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

    // Actualizar filtros activos
    filtrosActivos = {
        fechaInicio: hace30Dias.toISOString().split('T')[0],
        fechaFin: hoy.toISOString().split('T')[0],
        categoriaId: 'todas',
        sucursalId: 'todas',
        colaboradorId: 'todos',
        busqueda: ''
    };

    console.log('🧹 Filtros limpiados');

    // ✅ NUEVO: Registrar limpieza de filtros
    await registrarLimpiezaFiltros();

    // Cargar incidencias con los filtros por defecto
    await cargarIncidencias();
}

function filtrarIncidencias(incidencias) {
    return incidencias.filter(inc => {
        // Filtro por fecha
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

        // Filtro por categoría
        if (filtrosActivos.categoriaId !== 'todas' && inc.categoriaId !== filtrosActivos.categoriaId) {
            return false;
        }

        // Filtro por sucursal
        if (filtrosActivos.sucursalId !== 'todas' && inc.sucursalId !== filtrosActivos.sucursalId) {
            return false;
        }

        // Filtro por colaborador
        if (filtrosActivos.colaboradorId !== 'todos') {
            const coincideColaborador =
                inc.creadoPorNombre === filtrosActivos.colaboradorId ||
                inc.actualizadoPorNombre === filtrosActivos.colaboradorId;

            if (!coincideColaborador) return false;
        }

        // Filtro por búsqueda
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
        // Mostrar loading
        mostrarLoadingGraficas();

        // Obtener incidencias (solo una vez, usar cache)
        if (incidenciasCache.length === 0) {
            incidenciasCache = await incidenciaManager.getIncidenciasByOrganizacion(organizacionActual.camelCase);
            console.log(`✅ ${incidenciasCache.length} incidencias cargadas en caché`);
        }

        // Aplicar filtros
        incidenciasFiltradas = filtrarIncidencias(incidenciasCache);

        console.log(`📊 ${incidenciasFiltradas.length} incidencias después de filtros`);

        if (incidenciasFiltradas.length === 0) {
            mostrarMensajeSinResultados();
            return;
        }

        // Procesar datos para las 8 gráficas
        const datos = procesarDatosGraficas(incidenciasFiltradas);

        // Actualizar métricas principales
        actualizarMetricasPrincipales(datos.metricas);

        // Renderizar todas las gráficas
        renderizarTodasLasGraficas(datos);

        // Actualizar tablas
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

        // Cargar filtro de colaboradores
        if (datos.colaboradores && datos.colaboradores.length > 0) {
            cargarFiltroColaboradores(datos.colaboradores);
        }

        // Actualizar fecha
        const fechaEl = document.getElementById('fechaActualizacion');
        if (fechaEl) {
            fechaEl.textContent = new Date().toLocaleString('es-MX');
        }

    } catch (error) {
        console.error('Error al cargar incidencias:', error);
        mostrarError('Error al cargar estadísticas: ' + error.message);
    }
}

// =============================================
// MOSTRAR MENSAJE SIN RESULTADOS
// =============================================
function mostrarMensajeSinResultados() {
    const graficas = [
        'graficoActualizadores', 'graficoReportadores', 'graficoSeguimientos',
        'graficoEstado', 'graficoRiesgo', 'graficoCategorias',
        'graficoSucursales', 'graficoTiempo'
    ];

    graficas.forEach(id => {
        const canvas = document.getElementById(id);
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.font = '16px Arial';
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.textAlign = 'center';
            ctx.fillText('📭 Sin resultados con los filtros actuales', canvas.width / 2, canvas.height / 2);
        }
    });

    const tablaColab = document.getElementById('tablaColaboradoresBody');
    if (tablaColab) {
        tablaColab.innerHTML = '<td colspan="6" style="text-align:center; padding:40px;"><i class="fas fa-search" style="font-size: 32px; opacity: 0.3; margin-bottom: 10px;"></i><br>No hay incidencias que coincidan con los filtros</div>';
    }

    const tablaCat = document.getElementById('tablaCategoriasBody');
    if (tablaCat) {
        tablaCat.innerHTML = '<td colspan="2" style="text-align:center; padding:40px;"><i class="fas fa-search" style="font-size: 32px; opacity: 0.3; margin-bottom: 10px;"></i><br>No hay incidencias que coincidan con los filtros</div>';
    }

    // Resetear métricas a 0
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
// PROCESAR DATOS PARA LAS 8 GRÁFICAS
// =============================================
function procesarDatosGraficas(incidencias) {

    // 1. Métricas principales
    const metricas = {
        total: incidencias.length,
        pendientes: incidencias.filter(i => i.estado === 'pendiente').length,
        finalizadas: incidencias.filter(i => i.estado === 'finalizada').length,
        criticas: incidencias.filter(i => i.nivelRiesgo === 'critico').length,
        altas: incidencias.filter(i => i.nivelRiesgo === 'alto').length,
        medias: incidencias.filter(i => i.nivelRiesgo === 'medio').length,
        bajas: incidencias.filter(i => i.nivelRiesgo === 'bajo').length
    };

    // 2. GRÁFICA 1: Colaboradores que más actualizan
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

    // 3. GRÁFICA 2: Colaboradores con más reportes
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

    // 4. GRÁFICA 3: Colaboradores con más seguimientos
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

    // 5. GRÁFICA 4: Estado de incidencias
    const estadoData = {
        pendientes: metricas.pendientes,
        finalizadas: metricas.finalizadas
    };

    // 6. GRÁFICA 5: Niveles de riesgo
    const riesgoData = {
        critico: metricas.criticas,
        alto: metricas.altas,
        medio: metricas.medias,
        bajo: metricas.bajas
    };

    // 7. GRÁFICA 6: Incidencias por categoría
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

    // 8. GRÁFICA 7: Incidencias por sucursal
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

    // 9. GRÁFICA 8: Tiempo promedio de resolución
    const tiemposResolucion = new Map();
    incidencias.filter(i => i.estado === 'finalizada' && i.fechaFinalizacion).forEach(inc => {
        if (inc.actualizadoPorNombre) {
            const inicio = inc.fechaInicio instanceof Date ? inc.fechaInicio : new Date(inc.fechaInicio);
            const fin = inc.fechaFinalizacion instanceof Date ? inc.fechaFinalizacion : new Date(inc.fechaFinalizacion);
            const tiempoHoras = Math.round((fin - inicio) / (1000 * 60 * 60));

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
    });

    const tiemposPromedio = Array.from(tiemposResolucion.entries())
        .map(([nombre, data]) => ({
            nombre,
            promedio: data.count > 0 ? Math.round(data.total / data.count) : 0
        }))
        .filter(t => t.promedio > 0)
        .sort((a, b) => a.promedio - b.promedio)
        .slice(0, 5);

    // Datos completos de colaboradores para la tabla
    const colaboradoresMap = new Map();

    incidencias.forEach(inc => {
        // Por creación
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

        // Por actualización
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

        // Por seguimiento
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

        // Tiempo de resolución
        if (inc.estado === 'finalizada' && inc.fechaFinalizacion && inc.actualizadoPorNombre) {
            const inicio = inc.fechaInicio instanceof Date ? inc.fechaInicio : new Date(inc.fechaInicio);
            const fin = inc.fechaFinalizacion instanceof Date ? inc.fechaFinalizacion : new Date(inc.fechaFinalizacion);
            const tiempo = Math.round((fin - inicio) / (1000 * 60 * 60));

            const col = colaboradoresMap.get(inc.actualizadoPorNombre);
            if (col) col.tiempoTotal += tiempo;
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
// RENDERIZAR TODAS LAS GRÁFICAS
// =============================================
function renderizarTodasLasGraficas(datos) {
    // Destruir gráficas anteriores
    Object.values(charts).forEach(chart => {
        if (chart && typeof chart.destroy === 'function') chart.destroy();
    });

    // Crear nuevas gráficas
    crearGraficoActualizadores(datos.topActualizadores);
    crearGraficoReportadores(datos.topReportadores);
    crearGraficoSeguimientos(datos.topSeguimientos);
    crearGraficoEstado(datos.estadoData);
    crearGraficoRiesgo(datos.riesgoData);
    crearGraficoCategorias(datos.categoriasData);
    crearGraficoSucursales(datos.sucursalesData);
    crearGraficoTiempoResolucion(datos.tiemposPromedio);
}

// =============================================
// GRÁFICA 1: Colaboradores que más actualizan
// =============================================
function crearGraficoActualizadores(actualizadores) {
    const canvas = document.getElementById('graficoActualizadores');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    if (!actualizadores || actualizadores.length === 0) {
        mostrarMensajeSinDatos(ctx, canvas, 'Sin datos de actualizaciones');
        return;
    }

    charts.actualizadores = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: actualizadores.map(a => a.nombre.split(' ')[0]),
            datasets: [{
                label: 'Incidencias actualizadas',
                data: actualizadores.map(a => a.cantidad),
                backgroundColor: '#3b82f6',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
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

// =============================================
// GRÁFICA 2: Colaboradores con más reportes
// =============================================
function crearGraficoReportadores(reportadores) {
    const canvas = document.getElementById('graficoReportadores');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    if (!reportadores || reportadores.length === 0) {
        mostrarMensajeSinDatos(ctx, canvas, 'Sin datos de reportes');
        return;
    }

    charts.reportadores = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: reportadores.map(r => r.nombre.split(' ')[0]),
            datasets: [{
                label: 'Incidencias reportadas',
                data: reportadores.map(r => r.cantidad),
                backgroundColor: '#10b981',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
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

// =============================================
// GRÁFICA 3: Colaboradores con más seguimientos
// =============================================
function crearGraficoSeguimientos(seguimientos) {
    const canvas = document.getElementById('graficoSeguimientos');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    if (!seguimientos || seguimientos.length === 0) {
        mostrarMensajeSinDatos(ctx, canvas, 'Sin datos de seguimientos');
        return;
    }

    charts.seguimientos = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: seguimientos.map(s => s.nombre.split(' ')[0]),
            datasets: [{
                label: 'Seguimientos realizados',
                data: seguimientos.map(s => s.cantidad),
                backgroundColor: '#f97316',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
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

// =============================================
// GRÁFICA 4: Estado de incidencias
// =============================================
function crearGraficoEstado(estado) {
    const canvas = document.getElementById('graficoEstado');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    if ((!estado.pendientes || estado.pendientes === 0) && (!estado.finalizadas || estado.finalizadas === 0)) {
        mostrarMensajeSinDatos(ctx, canvas, 'Sin datos de estado');
        return;
    }

    charts.estado = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Pendientes', 'Finalizadas'],
            datasets: [{
                data: [estado.pendientes || 0, estado.finalizadas || 0],
                backgroundColor: ['#f97316', '#10b981'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
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

// =============================================
// GRÁFICA 5: Niveles de riesgo
// =============================================
function crearGraficoRiesgo(riesgo) {
    const canvas = document.getElementById('graficoRiesgo');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    if ((!riesgo.critico || riesgo.critico === 0) &&
        (!riesgo.alto || riesgo.alto === 0) &&
        (!riesgo.medio || riesgo.medio === 0) &&
        (!riesgo.bajo || riesgo.bajo === 0)) {
        mostrarMensajeSinDatos(ctx, canvas, 'Sin datos de riesgo');
        return;
    }

    charts.riesgo = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Crítico', 'Alto', 'Medio', 'Bajo'],
            datasets: [{
                data: [riesgo.critico || 0, riesgo.alto || 0, riesgo.medio || 0, riesgo.bajo || 0],
                backgroundColor: ['#ef4444', '#f97316', '#eab308', '#10b981'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
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

// =============================================
// GRÁFICA 6: Incidencias por categoría
// =============================================
function crearGraficoCategorias(categorias) {
    const canvas = document.getElementById('graficoCategorias');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    if (!categorias || categorias.length === 0) {
        mostrarMensajeSinDatos(ctx, canvas, 'Sin datos de categorías');
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
            maintainAspectRatio: false,
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

// =============================================
// GRÁFICA 7: Incidencias por sucursal
// =============================================
function crearGraficoSucursales(sucursales) {
    const canvas = document.getElementById('graficoSucursales');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    if (!sucursales || sucursales.length === 0) {
        mostrarMensajeSinDatos(ctx, canvas, 'Sin datos de sucursales');
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
            maintainAspectRatio: false,
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

// =============================================
// GRÁFICA 8: Tiempo promedio de resolución
// =============================================
function crearGraficoTiempoResolucion(tiempos) {
    const canvas = document.getElementById('graficoTiempo');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    if (!tiempos || tiempos.length === 0) {
        mostrarMensajeSinDatos(ctx, canvas, 'Sin datos de tiempo');
        return;
    }

    charts.tiempo = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: tiempos.map(t => t.nombre.split(' ')[0]),
            datasets: [{
                label: 'Horas promedio',
                data: tiempos.map(t => t.promedio),
                backgroundColor: '#ec4899',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
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

// =============================================
// TABLA DE COLABORADORES
// =============================================
function renderizarTablaColaboradores(colaboradores) {
    const tbody = document.getElementById('tablaColaboradoresBody');
    if (!tbody) return;

    if (!colaboradores || colaboradores.length === 0) {
        tbody.innerHTML = '<td colspan="6" style="text-align:center; padding:30px;">No hay datos de colaboradores</div>';
        return;
    }

    tbody.innerHTML = colaboradores.slice(0, 10).map(col => {
        const tiempoPromedio = col.incidenciasResueltas > 0 ? Math.round(col.tiempoTotal / col.incidenciasResueltas) : 0;
        const totalActividad = (col.reportados || 0) + (col.actualizados || 0) + (col.seguimientos || 0);
        const maxActividad = colaboradores.length > 0 ?
            Math.max(...colaboradores.map(c => (c.reportados || 0) + (c.actualizados || 0) + (c.seguimientos || 0))) : 1;
        const eficiencia = Math.min(100, Math.round((totalActividad / maxActividad) * 100));

        return `
            <tr>
                <td><i class="fas fa-user-circle" style="color: #3b82f6; margin-right: 8px;"></i> ${escapeHTML(col.nombre)}</td>
                <td><span class="badge-value badge-info">${col.reportados || 0}</span></td>
                <td><span class="badge-value badge-warning">${col.actualizados || 0}</span></td>
                <td><span class="badge-value badge-success">${col.seguimientos || 0}</span></td>
                <td><span class="badge-value badge-secondary">${tiempoPromedio} h</span></td>
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
        tbody.innerHTML = '<td colspan="2" style="text-align:center; padding:30px;">No hay datos de categorías</div>';
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
// GENERAR REPORTE PDF - VERSIÓN CORREGIDA CON BITÁCORA
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

        // Mostrar loading
        Swal.fire({
            title: 'Preparando datos...',
            text: 'Generando reporte estadístico',
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });

        // Procesar datos para las gráficas
        const datos = procesarDatosGraficas(incidenciasFiltradas);

        // Agregar métricas al objeto datos
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

        // ✅ NUEVO: Registrar generación de PDF
        await registrarGeneracionPDFReporte(incidenciasFiltradas.length, filtrosActivos);

        // Importar el generador de estadísticas
        const { generadorPDFEstadisticas } = await import('/components/pdf-estadisticas-generator.js');

        // Configurar el generador
        generadorPDFEstadisticas.configurar({
            organizacionActual,
            sucursalesCache,
            categoriasCache,
            usuariosCache: [], // Si no tienes usuariosCache en estadísticas, pasa array vacío
            authToken
        });

        // Generar PDF
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
function mostrarLoadingInicial() {
    const elementos = [
        'metricCriticas', 'metricAltas', 'metricPendientes', 'metricTotal',
        'graficoActualizadores', 'graficoReportadores', 'graficoSeguimientos',
        'graficoEstado', 'graficoRiesgo', 'graficoCategorias',
        'graficoSucursales', 'graficoTiempo', 'tablaColaboradoresBody',
        'tablaCategoriasBody'
    ];

    elementos.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            if (id.includes('grafico')) {
                el.innerHTML = '<div style="text-align:center; padding:40px;"><i class="fas fa-spinner fa-spin" style="font-size:48px; color:var(--color-accent-primary);"></i></div>';
            } else if (id.includes('tabla')) {
                el.innerHTML = '<td colspan="6" style="text-align:center;"><i class="fas fa-spinner fa-spin"></i> Cargando datos...</div>';
            } else {
                el.textContent = '...';
            }
        }
    });
}

function mostrarLoadingGraficas() {
    const graficas = [
        'graficoActualizadores', 'graficoReportadores', 'graficoSeguimientos',
        'graficoEstado', 'graficoRiesgo', 'graficoCategorias',
        'graficoSucursales', 'graficoTiempo'
    ];

    graficas.forEach(id => {
        const canvas = document.getElementById(id);
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.font = '14px Arial';
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.textAlign = 'center';
            ctx.fillText('Cargando...', canvas.width / 2, canvas.height / 2);
        }
    });
}

function mostrarMensajeSinDatos(ctx, canvas, mensaje) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = '14px Arial';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.textAlign = 'center';
    ctx.fillText(mensaje, canvas.width / 2, canvas.height / 2);
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