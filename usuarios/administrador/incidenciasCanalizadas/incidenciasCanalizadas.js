// incidenciasCanalizadas.js - VERSIÓN CORREGIDA

import { generadorIPH } from '/components/iph-generator.js';
import '/components/visualizadorPDF.js';

let historialManager = null;
let incidenciaManager = null;
let organizacionActual = null;
let incidenciasCache = [];
let sucursalesCache = [];
let categoriasCache = [];
let subcategoriasCache = [];
let usuariosCache = [];
let authToken = null;
let notificacionManager = null;

// Configuración del área actual (del usuario logueado)
let areaActual = {
    id: null,
    nombre: 'Cargando...',
    icono: 'fa-layer-group'
};

// Mapeo de áreas
const ICONOS_AREA = {
    'mantenimiento': 'fa-tools',
    'caja': 'fa-cash-register',
    'rh': 'fa-users',
    'recursos-humanos': 'fa-users',
    'redes': 'fa-network-wired',
    'sistemas': 'fa-laptop-code',
    'seguridad': 'fa-shield-alt',
    'limpieza': 'fa-broom',
    'almacen': 'fa-warehouse',
    'ventas': 'fa-chart-line',
    'compras': 'fa-shopping-cart',
    'default': 'fa-layer-group'
};

const NOMBRES_AREA = {
    'mantenimiento': 'Mantenimiento',
    'caja': 'Caja',
    'rh': 'Recursos Humanos',
    'recursos-humanos': 'Recursos Humanos',
    'redes': 'Redes y Comunicaciones',
    'sistemas': 'Sistemas',
    'seguridad': 'Seguridad',
    'limpieza': 'Limpieza',
    'almacen': 'Almacén',
    'ventas': 'Ventas',
    'compras': 'Compras'
};

const ITEMS_POR_PAGINA = 10;
let paginaActual = 1;

let filtrosActivos = {
    estado: 'todos',
    nivelRiesgo: 'todos',
    sucursalId: 'todos'
};

let accesoVistaRegistrado = false;

// =============================================
// OBTENER ÁREA DEL USUARIO ACTUAL (CORREGIDO)
// =============================================
async function obtenerAreaUsuario() {
    try {
        console.log('🔍 Obteniendo área del usuario...');

        // Opción 1: Desde userData
        const userData = JSON.parse(localStorage.getItem('userData') || '{}');
        
        // Opción 2: Desde adminInfo
        const adminInfo = JSON.parse(localStorage.getItem('adminInfo') || '{}');
        
        // Opción 3: Desde sessionStorage
        const sessionData = JSON.parse(sessionStorage.getItem('usuarioActual') || '{}');
        
        // Buscar área en múltiples ubicaciones
        let areaId = userData.areaAsignadaId || 
                     userData.areaId || 
                     userData.area || 
                     userData.departamento ||
                     adminInfo.areaAsignadaId ||
                     adminInfo.areaId ||
                     adminInfo.area ||
                     sessionData.areaAsignadaId ||
                     sessionData.areaId;

        let areaNombre = userData.areaAsignadaNombre || 
                         userData.areaNombre ||
                         adminInfo.areaAsignadaNombre ||
                         adminInfo.areaNombre ||
                         sessionData.areaAsignadaNombre;

        // Si no hay área, intentar obtener desde Firestore
        if (!areaId) {
            const areaObtenida = await obtenerAreaDesdeBackend();
            if (areaObtenida) {
                areaId = areaObtenida.id;
                areaNombre = areaObtenida.nombre;
            }
        }

        if (!areaId) {
            console.warn('⚠️ Usuario sin área asignada - Mostrando TODAS las incidencias canalizadas');
            areaActual.nombre = 'Todas las áreas (Admin)';
            areaActual.id = 'todas';
            areaActual.icono = 'fa-globe';
        } else {
            areaActual.id = areaId;
            areaActual.nombre = areaNombre || formatearNombreArea(areaId);
            areaActual.icono = ICONOS_AREA[areaId.toLowerCase()] || ICONOS_AREA['default'];
        }

        console.log('✅ Área actual:', areaActual);
        
        // Actualizar UI
        actualizarInterfazArea();

    } catch (error) {
        console.error('Error obteniendo área del usuario:', error);
        areaActual.nombre = 'Error al cargar área';
        areaActual.id = null;
    }
}

// Función auxiliar para obtener área desde backend
async function obtenerAreaDesdeBackend() {
    try {
        const usuario = obtenerUsuarioActual();
        if (!usuario || !usuario.id) return null;
        
        // Intentar importar UserManager
        const { UsuarioManager } = await import('/clases/user.js');
        const userManager = new UsuarioManager();
        
        const userData = await userManager.obtenerUsuarioPorId(usuario.id, usuario.organizacionCamelCase);
        if (userData && userData.areaAsignadaId) {
            return {
                id: userData.areaAsignadaId,
                nombre: userData.areaAsignadaNombre
            };
        }
        return null;
    } catch (error) {
        console.error('Error obteniendo área desde backend:', error);
        return null;
    }
}

// =============================================
// CARGAR INCIDENCIAS CANALIZADAS (CORREGIDO)
// =============================================
async function cargarIncidenciasCanalizadas() {
    if (!incidenciaManager || !organizacionActual?.camelCase) {
        console.error('No se puede cargar: falta incidenciaManager u organización');
        mostrarError('No se pudo cargar el gestor de incidencias');
        return;
    }

    try {
        const tbody = document.getElementById('tablaIncidenciasBody');
        if (!tbody) return;

        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:40px;"><i class="fas fa-spinner fa-spin" style="font-size: 24px;"></i> Cargando incidencias canalizadas...</td></tr>`;

        // Obtener TODAS las incidencias de la organización
        const todasIncidencias = await incidenciaManager.getIncidenciasByOrganizacion(
            organizacionActual.camelCase,
            { orderByFecha: true }
        );

        console.log(`📊 Total incidencias en organización: ${todasIncidencias.length}`);

        // Filtrar solo las que tienen canalizaciones y están dirigidas al área actual
        incidenciasCache = filtrarPorAreaCanalizada(todasIncidencias);

        console.log(`📌 Incidencias canalizadas a ${areaActual.nombre}: ${incidenciasCache.length}`);

        // DEBUG: Mostrar detalles de canalización
        incidenciasCache.forEach(inc => {
            const canalizaciones = inc.getCanalizacionesArray ? 
                inc.getCanalizacionesArray() : 
                Object.values(inc.canalizaciones || {});
            console.log(`  - ${inc.id}: canalizada a ${canalizaciones.map(c => c.areaNombre).join(', ')}`);
        });

        if (!incidenciasCache || incidenciasCache.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" style="text-align:center; padding:60px 20px;">
                        <div style="text-align:center;">
                            <i class="fas fa-directions" style="font-size:48px; color:rgba(0,207,255,0.3); margin-bottom:16px;"></i>
                            <h5 style="color:white;">No hay incidencias canalizadas</h5>
                            <p style="color: var(--color-text-dim); margin-bottom: 20px;">
                                No se han encontrado incidencias canalizadas a ${areaActual.nombre}.
                            </p>
                            <button class="btn-nueva-incidencia-header" onclick="window.location.href='../incidencias/incidencias.html'">
                                <i class="fas fa-list"></i> Ver todas las incidencias
                            </button>
                        </div>
                    </td>
                </tr>
            `;
            actualizarEstadisticas();
            return;
        }

        renderizarIncidencias();
        actualizarEstadisticas();

        // Registrar acceso
        await registrarAccesoVistaIncidenciasCanalizadas();

    } catch (error) {
        console.error('Error al cargar incidencias canalizadas:', error);
        mostrarError('Error al cargar incidencias: ' + error.message);
    }
}

// =============================================
// FILTRAR POR ÁREA CANALIZADA (CORREGIDO)
// =============================================
function filtrarPorAreaCanalizada(incidencias) {
    if (!incidencias || !Array.isArray(incidencias)) return [];

    // Si el usuario es admin (área 'todas'), mostrar TODAS las canalizadas
    if (areaActual.id === 'todas' || !areaActual.id) {
        return incidencias.filter(inc => {
            const canalizaciones = inc.getCanalizacionesArray ? 
                inc.getCanalizacionesArray() : 
                Object.values(inc.canalizaciones || {});
            return canalizaciones.length > 0;
        });
    }

    // Filtrar por área específica (case-insensitive)
    const areaIdLower = areaActual.id.toLowerCase();
    
    return incidencias.filter(inc => {
        // Obtener canalizaciones en formato array
        let canalizaciones = [];
        
        if (inc.getCanalizacionesArray) {
            canalizaciones = inc.getCanalizacionesArray();
        } else if (inc.canalizaciones) {
            canalizaciones = Object.values(inc.canalizaciones);
        }
        
        if (canalizaciones.length === 0) return false;
        
        // Buscar si alguna canalización corresponde al área actual
        const canalizada = canalizaciones.some(canal => {
            const canalAreaId = (canal.areaId || '').toLowerCase();
            const canalAreaNombre = (canal.areaNombre || '').toLowerCase();
            
            return canalAreaId === areaIdLower || 
                   canalAreaNombre === areaIdLower ||
                   canalAreaNombre === areaActual.nombre.toLowerCase();
        });
        
        if (canalizada) {
            console.log(`✅ Incidencia ${inc.id} canalizada al área ${areaActual.nombre}`);
        }
        
        return canalizada;
    });
}

// =============================================
// OBTENER CANALIZACIÓN PARA ÁREA ACTUAL (CORREGIDO)
// =============================================
function obtenerCanalizacionParaArea(incidencia) {
    if (!incidencia.canalizaciones || areaActual.id === 'todas') return null;

    const areaIdLower = areaActual.id.toLowerCase();
    let canalizaciones = [];
    
    if (incidencia.getCanalizacionesArray) {
        canalizaciones = incidencia.getCanalizacionesArray();
    } else if (incidencia.canalizaciones) {
        canalizaciones = Object.values(incidencia.canalizaciones);
    }
    
    return canalizaciones.find(c => {
        const canalAreaId = (c.areaId || '').toLowerCase();
        const canalAreaNombre = (c.areaNombre || '').toLowerCase();
        return canalAreaId === areaIdLower || 
               canalAreaNombre === areaIdLower ||
               canalAreaNombre === areaActual.nombre.toLowerCase();
    });
}

// =============================================
// RENDERIZAR INCIDENCIAS (MEJORADO)
// =============================================
function renderizarIncidencias() {
    const tbody = document.getElementById('tablaIncidenciasBody');
    if (!tbody) return;

    const incidenciasFiltradas = filtrarIncidencias(incidenciasCache);

    // Ordenar por fecha de canalización (más reciente primero)
    incidenciasFiltradas.sort((a, b) => {
        const fechaA = obtenerFechaCanalizacionMasReciente(a);
        const fechaB = obtenerFechaCanalizacionMasReciente(b);
        return new Date(fechaB) - new Date(fechaA);
    });

    const totalItems = incidenciasFiltradas.length;
    const totalPaginas = Math.ceil(totalItems / ITEMS_POR_PAGINA);
    const inicio = (paginaActual - 1) * ITEMS_POR_PAGINA;
    const fin = Math.min(inicio + ITEMS_POR_PAGINA, totalItems);
    const incidenciasPagina = incidenciasFiltradas.slice(inicio, fin);

    // Actualizar info de paginación
    const paginationInfo = document.getElementById('paginationInfo');
    if (paginationInfo) {
        paginationInfo.textContent = `Mostrando ${inicio + 1}-${fin} de ${totalItems} incidencias canalizadas a ${areaActual.nombre}`;
    }

    // Limpiar y renderizar
    tbody.innerHTML = '';
    incidenciasPagina.forEach(incidencia => {
        crearFilaIncidencia(incidencia, tbody);
    });

    renderizarPaginacion(totalPaginas);
    actualizarEstadisticas();
}

// =============================================
// CREAR FILA DE INCIDENCIA (MEJORADO)
// =============================================
function crearFilaIncidencia(incidencia, tbody) {
    const tr = document.createElement('tr');
    tr.className = 'incidencia-row';
    tr.dataset.id = incidencia.id;

    // Obtener textos y colores
    const riesgoTexto = incidencia.getNivelRiesgoTexto ? incidencia.getNivelRiesgoTexto() : incidencia.nivelRiesgo;
    const riesgoColor = incidencia.getNivelRiesgoColor ? incidencia.getNivelRiesgoColor() : '';
    const estadoTexto = incidencia.getEstadoTexto ? incidencia.getEstadoTexto() : incidencia.estado;

    // Obtener la canalización específica para esta área
    const canalizacionArea = obtenerCanalizacionParaArea(incidencia);

    // Formatear fecha de canalización específica
    let fechaFormateada = 'N/A';
    let horaFormateada = '';

    if (canalizacionArea && canalizacionArea.fechaCanalizacion) {
        const fecha = new Date(canalizacionArea.fechaCanalizacion);
        fechaFormateada = fecha.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
        horaFormateada = fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    } else {
        // Fallback a la fecha más reciente de canalización
        const fecha = obtenerFechaCanalizacionMasReciente(incidencia);
        if (fecha && fecha !== 'Invalid Date') {
            fechaFormateada = new Date(fecha).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
            horaFormateada = new Date(fecha).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
        }
    }

    // Obtener origen (quién canalizó)
    let nombreOrigen = 'Sistema';
    if (canalizacionArea && canalizacionArea.canalizadoPorNombre) {
        nombreOrigen = canalizacionArea.canalizadoPorNombre;
    }

    // Contar cuántas áreas están canalizadas
    const totalCanalizaciones = incidencia.getCanalizacionesArray ? 
        incidencia.getCanalizacionesArray().length : 
        Object.keys(incidencia.canalizaciones || {}).length;
    
    const multiCanalizada = totalCanalizaciones > 1 ?
        `<span class="origen-badge" style="margin-left: 5px;" title="Canalizada a ${totalCanalizaciones} áreas"><i class="fas fa-layer-group"></i> ${totalCanalizaciones}</span>` : '';

    tr.innerHTML = `
        <td data-label="ID / Folio">
            <span class="incidencia-id" title="${incidencia.id}">${incidencia.id.substring(0, 8)}...</span>
            ${multiCanalizada}
        </td>
        <td data-label="Sucursal">
            <div style="display: flex; align-items: center;">
                <div style="width:4px; height:24px; background:var(--color-accent-primary); border-radius:2px; margin-right:12px; flex-shrink:0;"></div>
                <div>
                    <strong title="${obtenerNombreSucursal(incidencia.sucursalId)}">${obtenerNombreSucursal(incidencia.sucursalId)}</strong>
                </div>
            </div>
        </td>
        <td data-label="Categoría">
            ${obtenerNombreCategoria(incidencia.categoriaId)}
        </td>
        <td data-label="Subcategoría">
            ${obtenerNombreSubcategoria(incidencia.subcategoriaId)}
        </td>
        <td data-label="Riesgo">
            <span class="riesgo-badge ${incidencia.nivelRiesgo}" style="background: ${riesgoColor}20; color: ${riesgoColor}; border-color: ${riesgoColor}40;">
                ${riesgoTexto}
            </span>
        </td>
        <td data-label="Estado">
            <span class="estado-badge ${incidencia.estado}">
                ${estadoTexto}
            </span>
        </td>
        <td data-label="Fecha Canalización">
            <div class="fecha-canalizacion">
                <span class="fecha">${fechaFormateada}</span>
                <span class="hora">${horaFormateada}</span>
            </div>
        </td>
        <td data-label="Origen">
            <span class="origen-badge" title="Canalizado por">
                <i class="fas fa-user"></i> ${escapeHTML(nombreOrigen)}
            </span>
        </td>
        <td data-label="Acciones">
            <div class="btn-group" style="display: flex; gap: 6px; flex-wrap: wrap;">
                <button type="button" class="btn" data-action="ver" data-id="${incidencia.id}" title="Ver detalles">
                    <i class="fas fa-eye"></i>
                </button>
                <button type="button" class="btn" data-action="seguimiento" data-id="${incidencia.id}" title="Seguimiento">
                    <i class="fas fa-history"></i>
                </button>
                <button type="button" class="btn" data-action="detalles-canalizacion" data-id="${incidencia.id}" title="Detalles de canalización">
                    <i class="fas fa-directions"></i>
                </button>
                <button type="button" class="btn" data-action="pdf" data-id="${incidencia.id}" title="Ver PDF">
                    <i class="fas fa-file-pdf" style="color: #c0392b;"></i>
                </button>
            </div>
        </td>
    `;

    tbody.appendChild(tr);

    // Agregar event listeners
    setTimeout(() => {
        tr.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                const id = btn.dataset.id;

                switch (action) {
                    case 'ver':
                        window.verDetallesIncidencia(id, e);
                        break;
                    case 'seguimiento':
                        window.seguimientoIncidencia(id, e);
                        break;
                    case 'detalles-canalizacion':
                        mostrarDetallesCanalizacion(id, e);
                        break;
                    case 'pdf':
                        window.verPDF(id, e);
                        break;
                }
            });
        });
    }, 50);
}

// =============================================
// ACTUALIZAR ESTADÍSTICAS
// =============================================
function actualizarEstadisticas() {
    const totalEl = document.getElementById('totalIncidencias');
    const pendientesEl = document.getElementById('pendientesArea');
    const enProcesoEl = document.getElementById('enProcesoArea');
    const completadasEl = document.getElementById('completadasArea');
    const areaNombreEl = document.getElementById('areaNombreEstadisticas');

    if (totalEl) totalEl.textContent = incidenciasCache.length;
    
    if (pendientesEl) {
        const pendientes = incidenciasCache.filter(inc => inc.estado === 'pendiente').length;
        pendientesEl.textContent = pendientes;
    }
    
    if (enProcesoEl) {
        const enProceso = incidenciasCache.filter(inc => inc.estado === 'en_proceso').length;
        enProcesoEl.textContent = enProceso;
    }
    
    if (completadasEl) {
        const completadas = incidenciasCache.filter(inc => inc.estado === 'finalizada').length;
        completadasEl.textContent = completadas;
    }
    
    if (areaNombreEl) {
        areaNombreEl.textContent = areaActual.nombre;
    }
}

// =============================================
// REFRESCAR INCIDENCIAS (RECARGAR DESDE FIRESTORE)
// =============================================
async function refrescarIncidencias() {
    const btnRefrescar = document.getElementById('btnRefrescar');
    if (btnRefrescar) {
        btnRefrescar.classList.add('fa-spin');
    }

    // Limpiar cache para forzar recarga
    if (incidenciaManager && incidenciaManager.limpiarCache) {
        incidenciaManager.limpiarCache();
    }
    
    await cargarIncidenciasCanalizadas();

    setTimeout(() => {
        if (btnRefrescar) {
            btnRefrescar.classList.remove('fa-spin');
        }
    }, 500);
}

// =============================================
// VER DETALLES DE INCIDENCIA (CON REGISTRO)
// =============================================
window.verDetallesIncidencia = async function (incidenciaId, event) {
    event?.stopPropagation();
    
    const incidencia = incidenciasCache.find(i => i.id === incidenciaId);
    if (incidencia) {
        await registrarVisualizacionIncidencia(incidencia);
    }
    
    window.location.href = `../verIncidencias/verIncidencias.html?id=${incidenciaId}`;
};

window.seguimientoIncidencia = function (incidenciaId, event) {
    event?.stopPropagation();
    window.location.href = `../seguimientoIncidencias/segimientoIncidencias.html?id=${incidenciaId}`;
};

// =============================================
// MOSTRAR DETALLES DE CANALIZACIÓN
// =============================================
async function mostrarDetallesCanalizacion(incidenciaId, event) {
    event?.stopPropagation();

    const incidencia = incidenciasCache.find(i => i.id === incidenciaId);
    if (!incidencia) return;

    await registrarVisualizacionDetallesCanalizacion(incidencia);

    const modal = document.getElementById('modalDetallesCanalizacion');
    const modalBody = document.getElementById('modalCanalizacionBody');

    if (!modal || !modalBody) return;

    // Obtener todas las canalizaciones
    const canalizaciones = incidencia.getCanalizacionesArray ?
        incidencia.getCanalizacionesArray() :
        Object.values(incidencia.canalizaciones || {});

    let timelineHtml = '';

    if (canalizaciones.length === 0) {
        timelineHtml = '<p style="text-align:center; color: var(--color-text-dim);">No hay información de canalización disponible</p>';
    } else {
        timelineHtml = '<div class="canalizacion-timeline" style="max-height: 400px; overflow-y: auto; padding-right: 10px;">';
        
        canalizaciones.forEach((canal, index) => {
            const esActual = (canal.areaId && canal.areaId.toLowerCase() === (areaActual.id || '').toLowerCase()) ||
                            (canal.areaNombre && canal.areaNombre.toLowerCase() === (areaActual.nombre || '').toLowerCase());
            const fecha = canal.fechaCanalizacion ? new Date(canal.fechaCanalizacion).toLocaleString('es-MX') : 'Fecha no disponible';
            
            // Determinar estado de la canalización
            let estadoCanalizacion = canal.estado || 'pendiente';
            let estadoColor = estadoCanalizacion === 'atendida' ? '#28a745' : '#ffc107';
            let estadoTexto = estadoCanalizacion === 'atendida' ? 'Atendida' : 'Pendiente';

            timelineHtml += `
                <div class="timeline-item ${esActual ? 'destino' : 'origen'}" style="${esActual ? 'border-left-color: var(--color-accent-primary);' : ''}">
                    <div class="timeline-content">
                        <h6><i class="fas ${esActual ? 'fa-map-pin' : 'fa-paper-plane'}"></i> ${esActual ? 'Tu área' : (canal.areaNombre || canal.areaId)}</h6>
                        <p><strong>Canalizado por:</strong> ${canal.canalizadoPorNombre || 'Sistema'}</p>
                        <p><strong>Fecha:</strong> ${fecha}</p>
                        <p><strong>Motivo:</strong> ${canal.motivo || 'Atención requerida'}</p>
                        <p><strong>Estado:</strong> <span class="estado-badge" style="display:inline-block; padding:2px 8px; font-size:0.7rem; background: ${estadoColor}20; color: ${estadoColor};">${estadoTexto}</span></p>
                    </div>
                </div>
            `;
        });
        
        timelineHtml += '</div>';
    }

    modalBody.innerHTML = `
        <div>
            ${timelineHtml}
        </div>
        <div class="asignacion-info" style="margin-top: 20px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.1);">
            <p><strong>ID Incidencia:</strong> ${incidencia.id}</p>
            <p><strong>Prioridad:</strong> <span class="riesgo-badge ${incidencia.nivelRiesgo}" style="display:inline-block;">${incidencia.nivelRiesgo}</span></p>
            <p><strong>Estado actual:</strong> <span class="estado-badge ${incidencia.estado}" style="display:inline-block;">${incidencia.estado}</span></p>
            ${canalizaciones.length > 1 ? `<p><span class="origen-badge"><i class="fas fa-layer-group"></i> Canalizada a ${canalizaciones.length} áreas</span></p>` : ''}
        </div>
    `;

    modal.classList.add('show');
}

// =============================================
// FUNCIÓN PARA VER PDF EN VISOR NATIVO DEL NAVEGADOR
// =============================================
window.verPDF = async function (incidenciaId, event) {
    event?.stopPropagation();

    try {
        const incidencia = incidenciasCache.find(i => i.id === incidenciaId);
        if (!incidencia) {
            throw new Error('Incidencia no encontrada');
        }

        // ✅ Registrar apertura de PDF
        await registrarAperturaPDF(incidencia);

        if (incidencia.pdfUrl) {
            // Abrir PDF en nueva pestaña con visor nativo del navegador
            window.open(incidencia.pdfUrl, '_blank');
        } else {
            Swal.fire({
                icon: 'info',
                title: 'PDF no disponible',
                text: 'Esta incidencia aún no tiene un PDF generado.'
            });
        }
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
async function inicializarIncidenciaManager() {
    try {
        console.log('🚀 Inicializando módulo de incidencias canalizadas...');

        await obtenerDatosOrganizacion();
        await obtenerTokenAuth();
        await obtenerAreaUsuario();

        const { IncidenciaManager } = await import('/clases/incidencia.js');
        incidenciaManager = new IncidenciaManager();

        const { NotificacionAreaManager } = await import('/clases/notificacionArea.js');
        notificacionManager = new NotificacionAreaManager();

        // Cargar datos en paralelo
        await Promise.all([
            cargarSucursales().catch(() => {}),
            cargarCategorias().catch(() => {}),
            cargarUsuarios().catch(() => {})
        ]);

        await procesarSubcategoriasDesdeCategorias();
        await cargarIncidenciasCanalizadas();

        configurarEventListeners();
        actualizarEstadisticas();

        console.log('✅ Módulo de incidencias canalizadas inicializado correctamente');

        return true;

    } catch (error) {
        console.error('❌ Error al inicializar:', error);
        mostrarErrorInicializacion();
        return false;
    }
}

// =============================================
// CONFIGURAR EVENT LISTENERS
// =============================================
function configurarEventListeners() {
    const btnFiltrar = document.getElementById('btnFiltrar');
    const btnLimpiar = document.getElementById('btnLimpiarFiltros');
    const btnRefrescar = document.getElementById('btnRefrescar');

    if (btnFiltrar) btnFiltrar.addEventListener('click', aplicarFiltros);
    if (btnLimpiar) btnLimpiar.addEventListener('click', limpiarFiltros);
    if (btnRefrescar) btnRefrescar.addEventListener('click', refrescarIncidencias);
}

function aplicarFiltros() {
    filtrosActivos.estado = document.getElementById('filtroEstado')?.value || 'todos';
    filtrosActivos.nivelRiesgo = document.getElementById('filtroRiesgo')?.value || 'todos';
    filtrosActivos.sucursalId = document.getElementById('filtroSucursal')?.value || 'todos';
    paginaActual = 1;
    renderizarIncidencias();
}

function limpiarFiltros() {
    const filtroEstado = document.getElementById('filtroEstado');
    const filtroRiesgo = document.getElementById('filtroRiesgo');
    const filtroSucursal = document.getElementById('filtroSucursal');

    if (filtroEstado) filtroEstado.value = 'todos';
    if (filtroRiesgo) filtroRiesgo.value = 'todos';
    if (filtroSucursal) filtroSucursal.value = 'todos';

    filtrosActivos = { estado: 'todos', nivelRiesgo: 'todos', sucursalId: 'todos' };
    paginaActual = 1;
    renderizarIncidencias();
}

function filtrarIncidencias(incidencias) {
    return incidencias.filter(inc => {
        if (filtrosActivos.estado !== 'todos' && inc.estado !== filtrosActivos.estado) return false;
        if (filtrosActivos.nivelRiesgo !== 'todos' && inc.nivelRiesgo !== filtrosActivos.nivelRiesgo) return false;
        if (filtrosActivos.sucursalId !== 'todos' && inc.sucursalId !== filtrosActivos.sucursalId) return false;
        return true;
    });
}

function obtenerFechaCanalizacionMasReciente(incidencia) {
    if (!incidencia.canalizaciones || Object.keys(incidencia.canalizaciones).length === 0) {
        return incidencia.fechaCreacion || incidencia.fechaInicio || new Date(0);
    }

    const fechas = Object.values(incidencia.canalizaciones)
        .map(c => c.fechaCanalizacion ? new Date(c.fechaCanalizacion) : new Date(0));
    return new Date(Math.max(...fechas));
}

function renderizarPaginacion(totalPaginas) {
    const pagination = document.getElementById('pagination');
    if (!pagination) return;

    if (totalPaginas <= 1) {
        pagination.innerHTML = '';
        return;
    }

    let html = '';
    for (let i = 1; i <= totalPaginas; i++) {
        html += `<li class="page-item ${i === paginaActual ? 'active' : ''}"><button class="page-link" onclick="window.irPagina(${i})">${i}</button></li>`;
    }
    pagination.innerHTML = html;
}

window.irPagina = function (pagina) {
    paginaActual = pagina;
    renderizarIncidencias();
    document.querySelector('.card-body')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// =============================================
// FUNCIONES AUXILIARES
// =============================================
function obtenerUsuarioActual() {
    try {
        const userData = JSON.parse(localStorage.getItem('userData') || '{}');
        const adminInfo = JSON.parse(localStorage.getItem('adminInfo') || '{}');
        
        return {
            id: userData.id || adminInfo.id || userData.uid || adminInfo.uid,
            nombreCompleto: userData.nombreCompleto || adminInfo.nombreCompleto || 'Usuario',
            organizacion: userData.organizacion || adminInfo.organizacion || 'Sin organización',
            organizacionCamelCase: userData.organizacionCamelCase || adminInfo.organizacionCamelCase || '',
            correoElectronico: userData.correoElectronico || adminInfo.correoElectronico || ''
        };
    } catch (error) {
        console.error('Error obteniendo usuario actual:', error);
        return null;
    }
}

function formatearNombreArea(areaId) {
    if (!areaId) return 'No especificada';
    if (NOMBRES_AREA[areaId.toLowerCase()]) return NOMBRES_AREA[areaId.toLowerCase()];
    return areaId.split('_').map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
}

function actualizarInterfazArea() {
    const areaActualNombre = document.getElementById('areaActualNombre');
    const badgeAreaInfo = document.getElementById('badgeAreaInfo');
    if (areaActualNombre) areaActualNombre.textContent = areaActual.nombre;
    if (badgeAreaInfo) badgeAreaInfo.innerHTML = `<i class="fas ${areaActual.icono}"></i> Canalizadas - ${areaActual.nombre}`;
}

async function obtenerTokenAuth() {
    try {
        if (window.firebase) {
            const user = firebase.auth().currentUser;
            if (user) authToken = await user.getIdToken();
        }
        if (!authToken) {
            authToken = localStorage.getItem('firebaseToken') || localStorage.getItem('authToken') || localStorage.getItem('token');
        }
    } catch (error) {
        authToken = null;
    }
}

async function obtenerDatosOrganizacion() {
    try {
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

async function cargarSucursales() {
    try {
        const { SucursalManager } = await import('/clases/sucursal.js');
        const sucursalManager = new SucursalManager();
        if (organizacionActual.camelCase) {
            sucursalesCache = await sucursalManager.getSucursalesByOrganizacion(organizacionActual.camelCase);
            const filtroSucursal = document.getElementById('filtroSucursal');
            if (filtroSucursal) {
                filtroSucursal.innerHTML = '<option value="todos">Todas las sucursales</option>';
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
        categoriasCache = await categoriaManager.obtenerTodasCategorias();
    } catch (error) {
        console.error('Error cargando categorías:', error);
        categoriasCache = [];
    }
}

async function procesarSubcategoriasDesdeCategorias() {
    try {
        subcategoriasCache = [];
        if (!categoriasCache || categoriasCache.length === 0) return;
        categoriasCache.forEach(categoria => {
            if (categoria.subcategorias) {
                if (categoria.subcategorias instanceof Map) {
                    categoria.subcategorias.forEach((sub, id) => {
                        subcategoriasCache.push({
                            id: id, nombre: sub.nombre || 'Sin nombre', descripcion: sub.descripcion || '',
                            color: sub.color || categoria.color, heredaColor: sub.heredaColor !== false,
                            categoriaId: categoria.id, categoriaNombre: categoria.nombre
                        });
                    });
                } else if (typeof categoria.subcategorias === 'object' && categoria.subcategorias !== null) {
                    Object.keys(categoria.subcategorias).forEach(id => {
                        const sub = categoria.subcategorias[id];
                        subcategoriasCache.push({
                            id: id, nombre: sub.nombre || 'Sin nombre', descripcion: sub.descripcion || '',
                            color: sub.color || categoria.color, heredaColor: sub.heredaColor !== false,
                            categoriaId: categoria.id, categoriaNombre: categoria.nombre
                        });
                    });
                } else if (Array.isArray(categoria.subcategorias)) {
                    categoria.subcategorias.forEach((sub, index) => {
                        subcategoriasCache.push({
                            id: sub.id || `sub_${categoria.id}_${index}`, nombre: sub.nombre || 'Sin nombre',
                            descripcion: sub.descripcion || '', color: sub.color || categoria.color,
                            heredaColor: sub.heredaColor !== false, categoriaId: categoria.id,
                            categoriaNombre: categoria.nombre
                        });
                    });
                }
            }
        });
    } catch (error) {
        console.error('Error procesando subcategorías:', error);
        subcategoriasCache = [];
    }
}

async function cargarUsuarios() {
    try {
        const modulo = await import('/clases/user.js').catch(() => null);
        if (!modulo) { usuariosCache = []; return; }
        const UsuarioManager = modulo.UsuarioManager || modulo.default || modulo;
        if (typeof UsuarioManager !== 'function') { usuariosCache = []; return; }
        const usuarioManager = new UsuarioManager();
        if (organizacionActual.camelCase && typeof usuarioManager.obtenerUsuariosPorOrganizacion === 'function') {
            usuariosCache = await usuarioManager.obtenerUsuariosPorOrganizacion(organizacionActual.camelCase);
        } else { usuariosCache = []; }
    } catch (error) {
        console.error('Error cargando usuarios:', error);
        usuariosCache = [];
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

function obtenerNombreSubcategoria(subcategoriaId) {
    if (!subcategoriaId) return 'No especificada';
    const subcategoria = subcategoriasCache.find(s => s.id === subcategoriaId);
    return subcategoria ? subcategoria.nombre : 'No disponible';
}

function escapeHTML(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function mostrarError(mensaje) {
    const tbody = document.getElementById('tablaIncidenciasBody');
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:40px;"><div style="color: #ef4444;"><i class="fas fa-exclamation-circle" style="font-size: 48px; margin-bottom: 16px;"></i><h5>Error</h5><p>${escapeHTML(mensaje)}</p><button class="btn-nueva-incidencia-header" onclick="location.reload()" style="margin-top: 16px;"><i class="fas fa-sync-alt"></i> Reintentar</button></div></td></tr>`;
    }
}

function mostrarErrorInicializacion() {
    const tbody = document.getElementById('tablaIncidenciasBody');
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:40px;"><div style="color: #ef4444;"><i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 16px;"></i><h5>Error de inicialización</h5><p>No se pudo cargar el módulo de incidencias canalizadas.</p><button class="btn-nueva-incidencia-header" onclick="location.reload()" style="margin-top: 16px;"><i class="fas fa-sync-alt"></i> Reintentar</button></div></td></tr>`;
    }
}

// Registro de actividades (mantener tus funciones existentes)
async function registrarAccesoVistaIncidenciasCanalizadas() { /* mantener tu implementación */ }
async function registrarVisualizacionIncidencia(incidencia) { /* mantener tu implementación */ }
async function registrarVisualizacionDetallesCanalizacion(incidencia) { /* mantener tu implementación */ }
async function registrarAperturaPDF(incidencia) { /* mantener tu implementación */ }

// Cerrar modal
window.cerrarModalCanalizacion = function () {
    const modal = document.getElementById('modalDetallesCanalizacion');
    if (modal) modal.classList.remove('show');
};

document.addEventListener('click', (e) => {
    const modal = document.getElementById('modalDetallesCanalizacion');
    if (modal && modal.classList.contains('show')) {
        if (!e.target.closest('.modal-content') && !e.target.closest('[data-action="detalles-canalizacion"]')) {
            modal.classList.remove('show');
        }
    }
});

// INICIALIZACIÓN
document.addEventListener('DOMContentLoaded', async function () {
    await inicializarIncidenciaManager();
});

window.refrescarIncidencias = refrescarIncidencias;
window.mostrarDetallesCanalizacion = mostrarDetallesCanalizacion;
window.verPDF = verPDF;