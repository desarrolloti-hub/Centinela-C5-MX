/**
 * CATEGORIAS - Sistema Centinela
 * VERSIÓN ACTUALIZADA - Con paginación y búsqueda en base de datos
 * AHORA CON REGISTRO DE BITÁCORA
 */

// =============================================
// VARIABLES GLOBALES
// =============================================
let categoriaManager = null;
let categoriaExpandidaId = null;
let empresaActual = null;
let categoriasCache = [];
let todasLasCategorias = []; // Almacena todas las categorías para búsqueda
let historialManager = null; // ✅ NUEVO: Para registrar actividades

// Configuración de paginación
const ITEMS_POR_PAGINA = 10;
let paginaActual = 1;

// Estado de búsqueda
let terminoBusqueda = '';

// =============================================
// INICIALIZACIÓN
//==============================================
async function inicializarCategoriaManager() {
    try {
        obtenerDatosEmpresa();

        // ✅ NUEVO: Inicializar historialManager
        await inicializarHistorial();

        const { CategoriaManager } = await import('/clases/categoria.js');
        categoriaManager = new CategoriaManager();

        await cargarTodasLasCategorias(); // Carga todas para búsqueda
        configurarEventListeners();

        // ✅ NUEVO: Registrar acceso a la vista de categorías
        await registrarAccesoVistaCategorias();

        return true;
    } catch (error) {
        mostrarErrorInicializacion();
        return false;
    }
}

// ✅ NUEVO: Inicializar historialManager
async function inicializarHistorial() {
    try {
        const { HistorialUsuarioManager } = await import('/clases/historialUsuario.js');
        historialManager = new HistorialUsuarioManager();
    } catch (error) {
        // Error handling without console
    }
}

// ✅ NUEVO: Registrar acceso a la vista de categorías
async function registrarAccesoVistaCategorias() {
    if (!historialManager) return;

    try {
        const usuario = obtenerUsuarioActual();
        if (!usuario) return;

        await historialManager.registrarActividad({
            usuario: usuario,
            tipo: 'leer',
            modulo: 'categorias',
            descripcion: 'Accedió a la vista de categorías',
            detalles: {
                totalCategorias: todasLasCategorias.length || 0
            }
        });
    } catch (error) {
        // Error handling without console
    }
}

// ✅ NUEVO: Registrar visualización de detalles de categoría
async function registrarVisualizacionCategoria(categoria, tipo = 'verDetalles') {
    if (!historialManager) return;

    try {
        const usuario = obtenerUsuarioActual();
        if (!usuario) return;

        let numSub = 0;
        if (categoria.subcategorias) {
            if (categoria.subcategorias.size !== undefined) {
                numSub = categoria.subcategorias.size;
            } else {
                numSub = Object.keys(categoria.subcategorias).length;
            }
        }

        await historialManager.registrarActividad({
            usuario: usuario,
            tipo: 'leer',
            modulo: 'categorias',
            descripcion: `Visualizó detalles de categoría: ${categoria.nombre}`,
            detalles: {
                categoriaId: categoria.id,
                categoriaNombre: categoria.nombre,
                numeroSubcategorias: numSub,
                accion: tipo
            }
        });
    } catch (error) {
        // Error handling without console
    }
}

// ✅ NUEVO: Obtener usuario actual
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
                correo: adminData.correoElectronico || '',
                email: adminData.correoElectronico || ''
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
                correo: userData.correo || userData.email || '',
                email: userData.correo || userData.email || ''
            };
        }

        return null;
    } catch (error) {
        return null;
    }
}

function obtenerDatosEmpresa() {
    try {
        const userData = JSON.parse(localStorage.getItem('userData') || '{}');
        empresaActual = {
            nombre: userData.organizacion || 'Mi Empresa',
            camelCase: userData.organizacionCamelCase || ''
        };
    } catch (error) {
        empresaActual = { nombre: 'Mi Empresa', camelCase: '' };
    }
}

function configurarEventListeners() {
    const btnBuscar = document.getElementById('btnBuscar');
    const btnLimpiar = document.getElementById('btnLimpiarBusqueda');
    const inputBuscar = document.getElementById('buscarCategoria');

    if (btnBuscar) {
        btnBuscar.addEventListener('click', () => {
            terminoBusqueda = inputBuscar?.value.trim() || '';
            paginaActual = 1;
            filtrarYRenderizar();
        });
    }

    if (btnLimpiar) {
        btnLimpiar.addEventListener('click', () => {
            if (inputBuscar) inputBuscar.value = '';
            terminoBusqueda = '';
            paginaActual = 1;
            filtrarYRenderizar();
        });
    }

    // Búsqueda en tiempo real (con debounce para no saturar)
    if (inputBuscar) {
        let timeoutId;
        inputBuscar.addEventListener('input', (e) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                terminoBusqueda = e.target.value.trim();
                paginaActual = 1;
                filtrarYRenderizar();
            }, 300); // Espera 300ms después de que el usuario deja de escribir
        });

        inputBuscar.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                terminoBusqueda = e.target.value.trim();
                paginaActual = 1;
                filtrarYRenderizar();
            }
        });
    }
}

// =============================================
// FUNCIONES DE BÚSQUEDA EN BASE DE DATOS
// =============================================
async function buscarCategoriasEnDB(termino) {
    if (!categoriaManager) return [];

    try {
        if (!termino || termino.length < 2) {
            // Si el término es muy corto, devolver todas
            return await categoriaManager.obtenerTodasCategorias();
        }

        // Obtener todas las categorías y filtrar en memoria por ahora
        // Si tu CategoriaManager tuviera un método de búsqueda en Firestore, sería mejor
        const todas = await categoriaManager.obtenerTodasCategorias();

        const terminoLower = termino.toLowerCase();
        return todas.filter(cat =>
            cat.nombre?.toLowerCase().includes(terminoLower) ||
            cat.descripcion?.toLowerCase().includes(terminoLower)
        );
    } catch (error) {
        return [];
    }
}

// =============================================
// CARGAR CATEGORÍAS
// =============================================
async function cargarTodasLasCategorias() {
    if (!categoriaManager) return;

    try {
        const tbody = document.getElementById('tablaCategoriasBody');
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:40px;">Cargando categorías...</td></tr>';

        todasLasCategorias = await categoriaManager.obtenerTodasCategorias();

        if (!todasLasCategorias || todasLasCategorias.length === 0) {
            mostrarMensajeVacio();
            return;
        }

        // Ordenar alfabéticamente
        todasLasCategorias.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

        // Inicializar la vista con todas las categorías
        categoriasCache = [...todasLasCategorias];
        renderizarCategorias();

    } catch (error) {
        mostrarError('Error al cargar categorías: ' + error.message);
    }
}

function filtrarYRenderizar() {
    if (!todasLasCategorias.length) {
        renderizarCategorias();
        return;
    }

    if (!terminoBusqueda || terminoBusqueda.length < 2) {
        // Si no hay término de búsqueda, mostrar todas
        categoriasCache = [...todasLasCategorias];
    } else {
        // Filtrar en memoria
        const terminoLower = terminoBusqueda.toLowerCase();
        categoriasCache = todasLasCategorias.filter(cat =>
            (cat.nombre && cat.nombre.toLowerCase().includes(terminoLower)) ||
            (cat.descripcion && cat.descripcion.toLowerCase().includes(terminoLower))
        );
    }

    renderizarCategorias();
}

function mostrarMensajeVacio() {
    const tbody = document.getElementById('tablaCategoriasBody');
    tbody.innerHTML = `
        <tr>
            <td colspan="5" style="text-align:center; padding:60px 20px;">
                <div style="text-align:center;">
                    <i class="fas fa-tags" style="font-size:48px; color:rgba(16,185,129,0.3); margin-bottom:16px;"></i>
                    <h5 style="color:white;">No hay categorías</h5>
                    <a href="../crearCategorias/crearCategorias.html" class="btn-nueva-categoria-header" style="display:inline-flex; margin-top:16px;">
                        <i class="fas fa-plus-circle"></i> Crear Categoría
                    </a>
                </div>
            </td>
        </tr>
    `;

    const paginationInfo = document.getElementById('paginationInfo');
    if (paginationInfo) paginationInfo.textContent = 'Mostrando 0-0 de 0 categorías';

    const pagination = document.getElementById('pagination');
    if (pagination) pagination.innerHTML = '';
}

function renderizarCategorias() {
    const tbody = document.getElementById('tablaCategoriasBody');
    if (!tbody) return;

    const totalItems = categoriasCache.length;
    const totalPaginas = Math.ceil(totalItems / ITEMS_POR_PAGINA);

    // Ajustar página actual si está fuera de rango
    if (paginaActual > totalPaginas && totalPaginas > 0) {
        paginaActual = totalPaginas;
    }

    const inicio = (paginaActual - 1) * ITEMS_POR_PAGINA;
    const fin = Math.min(inicio + ITEMS_POR_PAGINA, totalItems);
    const categoriasPagina = categoriasCache.slice(inicio, fin);

    // Actualizar información de paginación
    const paginationInfo = document.getElementById('paginationInfo');
    if (paginationInfo) {
        if (totalItems === 0) {
            paginationInfo.textContent = 'No se encontraron categorías';
        } else {
            paginationInfo.textContent = `Mostrando ${inicio + 1}-${fin} de ${totalItems} categorías`;
        }
    }

    if (totalItems === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align:center; padding:40px;">
                    <div style="color: var(--color-text-secondary);">
                        <i class="fas fa-search" style="font-size: 48px; margin-bottom: 16px; opacity: 0.3;"></i>
                        <h5>No se encontraron categorías</h5>
                        <p style="margin-top: 10px;">${terminoBusqueda ? `No hay resultados para "${terminoBusqueda}"` : ''}</p>
                    </div>
                </td>
            </tr>
        `;
        renderizarPaginacion(0);
        return;
    }

    tbody.innerHTML = '';

    for (const categoria of categoriasPagina) {
        crearFilaCategoria(categoria, tbody);
    }

    renderizarPaginacion(totalPaginas);
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
        html += `
            <li class="page-item ${i === paginaActual ? 'active' : ''}">
                <button class="page-link" onclick="window.irPagina(${i})">${i}</button>
            </li>
        `;
    }

    pagination.innerHTML = html;
}

// Hacer irPagina global para que funcione desde los botones
window.irPagina = function (pagina) {
    paginaActual = pagina;
    renderizarCategorias();

    // Scroll suave hacia arriba
    document.querySelector('.card-body')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

async function crearFilaCategoria(categoria, tbody) {
    const tr = document.createElement('tr');
    tr.className = 'categoria-row';
    tr.dataset.id = categoria.id;

    tr.onclick = (e) => {
        if (!e.target.closest('.action-buttons') && !e.target.closest('.btn') && !e.target.closest('.subcategoria-count-badge') && !e.target.closest('.toggle-icon')) {
            toggleSubcategorias(categoria.id);
        }
    };

    let numSub = 0;
    if (categoria.subcategorias) {
        if (categoria.subcategorias.size !== undefined) {
            numSub = categoria.subcategorias.size;
        } else {
            numSub = Object.keys(categoria.subcategorias).length;
        }
    }

    const color = categoria.color || '#2f8cff';

    const nombreTruncado = categoria.nombre && categoria.nombre.length > 30
        ? categoria.nombre.substring(0, 27) + '...'
        : categoria.nombre;

    tr.innerHTML = `
        <td class="text-center" style="width:50px;" data-label="">
            <span class="toggle-icon"><i class="fas fa-chevron-right"></i></span>
        </td>
        <td data-label="Nombre">
            <div style="display: flex; align-items: center;">
                <div style="width:4px; height:24px; background:${color}; border-radius:2px; margin-right:12px; flex-shrink:0;"></div>
                <div>
                    <strong style="color:white;" title="${escapeHTML(categoria.nombre || '')}">${escapeHTML(nombreTruncado)}</strong>
                </div>
            </div>
        </td>
        <td data-label="Color">
            <div style="display: inline-flex; align-items: center; justify-content: center; gap: 8px; background: rgba(0,0,0,0.2); padding: 4px 12px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.05);">
                <span style="width: 24px; height: 24px; border-radius: 6px; display: inline-block; background-color: ${color}; border: 2px solid rgba(255,255,255,0.1); box-shadow: 0 2px 8px rgba(0,0,0,0.1);"></span>
                <span style="color: var(--color-text-dim); font-size: 0.8rem;">${color}</span>
            </div>
        </td>
        <td data-label="Subcategorías">
            <span class="${numSub > 0 ? 'subcategoria-count-badge' : 'badge'}" style="${numSub === 0 ? 'background:rgba(107,114,128,0.2); color:#9ca3af;' : ''}">               
                ${numSub} ${numSub === 1 ? 'subcategoría' : 'subcategorías'}
            </span>
        </td>
        <td data-label="Acciones">
            <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                <button type="button" class="btn" data-action="ver" data-id="${categoria.id}" title="Ver detalles">
                    <i class="fas fa-eye"></i>
                </button>
                <button type="button" class="btn btn-warning" data-action="editar" data-id="${categoria.id}" title="Editar">
                    <i class="fas fa-edit"></i>
                </button>
                <button type="button" class="btn btn-danger" data-action="eliminar" data-id="${categoria.id}" title="Eliminar">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </td>
    `;

    tbody.appendChild(tr);

    const subRow = document.createElement('tr');
    subRow.className = 'subcategoria-row';
    subRow.id = `sub-${categoria.id}`;
    subRow.style.display = 'none';

    subRow.innerHTML = `
        <td colspan="5" style="padding:0; border-top:none;">
            <div style="background: linear-gradient(to bottom, rgba(0,0,0,0.3), rgba(0,0,0,0.5)); padding: 20px; border-radius: 0 0 20px 20px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
                    <h6 style="color: white; font-size: 93%; font-weight: 580; margin: 0; display: flex; align-items: center; gap: 8px;">
                        <i class="fas fa-list-ul" style="color: white; filter: "></i>
                        Subcategorías de <span style="color:#2f8cff;">"${escapeHTML(categoria.nombre)}"</span>
                    </h6>
                    <button class="btn-agregar-sub" onclick="window.agregarSubcategoria('${categoria.id}', event)">
                        <i class="fas fa-plus-circle"></i> Agregar
                    </button>
                </div>
                <div id="sub-content-${categoria.id}">
                    <div style="text-align:center; padding:20px; color:#6b7280;">
                        <i class="fas fa-spinner fa-spin"></i> Cargando subcategorías...
                    </div>
                </div>
            </div>
        </td>
    `;

    tbody.appendChild(subRow);

    setTimeout(() => {
        tr.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                const id = btn.dataset.id;
                if (action === 'ver') window.verDetalles(id, e);
                else if (action === 'editar') window.editarCategoria(id, e);
                else if (action === 'eliminar') window.eliminarCategoria(id, e);
            });
        });

        const badge = tr.querySelector('.subcategoria-count-badge');
        if (badge) {
            badge.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleSubcategorias(categoria.id);
            });
        }

        const toggleIcon = tr.querySelector('.toggle-icon');
        if (toggleIcon) {
            toggleIcon.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleSubcategorias(categoria.id);
            });
        }
    }, 50);

    await cargarSubcategorias(categoria.id);
}

// =============================================
// FUNCIONES GLOBALES (se mantienen igual)
// =============================================
window.editarCategoria = function (id, event) {
    event?.stopPropagation();
    window.location.href = `../editarCategorias/editarCategorias.html?id=${id}`;
};

window.agregarSubcategoria = function (id, event) {
    event?.stopPropagation();
    window.location.href = `../editarCategorias/editarCategorias.html?id=${id}&nuevaSubcategoria=true`;
};

window.editarSubcategoria = function (catId, subId, event) {
    event?.stopPropagation();
    window.location.href = `../editarCategorias/editarCategorias.html?id=${catId}&editarSubcategoria=${subId}`;
};

// =============================================
// VER DETALLES - SweetAlert CON REGISTRO EN BITÁCORA
// =============================================
window.verDetalles = async function (categoriaId, event) {
    event?.stopPropagation();

    const categoria = categoriasCache.find(c => c.id === categoriaId) ||
        todasLasCategorias.find(c => c.id === categoriaId);
    if (!categoria) return;

    // ✅ NUEVO: Registrar visualización de categoría
    await registrarVisualizacionCategoria(categoria, 'verDetalles');

    // Obtener subcategorías como array
    let subcategoriasArray = [];

    if (categoria.subcategorias && typeof categoria.subcategorias === 'object') {
        if (categoria.subcategorias.forEach) {
            categoria.subcategorias.forEach((value, key) => {
                if (value && typeof value === 'object') {
                    const sub = value instanceof Map ? Object.fromEntries(value) : value;
                    subcategoriasArray.push({ ...sub, id: key });
                }
            });
        } else {
            subcategoriasArray = Object.keys(categoria.subcategorias).map(key => ({
                ...categoria.subcategorias[key],
                id: key
            }));
        }
    }

    const cantidadSub = subcategoriasArray.length;

    // Generar HTML para subcategorías
    let subcategoriasHTML = '';

    if (cantidadSub === 0) {
        subcategoriasHTML = '<p style="color: var(--color-text-secondary); text-align: center; padding: 20px;">Esta categoría no tiene subcategorías asignadas</p>';
    } else {
        subcategoriasHTML = subcategoriasArray.map(sub => {
            const subNombre = sub.nombre || 'Sin nombre';
            const subDesc = sub.descripcion || 'Sin descripción';

            return `
                <div style="margin-bottom: 15px; padding: 10px; background: rgba(255,255,255,0.02); border-radius: 6px;">
                    <strong style="color: var(--color-text-primary); display: block; margin-bottom: 5px;">
                        <i class="fas fa-folder" style="color: var(--color-accent-secondary); margin-right: 8px;"></i>
                        ${escapeHTML(subNombre)}
                    </strong>
                    <p style="color: var(--color-text-secondary); margin: 0; padding-left: 24px; font-size: 0.9rem;">${escapeHTML(subDesc)}</p>
                </div>
            `;
        }).join('');
    }

    Swal.fire({
        title: categoria.nombre,
        html: `
            <div style="text-align: left;">
                <div style="margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid var(--color-border-light);">
                    <h4 style="color: var(--color-accent-primary); margin: 0 0 10px 0; font-size: 0.9rem; text-transform: uppercase;">
                        <i class="fas fa-align-left" style="margin-right: 8px;"></i>DESCRIPCIÓN
                    </h4>
                    <p style="color: var(--color-text-secondary); margin: 0;">${escapeHTML(categoria.descripcion) || 'No hay descripción disponible para esta categoría.'}</p>
                </div>

                <div style="margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid var(--color-border-light);">
                    <h4 style="color: var(--color-accent-primary); margin: 0 0 10px 0; font-size: 0.9rem; text-transform: uppercase;">
                        <i class="fas fa-palette" style="margin-right: 8px;"></i>COLOR
                    </h4>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="display:inline-block; width:30px; height:30px; background:${categoria.color || '#2f8cff'}; border-radius:4px; border:2px solid rgba(255,255,255,0.1);"></span>
                        <span style="color: var(--color-text-secondary);">${categoria.color || '#2f8cff'}</span>
                    </div>
                </div>

                <div>
                    <h4 style="color: var(--color-accent-primary); margin: 0 0 10px 0; font-size: 0.9rem; text-transform: uppercase;">
                        <i class="fas fa-folder-open" style="margin-right: 8px;"></i>SUBCATEGORÍAS (${cantidadSub})
                    </h4>
                    ${subcategoriasHTML}
                </div>
            </div>
        `,
        icon: null,
        showConfirmButton: true,
        showCancelButton: true,
        confirmButtonText: 'EDITAR CATEGORÍA',
        cancelButtonText: 'CERRAR',
        reverseButtons: false
    }).then((result) => {
        if (result.isConfirmed) {
            window.editarCategoria(categoria.id, event);
        }
    });
};

// =============================================
// VER DETALLES DE SUBCATEGORÍA CON REGISTRO EN BITÁCORA
// =============================================
window.verDetallesSubcategoria = async function (categoriaId, subcategoriaId, event) {
    event?.stopPropagation();

    const categoria = categoriasCache.find(c => c.id === categoriaId) ||
        todasLasCategorias.find(c => c.id === categoriaId);
    if (!categoria) return;

    let subcategoria = null;
    let subcategoriaNombre = '';

    if (categoria.subcategorias) {
        if (categoria.subcategorias.get) {
            const sub = categoria.subcategorias.get(subcategoriaId);
            if (sub) {
                subcategoria = sub instanceof Map ? Object.fromEntries(sub) : sub;
            }
        } else {
            subcategoria = categoria.subcategorias[subcategoriaId];
        }
    }

    if (!subcategoria) {
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'Subcategoría no encontrada'
        });
        return;
    }

    subcategoriaNombre = subcategoria.nombre || 'Sin nombre';

    // ✅ NUEVO: Registrar visualización de subcategoría
    if (historialManager) {
        try {
            const usuario = obtenerUsuarioActual();
            if (usuario) {
                await historialManager.registrarActividad({
                    usuario: usuario,
                    tipo: 'leer',
                    modulo: 'categorias',
                    descripcion: `Visualizó detalles de subcategoría: ${subcategoriaNombre} (categoría: ${categoria.nombre})`,
                    detalles: {
                        categoriaId: categoriaId,
                        categoriaNombre: categoria.nombre,
                        subcategoriaId: subcategoriaId,
                        subcategoriaNombre: subcategoriaNombre
                    }
                });
            }
        } catch (error) {
            // Error handling without console
        }
    }

    const colorSub = subcategoria.color || categoria.color || '#2f8cff';
    const hereda = subcategoria.heredaColor || false;

    Swal.fire({
        title: subcategoria.nombre || 'Subcategoría',
        html: `
            <div style="text-align: left;">
                <div style="margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid var(--color-border-light);">
                    <h4 style="color: var(--color-accent-primary); margin: 0 0 10px 0; font-size: 0.9rem; text-transform: uppercase;">
                        <i class="fas fa-sitemap" style="margin-right: 8px;"></i>CATEGORÍA PADRE
                    </h4>
                    <p style="color: var(--color-text-secondary); margin: 0;">${escapeHTML(categoria.nombre)}</p>
                </div>

                <div style="margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid var(--color-border-light);">
                    <h4 style="color: var(--color-accent-primary); margin: 0 0 10px 0; font-size: 0.9rem; text-transform: uppercase;">
                        <i class="fas fa-align-left" style="margin-right: 8px;"></i>DESCRIPCIÓN
                    </h4>
                    <p style="color: var(--color-text-secondary); margin: 0;">${escapeHTML(subcategoria.descripcion) || 'No hay descripción disponible.'}</p>
                </div>

                <div style="margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid var(--color-border-light);">
                    <h4 style="color: var(--color-accent-primary); margin: 0 0 10px 0; font-size: 0.9rem; text-transform: uppercase;">
                        <i class="fas fa-palette" style="margin-right: 8px;"></i>COLOR
                    </h4>
                    <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                        <span style="display:inline-block; width:30px; height:30px; background:${colorSub}; border-radius:4px; border:2px solid rgba(255,255,255,0.1);"></span>
                        <span style="color: var(--color-text-secondary);">${colorSub}</span>
                        ${hereda ? '<span style="background:rgba(16,185,129,0.1); color:#10b981; padding:2px 8px; border-radius:12px; font-size:0.7rem;">HEREDA</span>' : ''}
                    </div>
                </div>

                    </div>
                </div>
            </div>
        `,
        icon: null,
        showConfirmButton: true,
        showCancelButton: true,
        confirmButtonText: 'EDITAR SUBCATEGORÍA',
        cancelButtonText: 'CERRAR',
        reverseButtons: false
    }).then((result) => {
        if (result.isConfirmed) {
            window.editarSubcategoria(categoriaId, subcategoriaId, event);
        }
    });
};

// =============================================
// ELIMINAR CATEGORÍA (se mantiene igual)
// =============================================
window.eliminarCategoria = async function (categoriaId, event) {
    event?.stopPropagation();

    const categoria = categoriasCache.find(c => c.id === categoriaId) ||
        todasLasCategorias.find(c => c.id === categoriaId);
    if (!categoria) return;

    // Contar subcategorías
    let numSub = 0;

    if (categoria.subcategorias) {
        if (typeof categoria.subcategorias === 'object') {
            if (categoria.subcategorias.forEach) {
                numSub = categoria.subcategorias.size;
            } else {
                numSub = Object.keys(categoria.subcategorias).length;
            }
        }
    }

    const result = await Swal.fire({
        title: '¿Eliminar categoría?',
        html: `
            <p style="color: var(--color-text-primary); margin: 10px 0; font-size: 1.1rem;">
                <strong style="color: #ff4d4d;">"${escapeHTML(categoria.nombre)}"</strong>
            </p>
            ${numSub > 0 ? `
                <p style="color: var(--color-text-secondary); font-size: 0.9rem; margin: 5px 0;">
                    <i class="fas fa-folder-open" style="color: #ef4444;"></i>
                    Tiene ${numSub} subcategoría${numSub !== 1 ? 's' : ''}
                </p>
            ` : ''}
            <p style="color: var(--color-text-dim); font-size: 0.8rem; margin-top: 15px;">
                Esta acción no se puede deshacer.
            </p>
        `,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'ELIMINAR',
        cancelButtonText: 'CANCELAR',
        reverseButtons: false,
        focusCancel: true
    });

    if (result.isConfirmed) {
        try {
            Swal.fire({
                title: 'Eliminando...',
                html: '<i class="fas fa-spinner fa-spin" style="font-size: 48px; color: #ef4444;"></i>',
                allowOutsideClick: false,
                showConfirmButton: false
            });

            await categoriaManager.eliminarCategoria(categoriaId);

            Swal.close();

            await Swal.fire({
                icon: 'success',
                title: '¡Eliminada!',
                text: `"${categoria.nombre}" ha sido eliminada.`,
                timer: 2000,
                showConfirmButton: false
            });

            // Recargar datos
            await cargarTodasLasCategorias();

        } catch (error) {
            Swal.close();
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: error.message || 'Error al eliminar'
            });
        }
    }
};

// =============================================
// ELIMINAR SUBCATEGORÍA (se mantiene igual)
// =============================================
window.eliminarSubcategoria = async function (categoriaId, subcategoriaId, event) {
    event?.stopPropagation();

    const categoria = categoriasCache.find(c => c.id === categoriaId) ||
        todasLasCategorias.find(c => c.id === categoriaId);
    if (!categoria) {
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'Categoría no encontrada'
        });
        return;
    }

    let subcategoria = null;
    let subcategoriaNombre = '';

    if (categoria.subcategorias) {
        if (categoria.subcategorias.get) {
            const sub = categoria.subcategorias.get(subcategoriaId);
            if (sub) {
                subcategoria = sub instanceof Map ? Object.fromEntries(sub) : sub;
            }
        } else {
            subcategoria = categoria.subcategorias[subcategoriaId];
        }
    }

    if (!subcategoria) {
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'Subcategoría no encontrada'
        });
        return;
    }

    subcategoriaNombre = subcategoria.nombre || 'Sin nombre';

    const result = await Swal.fire({
        title: '¿Eliminar subcategoría?',
        html: `
            <p style="color: var(--color-text-primary); margin: 10px 0; font-size: 1.1rem;">
                <strong style="color: #ff4d4d;">"${escapeHTML(subcategoriaNombre)}"</strong>
            </p>
            <p style="color: var(--color-text-dim); font-size: 0.8rem; margin-top: 15px;">
                Esta acción no se puede deshacer.
            </p>
        `,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'ELIMINAR',
        cancelButtonText: 'CANCELAR',
        reverseButtons: false,
        focusCancel: true
    });

    if (result.isConfirmed) {
        try {
            if (categoria.eliminarSubcategoria) {
                categoria.eliminarSubcategoria(subcategoriaId);
            } else if (categoria.subcategorias && categoria.subcategorias.delete) {
                categoria.subcategorias.delete(subcategoriaId);
            } else {
                delete categoria.subcategorias[subcategoriaId];
            }

            await categoriaManager.actualizarCategoria(categoriaId, {
                nombre: categoria.nombre,
                descripcion: categoria.descripcion,
                color: categoria.color,
                subcategorias: categoria.subcategorias
            });

            await Swal.fire({
                icon: 'success',
                title: '¡Eliminada!',
                text: `"${subcategoriaNombre}" ha sido eliminada.`,
                timer: 1500,
                showConfirmButton: false
            });

            const categoriaActualizada = await categoriaManager.obtenerCategoriaPorId(categoriaId);

            // Actualizar en ambos cachés
            const indexCache = categoriasCache.findIndex(c => c.id === categoriaId);
            if (indexCache !== -1) categoriasCache[indexCache] = categoriaActualizada;

            const indexAll = todasLasCategorias.findIndex(c => c.id === categoriaId);
            if (indexAll !== -1) todasLasCategorias[indexAll] = categoriaActualizada;

            await cargarSubcategorias(categoriaId);

            const categoriaRow = document.querySelector(`.categoria-row[data-id="${categoriaId}"]`);
            if (categoriaRow) {
                let numSub = 0;
                if (categoriaActualizada.subcategorias) {
                    numSub = categoriaActualizada.subcategorias.size ||
                        Object.keys(categoriaActualizada.subcategorias).length;
                }
                const badge = categoriaRow.querySelector('td[data-label="Subcategorías"] span');
                if (badge) {
                    badge.innerHTML = `${numSub} ${numSub === 1 ? 'subcategoría' : 'subcategorías'}`;
                    badge.className = numSub > 0 ? 'subcategoria-count-badge' : 'badge';
                }
            }

        } catch (error) {
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: error.message
            });
        }
    }
};

// =============================================
// CARGAR SUBCATEGORÍAS (se mantiene igual)
// =============================================
async function cargarSubcategorias(categoriaId) {
    const categoria = categoriasCache.find(c => c.id === categoriaId) ||
        todasLasCategorias.find(c => c.id === categoriaId);
    if (!categoria) return;

    const container = document.getElementById(`sub-content-${categoriaId}`);
    if (!container) return;

    let subcategoriasArray = [];

    try {
        if (categoria.subcategorias) {
            if (categoria.subcategorias.forEach) {
                categoria.subcategorias.forEach((value, key) => {
                    if (value && typeof value === 'object') {
                        const sub = value instanceof Map ? Object.fromEntries(value) : value;
                        subcategoriasArray.push({ ...sub, id: key });
                    }
                });
            } else {
                subcategoriasArray = Object.keys(categoria.subcategorias).map(key => ({
                    ...categoria.subcategorias[key],
                    id: key
                }));
            }
        }
    } catch (e) {
        subcategoriasArray = [];
    }

    if (subcategoriasArray.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:30px; background:rgba(0,0,0,0.2); border-radius:8px;">
                <i class="fas fa-folder-open" style="font-size:32px; color:#6b7280;"></i>
                <p style="color:#6b7280;">No hay subcategorías</p>
                <button class="btn-agregar-sub" onclick="window.agregarSubcategoria('${categoriaId}', event)">
                    <i class="fas fa-plus-circle"></i> Crear subcategoría
                </button>
            </div>
        `;
        return;
    }

    subcategoriasArray.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

    let html = `
        <div style="background: rgba(0,0,0,0.2); border-radius: 12px; overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; min-width: 100%;">
                <thead>
                    <tr>
                        <th style="padding: 12px; text-align: left; color: var(--color-text-dim); font-weight: 600; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid rgba(255,255,255,0.1); white-space: nowrap; font-family: 'Orbitron', sans-serif;">#</th>
                        <th style="padding: 12px; text-align: left; color: var(--color-text-dim); font-weight: 600; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid rgba(255,255,255,0.1); white-space: nowrap; font-family: 'Orbitron', sans-serif;">Nombre</th>
                        <th style="padding: 12px; text-align: left; color: var(--color-text-dim); font-weight: 600; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid rgba(255,255,255,0.1); white-space: nowrap; font-family: 'Orbitron', sans-serif;">Descripción</th>
                        <th style="padding: 12px; text-align: left; color: var(--color-text-dim); font-weight: 600; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid rgba(255,255,255,0.1); white-space: nowrap; font-family: 'Orbitron', sans-serif;">Color</th>
                        <th style="padding: 12px; text-align: left; color: var(--color-text-dim); font-weight: 600; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid rgba(255,255,255,0.1); white-space: nowrap; font-family: 'Orbitron', sans-serif;">Acciones</th>
                    </tr>
                </thead>
                <tbody>
    `;

    subcategoriasArray.forEach((sub, index) => {
        const colorSub = sub.color || categoria.color || '#2f8cff';
        const hereda = sub.heredaColor || false;

        const descripcionTruncada = sub.descripcion && sub.descripcion.length > 40
            ? sub.descripcion.substring(0, 37) + '...'
            : sub.descripcion || '';

        const nombreTruncado = sub.nombre && sub.nombre.length > 18
            ? sub.nombre.substring(0, 15) + '...'
            : sub.nombre || 'Sin nombre';

        html += `
            <tr>
                <td style="padding: 12px; border-bottom: 1px solid rgba(255,255,255,0.05); color: var(--color-text-secondary); vertical-align: middle; font-size: 0.85rem;">${index + 1}</td>
                <td style="padding: 12px; border-bottom: 1px solid rgba(255,255,255,0.05); color: var(--color-text-secondary); vertical-align: middle; font-size: 0.85rem;">
                    <div style="display: flex; align-items: center; flex-wrap: nowrap; gap: 8px;">
                        <span style="display:inline-block; width:12px; height:12px; background-color: ${colorSub}; border-radius: 6px; flex-shrink:0;"></span>
                        <span style="max-width:120px; color: white;" title="${escapeHTML(sub.nombre || '')}">${escapeHTML(nombreTruncado)}</span>
                        ${hereda ? '<span style="background:rgba(16,185,129,0.1); color:#10b981; padding:2px 6px; border-radius:12px; font-size:0.7rem; white-space:nowrap; flex-shrink:0;">HEREDA</span>' : ''}
                        ${!hereda && sub.color ? '<span style="background:rgba(249,115,22,0.1); color:#f97316; padding:2px 6px; border-radius:12px; font-size:0.7rem; white-space:nowrap; flex-shrink:0;">PROPIO</span>' : ''}
                    </div>
                </td>
                <td style="padding: 12px; border-bottom: 1px solid rgba(255,255,255,0.05); color: var(--color-text-secondary); vertical-align: middle; font-size: 0.85rem;">
                    <span style="max-width:200px; word-break: break-word; white-space: normal; line-height: 1.4;" title="${escapeHTML(sub.descripcion || '')}">${escapeHTML(descripcionTruncada) || '-'}</span>
                </td>
                <td style="padding: 12px; border-bottom: 1px solid rgba(255,255,255,0.05); color: var(--color-text-secondary); vertical-align: middle; font-size: 0.85rem;">
                    <div style="display: flex; align-items: center; gap: 4px;">
                        <span style="display:inline-block; width:16px; height:16px; background-color: ${colorSub}; border-radius: 6px;"></span>
                        <span style="color: var(--color-text-dim); font-size: 0.7rem; white-space: nowrap;">${colorSub}</span>
                    </div>
                </td>
                <td style="padding: 12px; border-bottom: 1px solid rgba(255,255,255,0.05); color: var(--color-text-secondary); vertical-align: middle; font-size: 0.85rem;">
                    <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                        <button class="btn" onclick="window.verDetallesSubcategoria('${categoriaId}', '${sub.id}', event)" title="Ver detalles">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="btn" onclick="window.editarSubcategoria('${categoriaId}', '${sub.id}', event)" title="Editar">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-danger" onclick="window.eliminarSubcategoria('${categoriaId}', '${sub.id}', event)" title="Eliminar">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });

    html += `
                </tbody>
            </table>
        </div>
    `;

    container.innerHTML = html;
}

// =============================================
// UTILIDADES
// =============================================
function toggleSubcategorias(categoriaId) {
    const row = document.getElementById(`sub-${categoriaId}`);
    const icon = document.querySelector(`.categoria-row[data-id="${categoriaId}"] .toggle-icon i`);

    if (!row || !icon) return;

    if (categoriaExpandidaId && categoriaExpandidaId !== categoriaId) {
        const prevRow = document.getElementById(`sub-${categoriaExpandidaId}`);
        const prevIcon = document.querySelector(`.categoria-row[data-id="${categoriaExpandidaId}"] .toggle-icon i`);
        if (prevRow) prevRow.style.display = 'none';
        if (prevIcon) {
            prevIcon.classList.remove('fa-chevron-down');
            prevIcon.classList.add('fa-chevron-right');
        }
    }

    if (row.style.display === 'none') {
        row.style.display = 'table-row';
        icon.classList.remove('fa-chevron-right');
        icon.classList.add('fa-chevron-down');
        categoriaExpandidaId = categoriaId;
    } else {
        row.style.display = 'none';
        icon.classList.remove('fa-chevron-down');
        icon.classList.add('fa-chevron-right');
        categoriaExpandidaId = null;
    }
}

function escapeHTML(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function mostrarError(mensaje) {
    const tbody = document.getElementById('tablaCategoriasBody');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align:center; padding:40px;">
                    <div style="color: #ef4444;">
                        <i class="fas fa-exclamation-circle" style="font-size: 48px; margin-bottom: 16px;"></i>
                        <h5>Error</h5>
                        <p>${escapeHTML(mensaje)}</p>
                        <button class="btn-nueva-categoria-header" onclick="location.reload()" style="margin-top: 16px;">
                            <i class="fas fa-sync-alt"></i> Reintentar
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }
}

function mostrarErrorInicializacion() {
    const tbody = document.getElementById('tablaCategoriasBody');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align:center; padding:40px;">
                    <div style="color: #ef4444;">
                        <i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 16px;"></i>
                        <h5>Error de inicialización</h5>
                        <p>No se pudo cargar el módulo de categorías.</p>
                        <button class="btn-nueva-categoria-header" onclick="location.reload()" style="margin-top: 16px;">
                            <i class="fas fa-sync-alt"></i> Reintentar
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }
}

// =============================================
// INICIALIZACIÓN
// =============================================
document.addEventListener('DOMContentLoaded', async function () {
    await inicializarCategoriaManager();
});